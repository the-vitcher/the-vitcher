// End-to-end smoke test: loads the built extension into Chromium and exercises the
// service worker, the message plumbing, and the feed page.
//
// The Vitest specs cover core/ in isolation; this covers the parts they cannot,
// namely that the manifest is valid, the worker boots, and a mark round-trips into
// a rendered feed row with the lookback applied.
//
// Run from the repo root, after `npm run laugh:build`:
//   npm run laugh:smoke

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = dirname(fileURLToPath(import.meta.url));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!executablePath) {
  console.error('No Chromium found. Set CHROME_PATH to a Chrome or Chromium binary.');
  process.exit(1);
}

if (!existsSync(resolve(EXT, 'dist/service_worker.js'))) {
  console.error('laugh/dist is missing. Run `npm run laugh:build` first.');
  process.exit(1);
}

const VIDEO = {
  videoId: 'dQw4w9WgXcQ',
  title: 'A deadpan sketch',
  channelName: 'Funny One',
  durationSec: 600,
};

const failures = [];

function check(name, condition, detail = '') {
  if (!condition) failures.push(name);
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${!condition && detail ? ` :: ${detail}` : ''}`);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});

try {
  const workerTarget = await browser.waitForTarget((t) => t.type() === 'service_worker', { timeout: 15_000 });
  check('service worker registers', Boolean(workerTarget));

  const extensionId = new URL(workerTarget.url()).host;

  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/feed/feed.html`, { waitUntil: 'load' });

  const ask = (message) => page.evaluate((m) => chrome.runtime.sendMessage(m), message);
  const mark = (pressedAtSec) =>
    page.evaluate(
      (video, t) =>
        chrome.runtime.sendMessage({
          type: 'laugh:mark',
          pressedAtSec: t,
          video: { ...video, capturedAt: Date.now() },
        }),
      VIDEO,
      pressedAtSec,
    );

  const snapshot = await ask({ type: 'laugh:getSnapshot' });
  check('getSnapshot replies', snapshot?.ok === true, JSON.stringify(snapshot));
  check('starts empty', snapshot?.data?.moments?.length === 0);
  check('default lookback is 2.5s', snapshot?.data?.settings?.lookbackSec === 2.5);

  const first = await mark(100);
  check('mark replies', first?.ok === true, JSON.stringify(first));
  check('lookback rewinds 100s to 97.5s', first?.data?.moment?.tSec === 97.5, `got ${first?.data?.moment?.tSec}`);
  check('a lone press has intensity 1', first?.data?.intensity === 1);

  await mark(102);
  await mark(104);
  const fourth = await mark(106);
  check('a sustained laugh clusters to intensity 4', fourth?.data?.intensity === 4, `got ${fourth?.data?.intensity}`);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.video-card', { timeout: 5_000 });
  const rendered = await page.evaluate(() => ({
    cards: document.querySelectorAll('.video-card').length,
    moments: document.querySelectorAll('.moment').length,
    href: document.querySelector('.moment a')?.getAttribute('href'),
    label: document.querySelector('.moment a')?.textContent,
    title: document.querySelector('.video-title')?.textContent,
    profileShown: !document.getElementById('profile-panel')?.hidden,
  }));
  check('renders one video card', rendered.cards === 1, `got ${rendered.cards}`);
  check('four presses render as one moment', rendered.moments === 1, `got ${rendered.moments}`);
  check(
    'deep link targets the punchline',
    rendered.href === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=97s',
    rendered.href,
  );
  check('timestamp reads 1:37', rendered.label === '1:37', rendered.label);
  check('title comes through untouched', rendered.title === VIDEO.title);
  check('profile panel appears once there is data', rendered.profileShown === true);

  const retimed = await ask({
    type: 'laugh:saveSettings',
    settings: { lookbackSec: 0, clusterWindowSec: 8, showPlayerButton: true, inPageHotkey: true, apiKey: '' },
  });
  const tSecs = retimed?.data?.moments?.map((m) => m.tSec).sort((a, b) => a - b);
  check(
    'retuning the lookback re-times stored moments',
    JSON.stringify(tSecs) === JSON.stringify([100, 102, 104, 106]),
    JSON.stringify(tSecs),
  );
  // A retime changes no moment count, so a cache keyed only on the count would go
  // stale here while still reporting itself valid.
  check(
    'the profile recomputes after a retime rather than serving a stale cache',
    retimed?.data?.profile?.medianSecondsToFirstLaugh === 100,
    `medianSecondsToFirstLaugh = ${retimed?.data?.profile?.medianSecondsToFirstLaugh}`,
  );

  await ask({
    type: 'laugh:saveSettings',
    settings: { lookbackSec: 2.5, clusterWindowSec: 8, showPlayerButton: true, inPageHotkey: true, apiKey: 'SECRET123' },
  });
  const exported = await ask({ type: 'laugh:export' });
  check('export never carries the api key', !JSON.stringify(exported).includes('SECRET123'));
  check('export carries the moments', exported?.data?.moments?.length === 4);

  // Discovery, with no key: reports itself unavailable and never touches the network.
  const settings = (allowSearchQuota, apiKey) => ({
    lookbackSec: 2.5,
    clusterWindowSec: 8,
    showPlayerButton: true,
    inPageHotkey: true,
    allowSearchQuota,
    apiKey,
  });

  await ask({ type: 'laugh:saveSettings', settings: settings(false, '') });

  const suggestions = await ask({ type: 'laugh:getSuggestions' });
  check('getSuggestions replies', suggestions?.ok === true, JSON.stringify(suggestions));
  check('reports itself unconfigured without a key', suggestions?.data?.configured === false);
  check('no suggestions before a refresh', suggestions?.data?.ranked?.length === 0);

  const unkeyed = await ask({ type: 'laugh:refreshSuggestions' });
  check('refresh without a key is safe', unkeyed?.ok === true, JSON.stringify(unkeyed));
  check('refresh without a key spends no quota', unkeyed?.data?.quotaSpentToday === 0);
  check(
    'refresh without a key explains why',
    (unkeyed?.data?.notes ?? []).join(' ').includes('API key'),
    JSON.stringify(unkeyed?.data?.notes),
  );

  // With a key but no channel carrying a resolvable id, the guard must stop before
  // spending anything. The marked fixture video deliberately has no channelId, so
  // this path issues no request and needs no network.
  await ask({ type: 'laugh:saveSettings', settings: settings(false, 'not-a-real-key') });
  const keyed = await ask({ type: 'laugh:refreshSuggestions' });
  check('a configured key is reported', keyed?.data?.configured === true);
  check('spends nothing when no channel has a resolvable id', keyed?.data?.quotaSpentToday === 0);
  check(
    'says why it could not look',
    (keyed?.data?.notes ?? []).join(' ').includes('No channels with a known id'),
    JSON.stringify(keyed?.data?.notes),
  );

  for (const path of ['popup/popup.html', 'options/options.html']) {
    const tab = await browser.newPage();
    const errors = [];
    tab.on('pageerror', (error) => errors.push(String(error)));
    await tab.goto(`chrome-extension://${extensionId}/${path}`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 400));
    check(`${path} loads clean`, errors.length === 0, errors.join(' | '));
    await tab.close();
  }
} finally {
  await browser.close();
}

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} CHECK(S) FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
