import AppIntents
import Foundation

// The panic button. Bind this via Back Tap (through a Shortcut), the Action
// Button, or the Shortcuts app. It logs instantly, then opens the interrupt.
struct LogUrgeIntent: AppIntent {
  static let title: LocalizedStringResource = "Log urge"
  static let description = IntentDescription("Log an urge the moment you feel it and start the ride-it-out timer.")
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Urge") var urge: UrgeEntity?

  @MainActor
  func perform() async throws -> some IntentResult {
    let store = EventStore.shared
    var urgeID = urge?.id
    if urgeID == nil, store.urges.count == 1 {
      urgeID = store.urges[0].id
    }
    let event = store.logUrge(urgeID: urgeID)
    NavigationRouter.shared.route = .interrupt(event.id)
    return .result()
  }
}

struct UrgeEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Urge"
  static let defaultQuery = UrgeEntityQuery()

  let id: UUID
  let name: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }
}

struct UrgeEntityQuery: EntityQuery {
  @MainActor
  func entities(for identifiers: [UUID]) async throws -> [UrgeEntity] {
    EventStore.shared.urges
      .filter { identifiers.contains($0.id) }
      .map { UrgeEntity(id: $0.id, name: $0.name) }
  }

  @MainActor
  func suggestedEntities() async throws -> [UrgeEntity] {
    EventStore.shared.urges.map { UrgeEntity(id: $0.id, name: $0.name) }
  }
}

struct UrgeAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogUrgeIntent(),
      phrases: [
        "Log an urge in \(.applicationName)",
        "\(.applicationName) urge",
      ],
      shortTitle: "Log urge",
      systemImageName: "hand.raised"
    )
  }
}
