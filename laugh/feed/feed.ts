// The funny feed: every moment you marked, grouped by video, each one a deep link
// back to the exact second.

import { clusterMoments, groupByVideo, type VideoGroup } from '../core/cluster';
import { formatHour, formatRelativeTime, formatTimestamp, thumbnailUrl, watchUrl } from '../core/format';
import { funniestHour } from '../core/profile';
import { surfacingReadiness } from '../core/scoring';
import { channelKey } from '../core/metadata';
import type { Snapshot, SuggestionsView } from '../ext/messages';
import { send } from '../ext/messages';
import type { TasteProfile } from '../core/types';
import { byId, downloadJson, el, replace } from '../ui/dom';

type SortMode = 'recent' | 'laughs' | 'title';

let snapshot: Snapshot | null = null;
let sortMode: SortMode = 'recent';
let channelFilter = '';

async function load(): Promise<void> {
  const reply = await send({ type: 'laugh:getSnapshot' });
  if (!reply.ok) {
    replace(byId('feed'), el('p', { class: 'empty', text: reply.error }));
    return;
  }
  snapshot = reply.data;
  render();
}

function sortGroups(groups: VideoGroup[]): VideoGroup[] {
  const sorted = [...groups];
  if (sortMode === 'laughs') sorted.sort((a, b) => b.totalMoments - a.totalMoments || b.lastMarkedAt - a.lastMarkedAt);
  else if (sortMode === 'title') sorted.sort((a, b) => a.video.title.localeCompare(b.video.title));
  else sorted.sort((a, b) => b.lastMarkedAt - a.lastMarkedAt);
  return sorted;
}

function renderStats(groups: VideoGroup[], episodeCount: number): void {
  const moments = snapshot?.moments.length ?? 0;
  replace(
    byId('stats'),
    `${episodeCount} ${episodeCount === 1 ? 'laugh' : 'laughs'} across ${groups.length} ${
      groups.length === 1 ? 'video' : 'videos'
    } (${moments} ${moments === 1 ? 'press' : 'presses'})`,
  );
}

function renderProfile(profile: TasteProfile): void {
  const panel = byId('profile-panel');
  if (!panel) return;

  if (profile.episodeCount === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const peak = funniestHour(profile);
  const peakCount = peak === null ? 0 : profile.hourHistogram[peak];
  const maxHour = Math.max(1, ...profile.hourHistogram);

  const channels = el(
    'div',
    {},
    el('div', { class: 'metric-label', text: 'Channels you laugh at' }),
    el(
      'div',
      { class: 'chips' },
      ...profile.channels
        .slice(0, 8)
        .map((channel) =>
          el(
            'span',
            { class: 'chip' },
            channel.channelName,
            el('span', { class: 'count', text: `${channel.episodes}` }),
          ),
        ),
    ),
  );

  const terms = el(
    'div',
    {},
    el('div', { class: 'metric-label', text: 'What your laughs have in common' }),
    el(
      'div',
      { class: 'chips' },
      ...profile.terms.slice(0, 12).map((term) => el('span', { class: 'chip', text: term.term })),
    ),
  );

  const rhythm = el(
    'div',
    {},
    el('div', { class: 'metric', text: profile.medianLaughsPerVideo.toFixed(1) }),
    el('div', { class: 'metric-label', text: 'median laughs per video' }),
    el('div', { class: 'metric', text: formatTimestamp(profile.medianSecondsToFirstLaugh) }),
    el('div', { class: 'metric-label', text: 'median time to your first laugh' }),
  );

  const readiness = surfacingReadiness(profile, Date.now());

  const clock = el(
    'div',
    {},
    el('div', { class: 'metric', text: peak === null ? '-' : formatHour(peak) }),
    el('div', {
      class: 'metric-label',
      text: peakCount > 0 ? `your funniest hour (${peakCount} marked)` : 'your funniest hour',
    }),
    el('div', { class: 'metric-label', text: `Right now: ${readiness.reason.toLowerCase()}` }),
    el(
      'div',
      { class: 'hour-bars' },
      ...profile.hourHistogram.map((count, hour) =>
        el('span', {
          class: hour === peak ? 'peak' : '',
          style: `height:${Math.max(2, (count / maxHour) * 40)}px`,
          title: `${formatHour(hour)}: ${count}`,
        }),
      ),
    ),
  );

  replace(
    panel,
    el('h2', { text: 'Your taste' }),
    el('div', { class: 'profile-grid' }, channels, terms, rhythm, clock),
  );
}

function renderChannelFilter(groups: VideoGroup[]): void {
  const select = byId<HTMLSelectElement>('channel-filter');
  if (!select) return;

  const names = new Map<string, string>();
  for (const group of groups) names.set(channelKey(group.video), group.video.channelName);

  const previous = channelFilter;
  replace(
    select,
    el('option', { value: '', text: 'All channels' }),
    ...[...names.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, name]) => el('option', { value: key, text: name })),
  );
  select.value = previous;
}

