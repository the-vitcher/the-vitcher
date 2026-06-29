// Visual tour of The Crawl: boots the offline client, levels the player, enters
// the Crawl chain, descends floors, and screenshots the bespoke monsters + bosses.
// Needs `npm run dev` on :5173. Writes PNGs to tmp/crawl_*.png.
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

// Max-level the player and keep it topped up so the deadly floors don't kill the camera.
await page.evaluate(() => {
  const sim = window.__game.sim;
  if (typeof sim.setPlayerLevel === 'function') sim.setPlayerLevel(20);
  window.__crawlKeepAlive = setInterval(() => {
    const p = window.__game.sim.player;
    p.maxHp = 999999; p.hp = 999999;
    if (p.resourceType === 'mana') { p.maxResource = 99999; p.resource = 99999; }
  }, 100);
});

// Helper: enter a floor, face into the room, settle, screenshot, and report what spawned.
async function visitFloor(floorId, file, label) {
  const info = await page.evaluate((id) => {
    const sim = window.__game.sim;
    sim.enterDungeon(id);
    const p = sim.player;
    p.facing = 0; // look down +z into the room
    window.__game.input.camYaw = 0;
    return { x: Math.round(p.pos.x), z: Math.round(p.pos.z) };
  }, floorId);
  await sleep(1800);
  const mobs = await page.evaluate(() => {
    const sim = window.__game.sim;
    const out = {};
    for (const e of sim.entities.values()) {
      if (e.kind === 'mob' && !e.dead && e.pos.x > 600) out[e.name] = (out[e.name] ?? 0) + 1;
    }
    return out;
  });
  await page.screenshot({ path: file });
  console.log(`${label}: entry=(${info.x},${info.z}) mobs=${JSON.stringify(mobs)}`);
  return mobs;
}

await visitFloor('crawl_floor_1', 'tmp/crawl_01_floor1.png', 'Floor 1');

// Fight the nearest bespoke mob on floor 1 for a combat shot.
await page.evaluate(() => {
  const sim = window.__game.sim;
  const p = sim.player;
  let near = null, d = 1e9;
  for (const e of sim.entities.values()) {
    if (e.kind === 'mob' && !e.dead && e.pos.x > 600) {
      const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (dd < d) { d = dd; near = e; }
    }
  }
  if (near) {
    p.pos.x = near.pos.x + 3; p.pos.z = near.pos.z;
    p.facing = Math.atan2(near.pos.x - p.pos.x, near.pos.z - p.pos.z);
    window.__game.input.camYaw = p.facing;
    sim.targetEntity(near.id);
    sim.startAutoAttack();
    window.__crawlTarget = near.id;
  }
});
await sleep(1600);
await page.screenshot({ path: 'tmp/crawl_02_combat.png' });
const targetName = await page.evaluate(() => {
  const t = window.__game.sim.entities.get(window.__crawlTarget);
  return t ? { name: t.name, level: t.level } : null;
});
console.log('Combat target:', JSON.stringify(targetName));

// Descend to a mid floor and the finale.
await visitFloor('crawl_floor_4', 'tmp/crawl_03_floor4.png', 'Floor 4');
await visitFloor('crawl_floor_7', 'tmp/crawl_04_floor7.png', 'Floor 7 (finale)');

// Target the finale boss to show the nameplate/target frame with its bespoke name.
const boss = await page.evaluate(() => {
  const sim = window.__game.sim;
  const p = sim.player;
  let b = null;
  for (const e of sim.entities.values()) {
    if (e.templateId === 'crawl_boss_showrunner' && !e.dead) b = e;
  }
  if (b) {
    p.pos.x = b.pos.x; p.pos.z = b.pos.z - 9;
    p.facing = Math.atan2(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
    window.__game.input.camYaw = p.facing;
    sim.targetEntity(b.id);
    return { name: b.name, level: b.level, hp: b.hp, maxHp: b.maxHp };
  }
  return null;
});
await sleep(1500);
await page.screenshot({ path: 'tmp/crawl_05_showrunner.png' });
console.log('Finale boss:', JSON.stringify(boss));

console.log(errors.length ? `\nPAGE ERRORS:\n${errors.slice(0, 10).join('\n')}` : '\nno page errors');
await browser.close();
