// Content script entry: the only place that can read the player clock.
//
// Two paths reach markNow(): the browser-level command relayed by the service
// worker, and an in-page keydown fallback for when that command is unbound or
// conflicts with another extension. Both firing for one press is harmless, because
// the moment id is rounded to the second and the write upserts.

import { formatTimestamp } from '../../core/format';
import { normalizeSettings, STORAGE_KEYS } from '../../core/schema';
import { DEFAULT_SETTINGS, type Settings } from '../../core/types';
import { send } from '../messages';
import { findControlsBar, findVideoElement, currentVideoId, isEditableTarget, scrapeMetadata } from './player';
import { showToast } from './toast';

const BUTTON_ID = 'laugh-mark-button';
const NAV_POLL_MS = 1_000;

let settings: Settings = { ...DEFAULT_SETTINGS };
let lastHref = location.href;

async function loadSettings(): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  settings = normalizeSettings(stored[STORAGE_KEYS.settings]);
}

async function markNow(): Promise<void> {
  const videoId = currentVideoId();
  if (!videoId) {
    showToast({ label: 'Laugh only works on a video page', error: true });
    return;
  }

  const video = findVideoElement();
  if (!video) {
    showToast({ label: 'No player found on this page', error: true });
    return;
  }

  const meta = scrapeMetadata(videoId, video, Date.now());
  const reply = await send({ type: 'laugh:mark', video: meta, pressedAtSec: video.currentTime });

  if (!reply.ok) {
    showToast({ label: reply.error, error: true });
    return;
  }

  showToast({
    label: 'Laugh saved',
    time: formatTimestamp(reply.data.moment.tSec),
    streak: reply.data.intensity,
  });
}

function buildButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.className = 'ytp-button';
  button.type = 'button';
  button.title = 'Mark this moment as funny';
  button.setAttribute('aria-label', 'Mark this moment as funny');
  button.style.cssText = 'width:40px;height:100%;opacity:0.9;font-size:17px;line-height:1;';
  button.textContent = 'ha';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void markNow();
  });
  return button;
}

function syncButton(): void {
  const existing = document.getElementById(BUTTON_ID);

  if (!settings.showPlayerButton) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const controls = findControlsBar();
  if (!controls) return;
  // Leftmost of the right-hand cluster, so it does not displace fullscreen.
  controls.prepend(buildButton());
}

function onKeyDown(event: KeyboardEvent): void {
  if (!settings.inPageHotkey) return;
  if (!event.ctrlKey && !event.metaKey) return;
  if (!event.shiftKey) return;
  if (event.key.toLowerCase() !== 'l') return;
  if (isEditableTarget(event.target)) return;

  event.preventDefault();
  event.stopPropagation();
  void markNow();
}

/**
 * YouTube is a single page app: navigating between videos fires no page load, so the
 * injected button has to be re-attached and the poll covers navigations that do not
 * emit the event.
 */
function watchForNavigation(): void {
  const onNavigated = () => {
    lastHref = location.href;
    // The player rebuilds asynchronously after the URL changes.
    setTimeout(syncButton, 300);
    setTimeout(syncButton, 1_200);
  };

  document.addEventListener('yt-navigate-finish', onNavigated);

  setInterval(() => {
    if (location.href !== lastHref) onNavigated();
    else syncButton();
  }, NAV_POLL_MS);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string })?.type !== 'laugh:requestMark') return;
  void markNow().then(() => sendResponse({ ok: true }));
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEYS.settings]) return;
  settings = normalizeSettings(changes[STORAGE_KEYS.settings].newValue);
  syncButton();
});

document.addEventListener('keydown', onKeyDown, true);

void loadSettings().then(() => {
  syncButton();
  watchForNavigation();
});
