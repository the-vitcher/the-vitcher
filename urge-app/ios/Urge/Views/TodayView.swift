import SwiftUI

struct TodayView: View {
  @EnvironmentObject var store: EventStore
  @EnvironmentObject var router: NavigationRouter

  var body: some View {
    NavigationStack {
      List {
        Section {
          Button {
            let event = store.logUrge(urgeID: store.urges.count == 1 ? store.urges[0].id : nil)
            router.route = .interrupt(event.id)
          } label: {
            Label("I feel an urge", systemImage: "hand.raised.fill")
              .font(.headline)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 8)
          }
          .buttonStyle(.borderedProminent)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets())
        }

        Section("Today") {
          if store.eventsToday.isEmpty {
            Text("Nothing logged yet. A quiet day is a good day.")
              .foregroundStyle(.secondary)
          } else {
            ForEach(store.eventsToday) { event in
              EventRow(event: event)
            }
          }
        }
      }
      .navigationTitle("Urge")
    }
  }
}

struct EventRow: View {
  @EnvironmentObject var store: EventStore
  let event: UrgeEvent

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(store.urgeName(for: event))
          .font(.body)
        Text(event.timestamp, style: .time)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Spacer()
      outcomeBadge
    }
  }

  @ViewBuilder
  private var outcomeBadge: some View {
    switch event.outcome {
    case .rode:
      Label("rode it", systemImage: "checkmark.circle.fill")
        .font(.caption)
        .foregroundStyle(.green)
    case .gaveIn:
      Label("gave in", systemImage: "arrow.uturn.down.circle")
        .font(.caption)
        .foregroundStyle(.orange)
    case nil:
      HStack(spacing: 8) {
        Button("Rode it") { store.setOutcome(.rode, for: event.id) }
          .font(.caption)
          .buttonStyle(.bordered)
        Button("Gave in") { store.setOutcome(.gaveIn, for: event.id) }
          .font(.caption)
          .buttonStyle(.bordered)
      }
    }
  }
}
