# Urge

One-motion urge logging for iPhone. Feel an urge, touch the phone once (Back Tap, Action Button, or Shortcut), get a 10-minute ride-it-out timer with a pattern-aware AI coach line. All logs stay on device; the AI sees anonymous aggregates only.

Full product spec: `docs/ideas/urge-app-spec.md` in the repo root.

This folder is self-contained and unrelated to World of ClaudeCraft. Move it to its own repo when the project gets serious.

## Layout

| Path | What it is |
|---|---|
| `ios/` | Native SwiftUI app (iOS 17+). XcodeGen manifest plus all sources. |
| `worker/` | Cloudflare Worker (TypeScript) that proxies Claude API calls, rate limits per device, and optionally checks a RevenueCat "pro" entitlement. |

## iOS app setup (on a Mac)

1. `brew install xcodegen`
2. `cd urge-app/ios && xcodegen generate`
3. Open `Urge.xcodeproj`, select the Urge target, set your Apple ID team under Signing and Capabilities, and change the bundle id prefix in `project.yml` if you like.
4. Run on a real device (App Intents and Back Tap do not behave fully in the simulator).
5. In `Urge/Services/CoachService.swift`, set `workerBase` to your deployed worker URL. Until then the app uses the built-in fallback coach lines, so it works fully offline too.

### Binding the panic button

- Shortcuts app: create a shortcut with the "Log urge" action (exposed by `LogUrgeIntent`).
- Back Tap: Settings, Accessibility, Touch, Back Tap, Triple Tap, pick that shortcut.
- Action Button (iPhone 15 Pro and later): Settings, Action Button, Shortcut, pick "Log urge".
- The `urge://log` URL scheme also triggers a log, usable from an "Open URL" shortcut action.

## Worker setup

```sh
cd urge-app/worker
npm install
npm test                      # prompt builder unit tests
npm run typecheck
npx wrangler kv namespace create RATE_KV   # paste the id into wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

Optional: `npx wrangler secret put REVENUECAT_API_KEY` to make `/report` require an active RevenueCat "pro" entitlement (the app's anonymous device id must be the RevenueCat app user id). Without that secret, all endpoints are open, which is what you want during development.

Models default to `claude-haiku-4-5` for the in-the-moment coach line and `claude-sonnet-5` for the weekly report; both are env-configurable in `wrangler.toml` (`COACH_MODEL`, `REPORT_MODEL`). Bump to `claude-opus-4-8` if report quality warrants it.

## Endpoints

| Endpoint | Purpose | Rate limit |
|---|---|---|
| `POST /coach` | 1-2 sentence pattern-aware coach line, shown on the interrupt screen | 40 per device per day |
| `POST /report` | Weekly review with one experiment for next week | 3 per device per day, pro-gated when RevenueCat is configured |

Both accept snake_case JSON produced by the app (see `worker/src/prompts.ts` for the exact shapes). Only derived aggregates are ever sent: counts, hour bands, tags, survival rates. No free text leaves the device.

## What is deliberately not here yet

- Paywall UI and RevenueCat SDK integration in the app (worker-side check exists).
- Lock Screen widget / Control Center control / watchOS complication.
- Streak-free gamification polish, maintenance mode, App Store assets.

## Week 1 validation gate

Build it, bind Back Tap, and daily-drive it yourself for a week before adding anything. If logging feels like a chore even for you, fix the capture flow before touching AI, paywalls, or widgets.
