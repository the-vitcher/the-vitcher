// Settings. Saves are debounced and go through the worker, which re-times existing
// moments when the lookback changes.

import { send } from '../ext/messages';
import { DEFAULT_SETTINGS, type Settings } from '../core/types';
import { byId } from '../ui/dom';

const SAVE_DEBOUNCE_MS = 250;

let settings: Settings = { ...DEFAULT_SETTINGS };
let saveTimer: number | undefined;

const lookback = byId<HTMLInputElement>('lookback');
const lookbackValue = byId('lookback-value');
const cluster = byId<HTMLInputElement>('cluster');
const clusterValue = byId('cluster-value');
const showButton = byId<HTMLInputElement>('show-button');
const inPageHotkey = byId<HTMLInputElement>('in-page-hotkey');
const apiKey = byId<HTMLInputElement>('api-key');
const saved = byId('saved');

function paint(): void {
  if (lookback) lookback.value = String(settings.lookbackSec);
  if (lookbackValue) {
    lookbackValue.textContent =
      settings.lookbackSec === 0 ? 'off' : `${settings.lookbackSec.toFixed(1)}s back`;
  }
  if (cluster) cluster.value = String(settings.clusterWindowSec);
  if (clusterValue) {
    clusterValue.textContent = settings.clusterWindowSec === 0 ? 'off' : `${settings.clusterWindowSec}s`;
  }
  if (showButton) showButton.checked = settings.showPlayerButton;
  if (inPageHotkey) inPageHotkey.checked = settings.inPageHotkey;
  if (apiKey && document.activeElement !== apiKey) apiKey.value = settings.apiKey;
}

function flashSaved(): void {
  if (!saved) return;
  saved.classList.add('show');
  setTimeout(() => saved.classList.remove('show'), 900);
}

function queueSave(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const reply = await send({ type: 'laugh:saveSettings', settings });
    if (reply.ok) {
      settings = reply.data.settings;
      paint();
      flashSaved();
    }
  }, SAVE_DEBOUNCE_MS) as unknown as number;
}

function update(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  paint();
  queueSave();
}

lookback?.addEventListener('input', () => update({ lookbackSec: Number(lookback.value) }));
cluster?.addEventListener('input', () => update({ clusterWindowSec: Number(cluster.value) }));
showButton?.addEventListener('change', () => update({ showPlayerButton: showButton.checked }));
inPageHotkey?.addEventListener('change', () => update({ inPageHotkey: inPageHotkey.checked }));
apiKey?.addEventListener('input', () => update({ apiKey: apiKey.value }));

byId('open-feed')?.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('feed/feed.html') });
});

void (async () => {
  const reply = await send({ type: 'laugh:getSnapshot' });
  if (reply.ok) settings = reply.data.settings;
  paint();
})();
