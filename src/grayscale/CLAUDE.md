# src/grayscale/ — the Grayscale companion app

A standalone page (`grayscale.html`, served at `/grayscale`) where the only
currency is attention. You start a focus session when you put the phone down;
banked focus minutes level a character on the game's real vanilla XP curve and
pay for raid runs against the instances the world already ships.

The design constraint that shapes everything here: **the app must never be worth
staring at.** There is no source of minutes inside the app, no tap-to-progress,
no colour. Progress happens while the screen is off.

## Layout
| Path | What it is |
|---|---|
| `core/` | Pure, deterministic domain logic. No DOM, no clock, no storage, no randomness of its own. |
| `core/focus.ts` | Focus sessions to minutes, local-day bucketing, streaks, the minutes-to-`Character` mapping. |
| `core/raids.ts` | Raid content as declarative records. Language-agnostic: names are i18n keys. |
| `core/raid_run.ts` | Deterministic raid resolution (pull/soak curves, shared attempt budget, loot). |
| `core/progress.ts` | The state machine: focus transitions, the banked-minute economy, raid gating. |
| `core/index.ts` | Barrel. The host imports from here, never from a core module directly. |
| `app.ts` | The renderer. Owns the wall clock, the DOM, and localStorage, and nothing else. |
| `storage.ts` | localStorage read/write, with revalidation of everything read back. |
| `main.ts` | Entry: loads the active locale, then mounts `GrayscaleApp`. |
| `styles.css` | Achromatic palette plus a root `filter: grayscale(1)`. |

## Conventions
- **`core/` is pure.** No `Date.now`, no `Math.random`, no `document`, no
  `localStorage`, no `t()`. Anything needing "now" takes an explicit `nowMs`;
  anything needing randomness takes an `Rng` (`src/sim/rng.ts`) or derives its
  seed from state (`seedFor`). This is what makes the whole domain unit-testable
  and a run replayable.
- **The host owns the impure edges.** `app.ts` is the only module that calls
  `Date.now()` or touches the DOM; `storage.ts` is the only one that touches
  localStorage. Keep it that way rather than reaching for a clock in the core.
- **Reuse the sim's numbers, do not invent parallel ones.** Levelling runs on
  `XP_TABLE` / `xpForLevel` from `src/sim/types.ts`, and raid content mirrors
  `src/sim/content/dungeons.ts`. If the game rebalances, this follows.
- **Timezone sign.** `tzOffsetMinutes` is minutes to ADD to UTC to reach local
  time, which is the negation of `Date.prototype.getTimezoneOffset()`. The core
  never derives it; the host passes it in.
- **i18n.** Every player-visible string is a `t()` key in
  `src/ui/i18n.catalog/grayscale.ts` (English only; the maintainer fills the
  locales at release). Core records carry keys as plain `string`, so the host
  narrows them in `tContent`; `tests/grayscale_content_i18n.test.ts` is what
  keeps that narrowing honest. Numbers go through `formatNumber`.
- **Storage is untrusted.** Anything read back from localStorage is revalidated
  in `storage.ts` and falls back to a fresh state, never to a partially-typed one.

## Adding content
A new raid is a record in `core/raids.ts` plus its name, tagline, boss, and item
strings in `src/ui/i18n.catalog/grayscale.ts`. Nothing else needs to change:
`raidAvailability` and the renderer both iterate `RAIDS`. The content tests
(`tests/grayscale_raid_run.test.ts`, `tests/grayscale_content_i18n.test.ts`)
enforce the difficulty ramp, the probability bounds, and that every key resolves,
so a half-added raid fails the suite rather than shipping.

## Tests
`tests/grayscale_focus.test.ts` · `tests/grayscale_raid_run.test.ts` ·
`tests/grayscale_progress.test.ts` · `tests/grayscale_content_i18n.test.ts`.
All four run against `core/` directly with no DOM, which is the point of the split.
