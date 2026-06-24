// Free-plan voice path. ElevenLabs blocks API voice DESIGN/cloning on free tiers
// (/v1/text-to-voice/design returns 403 feature_not_available), so gen_npc_voices.mjs
// cannot run there. But text-to-speech with the built-in PREMADE voices IS allowed on
// free. This assigns each NPC a premade voice your key can actually use (read live from
// /v1/voices, bucketed by gender, round-robined for variety) and writes voice_ids.json,
// so gen_npc_lines.mjs (npm run voices:lines) can synthesize on a free plan. No custom
// voices are created and no voice slots are consumed.
//
//   ELEVENLABS_API_KEY=... node scripts/voices_premade.mjs [--only a,b,c] [--limit N]
//
// Assigns every prompt by default; --only / --limit scope the subset (same flags as
// gen_npc_voices.mjs). The key is read from the environment or a local .env (never
// commit it). NOTE: this OVERWRITES scripts/voices/voice_ids.json with premade ids for
// your account; do not commit that change (it would clobber the maintainer's custom
// voices). Restore later with: git checkout scripts/voices/voice_ids.json
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { VOICE_PROMPTS } from './voices/npc_voice_prompts.mjs';

const API = 'https://api.elevenlabs.io';
const root = process.cwd();
const idsPath = path.join(root, 'scripts/voices/voice_ids.json');

try { process.loadEnvFile(); } catch { /* no .env — rely on the ambient env */ }
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('ELEVENLABS_API_KEY is not set (env or .env). Aborting.');
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}
const onlyArg = argValue('--only');
const onlyIds = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const limitArg = argValue('--limit');
const limit = limitArg !== null ? Number(limitArg) : null;

let work = VOICE_PROMPTS;
if (onlyIds) work = work.filter((p) => onlyIds.has(p.npcId));
if (limit !== null && Number.isFinite(limit)) work = work.slice(0, limit);
if (work.length === 0) {
  console.error('No NPCs selected (check --only / --limit). Aborting.');
  process.exit(1);
}

// List the voices this key can use (premade library + anything in the account).
// Allowed on the free plan, unlike voice creation.
const res = await fetch(`${API}/v1/voices`, { headers: { 'xi-api-key': KEY } });
if (!res.ok) {
  console.error(`GET /v1/voices -> ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
  process.exit(1);
}
const voices = (await res.json()).voices ?? [];
if (voices.length === 0) {
  console.error('No voices available on this account. Aborting.');
  process.exit(1);
}

const genderOf = (v) => (v.labels?.gender ?? '').toLowerCase();
const male = voices.filter((v) => genderOf(v) === 'male');
const female = voices.filter((v) => genderOf(v) === 'female');

// Each prompt declares its gender in the voiceDescription ("... Male." / "Female.").
function promptGender(p) {
  if (/female/i.test(p.voiceDescription)) return 'female';
  if (/\bmale\b/i.test(p.voiceDescription)) return 'male';
  return 'any';
}
function pick(pool, i) {
  const list = pool.length ? pool : voices;
  return list[i % list.length];
}

const ids = {};
let mi = 0; let fi = 0; let ai = 0;
for (const p of work) {
  const g = promptGender(p);
  const v = g === 'female' ? pick(female, fi++) : g === 'male' ? pick(male, mi++) : pick(voices, ai++);
  ids[p.npcId] = v.voice_id;
  console.log(`${p.npcId.padEnd(22)} -> ${v.name} (${g}, ${v.voice_id})`);
}

mkdirSync(path.dirname(idsPath), { recursive: true });
writeFileSync(idsPath, `${JSON.stringify(ids, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(ids).length} premade-voice assignments to ${path.relative(root, idsPath)}`);
console.log('Next: npm run voices:lines   (mind the free ~10k chars/month TTS quota; scope with --only <id>)');
