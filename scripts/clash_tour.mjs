// The Clash (MOBA) playability tour: boot offline with ?clash=1, pick a hero from
// the select screen, learn an ability, watch minion waves march the three lanes,
// last-hit for gold, and recall home. Needs `npm run dev` on :5173.
// Writes tmp/clash_*.png screenshots.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!cond) fail++;
};

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

await page.goto(`${URL}/?clash=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-offline', { timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(200);
await page.type('#char-name', 'Clasher');
await page.evaluate(() => document.querySelector('#offline-select .mini-class[data-class="warrior"]')?.click());
await sleep(150);
await page.evaluate(() => document.querySelector('#btn-start-offline')?.click());
await page.waitForFunction(() => window.__game && window.__game.sim && window.__game.sim.player, { timeout: 60000 });
await sleep(1500);

// --- Match + hero select ---
const boot = await page.evaluate(() => {
  const sim = window.__game.sim;
  const st = sim.mobaState();
  return {
    state: st ? { phase: st.phase, myTeam: st.myTeam, heroId: st.heroId, points: st.skillPoints, towersA: st.towersA, towersB: st.towersB } : null,
    selectOpen: !document.querySelector('#moba-hero-select')?.hidden,
    heroCards: document.querySelectorAll('#moba-hero-grid [data-hero]').length,
  };
});
check('match live on boot', !!boot.state, JSON.stringify(boot.state));
check('seated on a team', boot.state?.myTeam === 'A' || boot.state?.myTeam === 'B');
check('12 towers standing (6 vs 6)', boot.state?.towersA === 6 && boot.state?.towersB === 6);
check('hero select opened', boot.selectOpen);
check('all 10 heroes offered', boot.heroCards === 10, `${boot.heroCards}`);
await page.screenshot({ path: 'tmp/clash_01_hero_select.png' });

// --- Pick Snacko ---
await page.evaluate(() => document.querySelector('#moba-hero-grid [data-hero="snacko"]')?.click());
await sleep(400);
const picked = await page.evaluate(() => {
  const sim = window.__game.sim;
  const st = sim.mobaState();
  return { heroId: st?.heroId, points: st?.skillPoints, selectClosed: !!document.querySelector('#moba-hero-select')?.hidden, level: sim.player.level };
});
check('picked Snacko at level 1 with 1 skill point', picked.heroId === 'snacko' && picked.level === 1 && picked.points === 1, JSON.stringify(picked));

// --- Learn Pan Smash via the skill strip's + button ---
await sleep(300);
const learnBtn = await page.evaluate(() => {
  const btn = document.querySelector('#moba-skills [data-learn]');
  return btn ? btn.getAttribute('data-learn') : null;
});
check('learn button offered', !!learnBtn, String(learnBtn));
await page.evaluate(() => document.querySelector('#moba-skills [data-learn]')?.click());
await sleep(300);
const learned = await page.evaluate(() => {
  const sim = window.__game.sim;
  const st = sim.mobaState();
  return { known: sim.known.map((k) => k.def.id), points: st?.skillPoints, ranks: st?.skillRanks };
});
check('ability learned onto the bar', learned.known.length === 1 && learned.points === 0, JSON.stringify(learned));
await page.screenshot({ path: 'tmp/clash_02_learned.png' });

// --- Fast-forward through warmup + first wave (pump sim ticks) ---
await page.evaluate(() => { const sim = window.__game.sim; for (let i = 0; i < 20 * 25; i++) sim.tick(); });
await sleep(800);
const wave = await page.evaluate(() => {
  const sim = window.__game.sim;
  const minions = [...sim.entities.values()].filter((e) => e.kind === 'mob' && !e.dead && (e.templateId === 'moba_minion_melee' || e.templateId === 'moba_minion_ranged'));
  const lanes = new Set(minions.map((m) => m.mobaLane));
  const teams = new Set(minions.map((m) => m.mobaTeam));
  const keepers = [...sim.entities.values()].filter((e) => e.kind === 'npc' && e.templateId === 'moba_shopkeeper');
  return { minions: minions.length, lanes: [...lanes].sort(), teams: [...teams].sort(), shopkeepers: keepers.length, phase: sim.mobaState()?.phase };
});
check('minion waves marching', wave.minions >= 20, `${wave.minions} live`);
check('all three lanes populated', wave.lanes.length === 3, JSON.stringify(wave.lanes));
check('both teams spawning', wave.teams.length === 2, JSON.stringify(wave.teams));
check('shopkeepers at both bases', wave.shopkeepers === 2);
check('match playing', wave.phase === 'playing');

// --- Last-hit a minion for instant gold ---
const gold = await page.evaluate(() => {
  const sim = window.__game.sim;
  const p = sim.player;
  const before = sim.copper;
  const minion = [...sim.entities.values()].find((e) => e.kind === 'mob' && !e.dead && e.mobaTeam && e.mobaTeam !== p.mobaTeam && e.templateId?.startsWith('moba_minion'));
  if (!minion) return { before, after: before, found: false };
  minion.hp = 1;
  sim.dealDamage(p, minion, 10, false, 'physical', null, 'hit');
  return { before, after: sim.copper, found: true, dead: minion.dead };
});
check('last-hit pays instant gold', gold.found && gold.dead && gold.after > gold.before, JSON.stringify(gold));

// --- Watch the lane fight, screenshot over mid ---
await page.evaluate(() => { const sim = window.__game.sim; for (let i = 0; i < 20 * 10; i++) sim.tick(); });
await sleep(1200);
await page.screenshot({ path: 'tmp/clash_03_lane.png' });

// --- Recall: walk out, channel home ---
const recall = await page.evaluate(() => {
  const sim = window.__game.sim;
  const p = sim.player;
  const homeZ = p.pos.z;
  p.pos = { ...p.pos, z: p.pos.z + 40 };
  p.prevPos = { ...p.pos };
  sim.mobaRecall();
  const midChannel = sim.mobaState()?.recallLeft ?? 0;
  for (let i = 0; i < 20 * 8; i++) sim.tick();
  return { midChannel, backHome: Math.abs(p.pos.z - homeZ) < 4, hpFull: p.hp === p.maxHp };
});
check('recall channels and ports home healed', recall.midChannel > 0 && recall.backHome && recall.hpFull, JSON.stringify(recall));

// --- Win condition: raze mid lane + core, expect the banner ---
const win = await page.evaluate(() => {
  const sim = window.__game.sim;
  const p = sim.player;
  const match = sim.mobaMatch;
  const enemy = p.mobaTeam === 'A' ? 'B' : 'A';
  const towers = enemy === 'A' ? match.towersA : match.towersB;
  for (const laneIds of towers) for (const id of laneIds) { const t = sim.entities.get(id); if (t && !t.dead) { t.hp = 0; sim.handleDeath(t, p); } }
  const core = sim.entities.get(enemy === 'A' ? match.coreA : match.coreB);
  core.hp = 0; sim.handleDeath(core, p);
  for (let i = 0; i < 10; i++) sim.tick();
  return { phase: match.phase, winner: match.winner, myTeam: p.mobaTeam };
});
await page.waitForFunction(() => {
  const el = document.querySelector('#moba-banner');
  return !!el && !el.hidden && (el.textContent ?? '').length > 0;
}, { timeout: 8000 }).catch(() => {});
const banner = await page.evaluate(() => {
  const el = document.querySelector('#moba-banner');
  return { visible: !!el && !el.hidden, text: el?.textContent, cls: el?.className };
});
check('match ends with my team winning', win.phase === 'ended' && win.winner === win.myTeam, JSON.stringify(win));
check('victory banner shows', banner.visible && banner.cls.includes('victory'), JSON.stringify(banner));
await page.screenshot({ path: 'tmp/clash_04_victory.png' });

console.log(errors.length ? `\nPAGE ERRORS:\n${errors.slice(0, 8).join('\n')}` : '\nno page errors');
await browser.close();
process.exit(fail > 0 ? 1 : 0);
