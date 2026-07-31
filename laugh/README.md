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
`laugh:v1:settings`, `laugh:v1:profileCache`). A moment is roughly 250 bytes, so
10,000 moments is about 2.5MB, well inside the default quota.

Every write is serialized through one promise chain in `ext/storage.ts` and happens
only in the service worker, so two fast presses cannot clobber each other. Nothing is
held in worker module scope between wakes, since MV3 terminates the worker when idle.

Nothing is sent anywhere. The feed's Export button writes a JSON file you can import
back, and it never includes the API key.

## Phase 2: discovery

Not built. The scoring that ranks a candidate video against your profile is written
and tested (`core/scoring.ts`), and `ext/youtube_api.ts` defines the
`CandidateSource` interface it will be fed from. Only a `NullCandidateSource` ships
today, so adding discovery means adding one implementation.

**On the API key.** The YouTube Data API v3 is free with a default quota of 10,000
units per day, and the quota shape dictates the design:

| Call | Cost | Role |
|---|---|---|
| `search.list` | 100 units | expensive, roughly 100 calls a day, use sparingly |
| `playlistItems.list` | 1 unit | walking a channel's uploads is nearly free |
| `videos.list` | 1 unit per call, 50 ids | batch hydration, effectively free |
| `channels.list` | 1 unit | resolving uploads playlist ids |

So: take the channels from your profile, walk their uploads playlists, batch-hydrate
ids 50 at a time, and spend `search.list` only on a couple of profile-term queries a
day.

A plain API key (not OAuth) is enough for public read data. A key shipped inside an
extension is visible to anyone who unpacks it, which is acceptable for a personal
single-user tool provided you enter it in the options page (it lives in
`chrome.storage.local`, never in this repo) and restrict it to the YouTube Data API
v3 in the Google Cloud console. The options page already stores it; nothing reads it
yet.

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
