# Laugh

Mark the exact moment a YouTube video made you laugh. Not the whole video, the
second. Over time the marks become a picture of your own sense of humour.

This is a self-contained Chrome MV3 extension. It shares this repository's
toolchain (TypeScript, esbuild, Vitest) and adds no dependencies of its own, and it
imports nothing from the rest of the repo, so it can be moved to its own repository
with a `git mv` plus a small `package.json`.

## Install

```
npm install          # once, from the repo root
npm run laugh:build  # emits laugh/dist/
```

Then in Chrome: `chrome://extensions`, turn on Developer mode, Load unpacked, and
select the `laugh/` directory. Rebuild and hit reload on the extension card after
any code change.

`npm run laugh:watch` rebuilds with sourcemaps and without minifying.

## Use

On any YouTube video, press **Ctrl+Shift+L** (**Command+Shift+L** on a Mac), or click
the `ha` button in the player bar. A toast confirms the mark and shows the timestamp
it saved.

The toolbar popup shows a summary and opens the feed. The feed groups every moment by
video, and each timestamp is a deep link back to that exact second.

## The one design decision that matters

You laugh, *then* you reach for the key. The press lands one to three seconds after
the joke, so marking `video.currentTime` records the aftermath, not the punchline.

Every moment stores both numbers:

- `pressedAtSec`, the raw player time, never adjusted
- `tSec`, the punchline estimate, derived as `pressedAtSec - lookbackSec`

Because the raw value is kept, changing the reaction lag in settings re-times every
moment you already saved, rather than only affecting future ones.

The same reasoning drives clustering: three presses across one long laugh are one
episode with intensity 3, not three near-duplicate rows.

## Layout

| Path | What it is |
|---|---|
| `core/` | Pure logic. No chrome APIs, no DOM. Vitest imports it directly. |
| `ext/` | The thin chrome-facing shell. The service worker is the only writer. |
| `ext/content/player.ts` | The only file that knows YouTube's markup. |
| `feed/`, `popup/`, `options/` | Extension pages. |
| `tests/` | Vitest specs over `core/`, discovered by the repo's root `npm test`. |

Everything that could be pure is pure, which is why the brittle surface is one file
and the tested surface is everything else.

## Storage

`chrome.storage.local`, version-prefixed keys (`laugh:v1:moments`,
`laugh:v1:settings`, `laugh:v1:profileCache`, `laugh:v1:quota`,
`laugh:v1:suggestions`, `laugh:v1:dismissed`). A moment is roughly 250 bytes, so
10,000 moments is about 2.5MB, well inside the default quota.

Every write is serialized through one promise chain in `ext/storage.ts` and happens
only in the service worker, so two fast presses cannot clobber each other. Nothing is
held in worker module scope between wakes, since MV3 terminates the worker when idle.

Your marks are never sent anywhere. The only outbound requests Laugh ever makes are
the YouTube Data API calls for discovery, and only once you have configured a key.
Those send your top channel ids and (if you enable search) your top profile terms;
they never send your moments. The feed's Export button writes a JSON file you can
import back, and it never includes the API key.

## Discovery

Built, and dormant until you add a key. Without one the feed says so and never
touches the network; paste a key into settings and the "Might be funny" panel starts
working.

To get one: create a project in the Google Cloud console, enable **YouTube Data API
v3**, create an API key, and restrict it to that API. It is free. The key lives in
`chrome.storage.local`, never in this repo, and is stripped from exports (there is a
test for that).

### How a refresh spends quota

The free tier is 10,000 units a day and the costs are wildly uneven, so the flow is
built around the cheap calls:

| Call | Cost | Role in a refresh |
|---|---|---|
| `channels.list` | 1 | one call resolves up to 50 channels to their uploads playlists |
| `playlistItems.list` | 1 | one call per channel, walking recent uploads |
| `videos.list` | 1 per 50 ids | batch hydration for titles, runtimes, publish dates |
| `search.list` | **100** | opt-in only, one keyword query built from your top terms |

A full refresh over the channels you already laugh at costs **about 10 units**, so
hundreds of refreshes a day rather than a hundred. Keyword search is off by default
because one call costs as much as ten complete refreshes; when enabled it is still
blocked below a 2,000 unit reserve.

The ledger is keyed on the **Pacific** calendar date, because that is when Google
resets the quota, and it follows the daylight-saving shift rather than a fixed
offset.

Only channels with a known channel id can be walked. A channel Laugh has only ever
seen by name would need a `search.list` to resolve, which is not worth 100 units, so
those are skipped and the panel says so.

`fetch` is injected into `YouTubeDataApiSource`, so the whole orchestrator is tested
against canned payloads with no key and no network.

### Ranking weights

| Signal | Weight | Source |
|---|---|---|
| Channel affinity | 0.42 | `profile.channels`, normalized against your top channel |
| Term overlap | 0.33 | `profile.terms`, capped so a keyword-stuffed title cannot win |
| Position fit | 0.15 | candidate runtime judged against `medianVideoDurationSec` and `frontLoadBias` |
| Freshness | 0.10 | publish date, 14-day half-life |

Position fit is the signal that ties *where* you laugh to *what gets surfaced*. The
anchor is the median runtime of videos you laugh at; how much longer than that is
acceptable comes from the shape of the position histogram. Laughs piled into the
first third mean runtime past that point is dead weight, so the tolerance tightens to
1.5x the median. Laughs spread through the runtime widen it to about 4.5x.

**Time of day is deliberately not a weight.** `surfacingReadiness(profile, now)`
scores how receptive you tend to be at the current hour, but that value is identical
for every candidate in one ranking call, so folding it into the score would scale
everything equally and reorder nothing. It answers "is now a good moment to show
anything", not "which of these is best". The feed uses it today as a live readout
under the hour histogram.

**A note on key exposure.** A plain API key (not OAuth) is enough for public read
data. A key shipped inside an extension is visible to anyone who unpacks it, which is
acceptable for a personal single-user tool as long as you enter it through the options
page and restrict it to the YouTube Data API v3 in the Google Cloud console. Do not
commit it.

## Tests

```
npm run laugh:test      # core/ specs, pure and fast: no chrome, no DOM, no network
npm run laugh:smoke     # builds, loads the extension in Chromium, drives it end to end
npm test                # the whole repo, which includes laugh:test
```

`laugh:smoke` covers what unit tests cannot: that the manifest is valid, the service
worker boots, and a mark round-trips into a rendered feed row with the lookback
applied and four clustered presses shown as one moment.

Still worth doing by hand, because it needs real YouTube markup: open a video, press
the hotkey three times, confirm the toast and that the feed's deep link lands about
2.5 seconds before your first press; navigate to a second video without reloading the
tab and confirm the player button re-appears and picks up the new title; and type the
hotkey letter into the YouTube search box to confirm nothing gets marked.

## Not included

There are no icon PNGs, so Chrome shows its default extension icon in the toolbar.
Drop `icons/16.png`, `32.png`, `48.png`, and `128.png` in and add an `icons` key plus
`action.default_icon` to `manifest.json` when you want a real one.
