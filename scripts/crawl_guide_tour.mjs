// Tour of the new Crawl features: the Guide Room (meet Sotreel, open his dialog)
// and die-once -> spectator. Needs `npm run dev` on :5173. Writes tmp/guide_*.png.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-offline', { timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(200);
await page.type('#char-name', 'Crawler');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await page.waitForFunction(() => window.__game && window.__game.sim && window.__game.sim.player, { timeout: 60000 });
await sleep(1500);

await page.evaluate(() => {
  const sim = window.__game.sim;
  if (typeof sim.setPlayerLevel === 'function') sim.setPlayerLevel(20);
});

// --- Guide Room: enter, walk up to Sotreel, open his dialog ---
await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.enterDungeon('crawl_guide_room');
});
await sleep(1500);
const guide = await page.evaluate(() => {
  const sim = window.__game.sim;
  const p = sim.player;
  let npc = null;
  for (const e of sim.entities.values()) {
    if (e.templateId === 'crawl_guide_sotreel') npc = e;
  }
  if (npc) {
    p.pos.x = npc.pos.x + 2; p.pos.z = npc.pos.z - 2;
    p.facing = Math.atan2(npc.pos.x - p.pos.x, npc.pos.z - p.pos.z);
    window.__game.input.camYaw = p.facing;
    sim.targetEntity(npc.id);
  }
  return npc ? { name: npc.name, x: Math.round(npc.pos.x), z: Math.round(npc.pos.z) } : null;
});
console.log('Guide NPC in room:', JSON.stringify(guide));
await sleep(600);
await page.keyboard.press('f'); // interact -> open Sotreel's gossip dialog
await sleep(800);
await page.screenshot({ path: 'tmp/guide_01_sotreel.png' });
const dialog = await page.evaluate(() => {
  const t = document.querySelector('#quest-dialog .qd-text');
  return t ? t.textContent.slice(0, 120) : null;
});
console.log('Sotreel dialog open:', JSON.stringify(dialog));

// --- Die once -> spectator (enable crawl mode at runtime, then take a lethal hit) ---
const spec = await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.cfg.crawlMode = true; // this offline session is now a Crawl run
  const p = sim.player;
  const before = { spectator: !!p.spectator, dead: p.dead };
  sim.handleDeath(p, null); // simulate a death
  return { before, after: { spectator: !!p.spectator, dead: p.dead, isSpectator: sim.isSpectator() } };
});
console.log('Die -> spectator:', JSON.stringify(spec));
// prove immunity: a spectator takes no damage
const immune = await page.evaluate(() => {
  const sim = window.__game.sim;
  const p = sim.player;
  const hp = p.hp;
  sim.dealDamage(null, p, 999999, false, 'physical', null, 'hit');
  return { hpBefore: hp, hpAfter: p.hp, immune: p.hp === hp };
});
console.log('Spectator immunity:', JSON.stringify(immune));
await sleep(400);
await page.screenshot({ path: 'tmp/guide_02_spectator.png' });

console.log(errors.length ? `\nPAGE ERRORS:\n${errors.slice(0, 8).join('\n')}` : '\nno page errors');
await browser.close();