function renderGroup(group: VideoGroup): HTMLElement {
  const moments = el(
    'div',
    { class: 'moment-list' },
    ...group.episodes.map((episode) =>
      el(
        'span',
        { class: 'moment' },
        el('a', {
          href: watchUrl(group.videoId, episode.tSec),
          target: '_blank',
          rel: 'noreferrer',
          text: formatTimestamp(episode.tSec),
        }),
        episode.intensity > 1 ? el('span', { class: 'intensity', text: `x${episode.intensity}` }) : null,
        el('button', {
          type: 'button',
          title: 'Remove this moment',
          'aria-label': `Remove the moment at ${formatTimestamp(episode.tSec)}`,
          'data-moment-ids': episode.moments.map((m) => m.id).join(','),
          text: 'x',
        }),
      ),
    ),
  );

  return el(
    'article',
    { class: 'video-card' },
    el('img', { src: thumbnailUrl(group.videoId), alt: '', loading: 'lazy' }),
    el(
      'div',
      {},
      el('a', {
        class: 'video-title',
        href: watchUrl(group.videoId, group.episodes[0]?.tSec ?? 0),
        target: '_blank',
        rel: 'noreferrer',
        text: group.video.title,
      }),
      el('div', {
        class: 'video-meta',
        text: `${group.video.channelName} - last laugh ${formatRelativeTime(group.lastMarkedAt, Date.now())}`,
      }),
      moments,
    ),
    el(
      'div',
      { class: 'card-actions' },
      el('button', { class: 'button danger', type: 'button', 'data-delete-video': group.videoId, text: 'Remove' }),
    ),
  );
}

function render(): void {
  if (!snapshot) return;

  const episodes = clusterMoments(snapshot.moments, snapshot.settings.clusterWindowSec);
  const allGroups = groupByVideo(episodes);

  renderProfile(snapshot.profile);
  renderChannelFilter(allGroups);
  renderStats(allGroups, episodes.length);

  const visible = channelFilter
    ? allGroups.filter((group) => channelKey(group.video) === channelFilter)
    : allGroups;

  const empty = byId('empty');
  if (empty) empty.hidden = visible.length > 0;

  replace(byId('feed'), ...sortGroups(visible).map(renderGroup));
}

