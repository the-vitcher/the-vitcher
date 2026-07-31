import SwiftUI
import UserNotifications

// The 60-second interrupt: wave timer, one coach line, tag, outcome.
struct InterruptView: View {
  let eventID: UUID

  @EnvironmentObject var store: EventStore
  @Environment(\.dismiss) private var dismiss

  @State private var remaining = 600
  @State private var coachLine: String?
  @State private var selectedTag: TriggerTag?
  @State private var pickedUrge = false

  private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

  var body: some View {
    VStack(spacing: 24) {
      Spacer(minLength: 24)

      if needsUrgePicker {
        urgePicker
      } else {
        timerSection
        coachSection
        tagSection
        Spacer()
        outcomeSection
      }
    }
    .padding()
    .background(Color(.systemBackground))
    .onReceive(tick) { _ in
      if remaining > 0 { remaining -= 1 }
    }
    .onAppear {
      scheduleCloseoutReminder()
      if !needsUrgePicker { loadCoachLine() }
    }
  }

  private var needsUrgePicker: Bool {
    !pickedUrge && store.event(eventID)?.urgeID == nil && store.urges.count > 1
  }

  private var urgePicker: some View {
    VStack(spacing: 16) {
      Text("What is the urge?")
        .font(.title2.bold())
      ForEach(store.urges) { urge in
        Button {
          store.setUrge(urge.id, for: eventID)
          pickedUrge = true
          loadCoachLine()
        } label: {
          Label(urge.name, systemImage: urge.icon)
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
      }
      Spacer()
    }
  }

  private var timerSection: some View {
    VStack(spacing: 8) {
      Text("Ride it out")
        .font(.title.bold())
      Text("Urges crest and pass. This one will too.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
      WaveView()
        .frame(height: 90)
      Text(timeString)
        .font(.system(size: 44, weight: .semibold, design: .rounded))
        .monospacedDigit()
    }
  }

  private var coachSection: some View {
    Group {
      if let line = coachLine {
        Text(line)
          .font(.body)
          .multilineTextAlignment(.center)
          .padding()
          .background(Color(.secondarySystemBackground))
          .clipShape(RoundedRectangle(cornerRadius: 14))
          .transition(.opacity)
      } else {
        ProgressView()
      }
    }
  }

  private var tagSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("What set it off?")
        .font(.footnote)
        .foregroundStyle(.secondary)
      FlowChips(tags: TriggerTag.allCases, selected: $selectedTag) { tag in
        store.setTag(tag, for: eventID)
      }
    }
  }

  private var outcomeSection: some View {
    VStack(spacing: 12) {
      Button {
        finish(.rode)
      } label: {
        Text("I rode it out")
          .font(.headline)
          .frame(maxWidth: .infinity)
          .padding()
      }
      .buttonStyle(.borderedProminent)

      Button {
        finish(.gaveIn)
      } label: {
        Text("I gave in")
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(.bordered)

      Text("Logging either way is the win. The data is what gets you out.")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private var timeString: String {
    String(format: "%d:%02d", remaining / 60, remaining % 60)
  }

  private func finish(_ outcome: Outcome) {
    store.setOutcome(outcome, for: eventID)
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [eventID.uuidString])
    dismiss()
  }

  private func loadCoachLine() {
    guard let event = store.event(eventID) else { return }
    let context = store.coachContext(for: event)
    Task {
      let line = await CoachService.coachLine(context: context)
      withAnimation { coachLine = line }
    }
  }

  private func scheduleCloseoutReminder() {
    let content = UNMutableNotificationContent()
    content.title = "How did it go?"
    content.body = "Close out your urge log: rode it out, or gave in?"
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 600, repeats: false)
    let request = UNNotificationRequest(identifier: eventID.uuidString, content: content, trigger: trigger)
    UNUserNotificationCenter.current().add(request)
  }
}

// Animated sine wave, the visual metaphor for urge surfing.
struct WaveView: View {
  var body: some View {
    TimelineView(.animation) { timeline in
      Canvas { context, size in
        let t = timeline.date.timeIntervalSinceReferenceDate
        var path = Path()
        let midY = size.height / 2
        let amplitude = size.height * 0.35
        path.move(to: CGPoint(x: 0, y: midY))
        var x: CGFloat = 0
        while x <= size.width {
          let relative = x / size.width
          let y = midY + amplitude * sin(relative * .pi * 4 + t * 2)
          path.addLine(to: CGPoint(x: x, y: y))
          x += 2
        }
        context.stroke(path, with: .color(.accentColor), lineWidth: 3)
      }
    }
  }
}

// Simple wrapping chip row for trigger tags.
struct FlowChips: View {
  let tags: [TriggerTag]
  @Binding var selected: TriggerTag?
  var onSelect: (TriggerTag) -> Void

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 8) {
      ForEach(tags) { tag in
        Button {
          selected = tag
          onSelect(tag)
        } label: {
          Text(tag.label)
            .font(.footnote)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(selected == tag ? Color.accentColor.opacity(0.25) : Color(.secondarySystemBackground))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
      }
    }
  }
}
