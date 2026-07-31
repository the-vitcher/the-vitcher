// Toolbar popup: a glance at the profile, plus a mark button for when the hotkey is
// taken by something else.

import { clusterMoments } from '../core/cluster';
import { send } from '../ext/messages';
import { parseVideoId } from '../core/video_id';
import { byId, el, replace } from '../ui/dom';

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function render(): Promise<void> {
  const reply = await send({ type: 'laugh:getSnapshot' });
  if (!reply.ok) {
    replace(byId('summary'), reply.error);
    return;
  }

  const { moments, settings, profile } = reply.data;
  const episodes = clusterMoments(moments, settings.clusterWindowSec);

  replace(
    byId('summary'),
    episodes.length === 0
      ? 'No laughs marked yet.'
      : `${episodes.length} ${episodes.length === 1 ? 'laugh' : 'laughs'} across ${profile.videoCount} ${
          profile.videoCount === 1 ? 'video' : 'videos'
        }`,
  );

  replace(
    byId('channels'),
    ...profile.channels.slice(0, 4).map((channel) => el('span', { class: 'chip', text: channel.channelName })),
  );
}

async function setUpMarkButton(): Promise<void> {
  const button = byId<HTMLButtonElement>('mark');
  const hint = byId('hint');
  if (!button) return;

  const tab = await activeTab();
  const onVideo = Boolean(parseVideoId(tab?.url));

  button.disabled = !onVideo;
  if (hint) {
    hint.textContent = onVideo
      ? 'Shortcut: Ctrl+Shift+L (Command+Shift+L on a Mac)'
      : 'Open a YouTube video to mark a moment.';
  }

  button.addEventListener('click', async () => {
    if (typeof tab?.id !== 'number') return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'laugh:requestMark' });
      window.close();
    } catch {
      if (hint) hint.textContent = 'Reload the video tab, then try again.';
    }
  });
}

byId('feed')?.addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('feed/feed.html') });
  window.close();
});

byId('options')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});

void render();
void setUpMarkButton();