function renderSuggestions(view: SuggestionsView): void {
  const host = byId('suggestions');
  const quota = byId('quota');
  if (!host) return;

  if (!view.configured) {
    replace(
      host,
      el('p', {
        class: 'note',
        text: 'Add a YouTube Data API key in settings and Laugh can go looking for videos that match your profile.',
      }),
    );
    replace(quota, '');
    return;
  }

  const rows = view.ranked.slice(0, 12).map((entry) =>
    el(
      'article',
      { class: 'suggestion' },
      el('img', { src: thumbnailUrl(entry.candidate.videoId), alt: '', loading: 'lazy' }),
      el(
        'div',
        {},
        el('a', {
          class: 'video-title',
          href: `https://www.youtube.com/watch?v=${entry.candidate.videoId}`,
          target: '_blank',
          rel: 'noreferrer',
          text: entry.candidate.title,
        }),
        el('div', { class: 'video-meta', text: entry.candidate.channelName }),
        el(
          'div',
          { class: 'reasons' },
          ...entry.reasons.map((reason) => el('span', { class: 'reason', text: reason })),
        ),
      ),
      el(
        'div',
        { class: 'card-actions' },
        el('span', { class: 'score', text: entry.score.toFixed(2) }),
        el('button', {
          class: 'button',
          type: 'button',
          'data-dismiss': entry.candidate.videoId,
          text: 'Not funny',
        }),
      ),
    ),
  );

  replace(
    host,
    ...view.notes.map((note) => el('p', { class: 'note', text: note })),
    ...(rows.length > 0
      ? rows
      : [el('p', { class: 'note', text: 'Nothing suggested yet. Try looking for new videos.' })]),
  );

  const when = view.fetchedAt ? `checked ${formatRelativeTime(view.fetchedAt, Date.now())}` : 'never checked';
  replace(
    quota,
    `${when}. API quota used today: ${view.quotaSpentToday} of ${view.quotaSpentToday + view.quotaRemaining} units.`,
  );
}

async function loadSuggestions(): Promise<void> {
  const reply = await send({ type: 'laugh:getSuggestions' });
  if (reply.ok) renderSuggestions(reply.data);
}

async function mutate(message: Parameters<typeof send>[0]): Promise<void> {
  const reply = await send(message);
  if (!reply.ok) {
    window.alert(reply.error);
    return;
  }
  snapshot = reply.data as Snapshot;
  render();
}

byId('feed')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const videoId = target.getAttribute('data-delete-video');
  if (videoId) {
    if (window.confirm('Remove every moment marked in this video?')) {
      void mutate({ type: 'laugh:deleteVideo', videoId });
    }
    return;
  }

  const ids = target.getAttribute('data-moment-ids');
  if (ids) {
    // An episode can hold several presses; removing it removes all of them.
    void (async () => {
      for (const id of ids.split(',')) await mutate({ type: 'laugh:deleteMoment', id });
    })();
  }
});

byId<HTMLSelectElement>('sort')?.addEventListener('change', (event) => {
  sortMode = (event.target as HTMLSelectElement).value as SortMode;
  render();
});

byId<HTMLSelectElement>('channel-filter')?.addEventListener('change', (event) => {
  channelFilter = (event.target as HTMLSelectElement).value;
  render();
});

byId('clear')?.addEventListener('click', () => {
  if (window.confirm('Delete every laugh you have marked? This cannot be undone.')) {
    void mutate({ type: 'laugh:clearAll' });
  }
});

byId('export')?.addEventListener('click', async () => {
  const reply = await send({ type: 'laugh:export' });
  if (!reply.ok) {
    window.alert(reply.error);
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`laugh-export-${stamp}.json`, reply.data);
});

byId<HTMLInputElement>('import-file')?.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    window.alert('That file is not valid JSON.');
    return;
  }

  const reply = await send({ type: 'laugh:import', bundle: parsed });
  if (!reply.ok) {
    window.alert(reply.error);
    return;
  }
  window.alert(`Imported ${reply.data.imported} new moments. You now have ${reply.data.total}.`);
  await load();
});

byId('options')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

byId('refresh-suggestions')?.addEventListener('click', async (event) => {
  const button = event.target as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Looking...';
  try {
    const reply = await send({ type: 'laugh:refreshSuggestions' });
    if (reply.ok) renderSuggestions(reply.data);
    else window.alert(reply.error);
  } finally {
    button.disabled = false;
    button.textContent = 'Look for new';
  }
});

byId('suggestions')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const videoId = target.getAttribute('data-dismiss');
  if (!videoId) return;

  const reply = await send({ type: 'laugh:dismissSuggestion', videoId });
  if (reply.ok) renderSuggestions(reply.data);
});

void load();
void loadSuggestions();
