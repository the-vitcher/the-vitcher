// Build a single static page that plays every NPC voice clip under
// public/audio/voice, grouped by voice with its ElevenLabs design description.
// Output: public/voice-gallery.html (open it via `npm run dev` ->
// http://localhost:5173/voice-gallery.html, or on the deployed site at /voice-gallery.html).
//
// Pure dev tooling: reads the committed mp3s + VOICE_PROMPTS, writes one HTML file.
// Re-run with `npm run voices:gallery` whenever clips or descriptions change.

import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE_PROMPTS, voiceIdFor } from './voices/npc_voice_prompts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const voiceDir = path.join(root, 'public', 'audio', 'voice');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const promptById = new Map(VOICE_PROMPTS.map((p) => [p.npcId, p]));

// A readable label for a line key: greeting / quest offer+complete / yell line.
function clipLabel(file) {
  const key = file.replace(/\.mp3$/, '');
  if (key.startsWith('greeting__')) return 'Greeting';
  if (key.startsWith('yell__')) return 'Yell: ' + key.slice('yell__'.length).replace(/_/g, ' ');
  const m = key.match(/^quest__(.+)__(offer|complete)$/);
  if (m) return `Quest: ${m[1].replace(/_/g, ' ')} (${m[2]})`;
  return key.replace(/_/g, ' ');
}

if (!existsSync(voiceDir)) {
  console.error('no public/audio/voice directory; nothing to build');
  process.exit(1);
}

const dirs = readdirSync(voiceDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let totalClips = 0;
const sections = dirs.map((dir) => {
  const files = readdirSync(path.join(voiceDir, dir)).filter((f) => f.endsWith('.mp3')).sort();
  totalClips += files.length;
  const prompt = promptById.get(voiceIdFor(dir)) ?? promptById.get(dir);
  const name = prompt?.name ?? dir;
  const desc = prompt?.voiceDescription ?? '(no design description on file)';
  const rows = files.map((f) => `
        <div class="clip">
          <div class="clip-label">${esc(clipLabel(f))}</div>
          <audio controls preload="none" src="/audio/voice/${esc(dir)}/${esc(f)}"></audio>
        </div>`).join('');
  return `
      <section class="voice" id="${esc(dir)}">
        <h2>${esc(name)} <span class="vid">${esc(dir)}</span> <span class="count">${files.length} clips</span></h2>
        <p class="desc">${esc(desc)}</p>
        <div class="clips">${rows}
        </div>
      </section>`;
}).join('\n');

const toc = dirs.map((dir) => {
  const prompt = promptById.get(voiceIdFor(dir)) ?? promptById.get(dir);
  return `<a href="#${esc(dir)}">${esc(prompt?.name ?? dir)}</a>`;
}).join(' · ');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>World of ClaudeCraft - NPC Voice Gallery</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0c11; color: #e8e3d2; font: 15px/1.5 'Segoe UI', system-ui, sans-serif; }
  header { padding: 28px 24px 12px; border-bottom: 1px solid #2a2c33; position: sticky; top: 0; background: #0b0c11ee; backdrop-filter: blur(6px); }
  h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: 1px; color: #e0a23a; }
  .sub { color: #998d6a; font-size: 13px; }
  .toc { margin-top: 12px; font-size: 12.5px; line-height: 1.9; color: #8b8e99; }
  .toc a { color: #b8b3a0; text-decoration: none; } .toc a:hover { color: #e0a23a; }
  main { max-width: 980px; margin: 0 auto; padding: 12px 20px 80px; }
  .voice { padding: 22px 0; border-bottom: 1px solid #1d1f25; }
  h2 { font-size: 18px; margin: 0 0 6px; color: #c7cad4; }
  .vid { font-size: 11px; color: #6a6d78; font-family: ui-monospace, monospace; }
  .count { font-size: 11px; color: #7c1713; background: #2a1212; padding: 1px 7px; border-radius: 10px; margin-left: 6px; }
  .desc { color: #b0a98f; max-width: 70ch; margin: 0 0 14px; font-style: italic; }
  .clips { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px 18px; }
  .clip-label { font-size: 12px; color: #998d6a; margin-bottom: 3px; }
  audio { width: 100%; height: 34px; }
</style>
</head>
<body>
  <header>
    <h1>NPC Voice Gallery</h1>
    <div class="sub">${dirs.length} voices, ${totalClips} clips. ElevenLabs voice-design (eleven_multilingual_ttv_v2) + TTS (eleven_multilingual_v2). Each voice was designed from the italic description below.</div>
    <div class="toc">${toc}</div>
  </header>
  <main>
${sections}
  </main>
</body>
</html>
`;

const out = path.join(root, 'public', 'voice-gallery.html');
writeFileSync(out, html);
console.log(`wrote public/voice-gallery.html (${dirs.length} voices, ${totalClips} clips)`);
