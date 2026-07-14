# Urge: MVP Build Spec

One-motion urge logging for iPhone. Feel an urge (snack, drink, porn, doomscroll, smoke), touch the phone once, get a 60-second pattern-aware interrupt. The app is a panic button plus a pattern engine, not a willpower lecture.

Status: idea spec, not part of World of ClaudeCraft. Lives in this repo only until it gets its own repo and Xcode project.

## Positioning

- Competitors (QUITTR, Brainbuddy, Fortify, Reframe, I Am Sober) are single-vice and none own the instant-capture moment.
- Differentiators: (1) zero-friction capture bound to a hardware gesture, (2) multi-vice from day one, (3) an AI coach that reasons over the user's own event history, (4) privacy-first in a category where the data is embarrassing.
- The mechanism sold to the user: urges crest and pass (urge surfing, from ACT/CBT). Delay beats willpower. The app's job is to make the next 10 minutes easy.

## Capture layer (the whole point)

Triple-click of the side button is reserved by iOS for the Accessibility Shortcut, so the app cannot claim it. Equivalent sanctioned triggers, all powered by one App Intent:

| Trigger | Hardware | Notes |
|---|---|---|
| Back Tap (double or triple tap on phone back) | iPhone 8+ | Closest to the original vision. Runs a Shortcut that calls the intent. Feels private. |
| Action Button | iPhone 15 Pro+ | One press, fires the intent directly. |
| Lock Screen widget | all | One tap, no unlock. |
| Control Center control | iOS 18+ | ControlWidget API. |
| Watch complication | later | Phase 2. |

Onboarding walks the user through binding one of these ("Set up your panic button"), with Back Tap as the default path (Settings > Accessibility > Touch > Back Tap).

### App Intent sketch

```swift
import AppIntents

struct LogUrgeIntent: AppIntent {
    static let title: LocalizedStringResource = "Log urge"
    static let openAppWhenRun = true

    @Parameter(title: "Urge") var urge: UrgeEntity?

    func perform() async throws -> some IntentResult {
        let event = UrgeEvent(timestamp: .now, urgeID: urge?.id)
        try EventStore.shared.append(event)
        NavigationRouter.shared.route = .interrupt(event.id)
        return .result()
    }
}

struct UrgeAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogUrgeIntent(),
            phrases: ["Log an urge in \(.applicationName)"],
            shortTitle: "Log urge",
            systemImageName: "hand.raised"
        )
    }
}
```

If the user tracks multiple urges, they either create one Shortcut per urge (each pre-fills the parameter, so Back Tap stays zero-question) or the interrupt screen opens with a 2-second picker as its first frame.

## Core loop

1. Trigger fires. Event is persisted immediately (timestamp, urge type). Logging must never be lost even if the user closes the app instantly.
2. Interrupt screen (60 seconds of content, 10 minutes of timer):
   - Wave animation and a 10-minute urge-surfing timer ("this peaks and passes, ride it").
   - One AI coach line, pattern-aware, generated from the user's aggregates (see AI design). Falls back to a canned line bank offline or on free tier.
   - Optional one-tap trigger tag: bored, stressed, tired, saw a trigger, social, other.
3. Outcome close-out: when the timer ends (or next app open), one tap: rode it out / gave in. No shame copy on "gave in", the log itself is the win.
4. Weekly report (Pro): AI-written, from aggregates: trigger times, situations, survival-rate trend, one concrete experiment for next week.

Design constraint: no streak-guilt mechanics. "Survival rate improving" framing, never "you broke your streak." Lapse logging must feel safe or users stop logging the exact events the pattern engine needs.

## Screens (MVP = 5)

1. Onboarding: pick urges (multi-select), bind the panic button (guided Back Tap / Action Button / widget setup), one privacy screen ("your data stays on this phone").
2. Interrupt: wave timer, coach line, trigger tag, outcome buttons.
3. Today: today's events, current open timer if any, quick-log button (in-app fallback trigger).
4. Insights: calendar heat map, survival rate, time-of-day histogram, weekly AI report (Pro).
5. Settings / paywall: manage urges, triggers, subscription, export/delete data.

## Data model (all on-device)

```swift
struct Urge: Codable, Identifiable {        // a thing being tracked
    let id: UUID
    var name: String                        // "snacking", "drinking", custom
    var icon: String
}

struct UrgeEvent: Codable, Identifiable {
    let id: UUID
    let timestamp: Date
    var urgeID: UUID?
    var outcome: Outcome?                   // .rode, .gaveIn, nil = open
    var triggerTag: TriggerTag?
    var note: String?
}
```

Storage: SwiftData (or a flat JSON/SQLite store). No account, no server-side user database in MVP. This is a privacy feature and a cost feature at once.

## AI design

Two call types, both routed through a thin serverless proxy (the API key never ships in the app):

1. In-the-moment coach line. Model: claude-haiku-4-5. Input: small aggregate summary (counts by hour band, last 3 events, survival rate, current trigger tag), never raw notes. Output: 1 or 2 sentences, direct, specific, zero therapy-speak. Cached line bank as offline/free fallback. Cost per call is a fraction of a cent.
2. Weekly report. Model: claude-sonnet-5 (or claude-opus-4-8 if quality demands it). Input: the week's aggregates plus prior week for comparison. Output: short markdown report plus one experiment. One call per user per week, so cost is negligible.

Privacy rule for both: only derived aggregates leave the device, no free-text notes unless the user explicitly opts in. State this in the privacy screen and App Store listing; in this category it is a selling point.

Prompt sketch (coach line):

```
System: You coach people through momentary urges using urge-surfing
(the urge peaks and passes within ~15 minutes). You are direct, warm,
never preachy, never clinical. Two sentences max. Reference the
user's actual pattern when one is given. Suggest one tiny physical
action (move rooms, water, 10 slow breaths, step outside).

User: urge=snacking, local_time=23:10, tag=bored,
this_week={events: 4, rode: 3, common_hour: 22-24},
last_event={outcome: rode, minutes_to_pass: 12}
```

## Backend (minimal)

- One serverless endpoint (Cloudflare Workers or Vercel, TypeScript): POST /coach and POST /report. Validates a RevenueCat subscriber check for Pro endpoints, applies per-device rate limits, forwards to the Claude API, returns text.
- No database in MVP beyond rate-limit counters (KV).
- RevenueCat for subscriptions.

## Monetization

- Free: logging, timer, canned lines, 7 days of history, 1 urge.
- Pro ($6.99/month or $34.99/year): AI coach lines, weekly reports, unlimited urges, full history, export.
- Paywall shown after the first successfully ridden urge (moment of proven value), not at first launch.

## Stack decision

Native SwiftUI. The product is 90% OS integration (App Intents, widgets, Back Tap binding flow, later Watch). React Native/Expo would still need custom Swift for every load-bearing piece. iOS-only at launch is fine: the gesture story is iOS-specific and the paying market is there. Revisit Android only after retention is proven.

## Build order

1. Week 1: Xcode project, data model, LogUrgeIntent, interrupt screen with timer, Today screen. Manually triggered via Shortcuts app. Daily-drive it yourself.
2. Week 2: onboarding with guided Back Tap / Action Button binding, Lock Screen widget, trigger tags, outcome flow, Insights (local stats only).
3. Week 3: serverless proxy, coach-line integration, canned fallback bank, RevenueCat paywall, weekly report job.
4. Week 4: polish, App Store assets, privacy nutrition label (minimal: purchases only), TestFlight beta with 10-20 people fighting different vices.

Validation gate before building past week 1: does the capture-to-interrupt loop change your own behavior for one week? If logging feels like a chore even for the builder, stop and rethink the trigger flow.

## Risks

- App Review: apps touching addiction/mental-health themes get extra scrutiny. Keep copy reflective, not clinical; no medical claims; add crisis-resources link for severe cases.
- Sensitive data optics: any breach headline in this category is fatal (see Cal AI, March 2026). On-device storage is the mitigation and the marketing.
- Churn: people uninstall when they feel better. The weekly report and multi-vice support are the retention levers; consider a maintenance mode ("check-ins only") instead of cancel.
