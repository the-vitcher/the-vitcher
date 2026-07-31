import Foundation

// Coach context sent to the worker. Only derived aggregates, never free text.
struct CoachContext: Codable {
  struct Week: Codable {
    let events: Int
    let rode: Int
    let commonHour: String
  }
  struct Last: Codable {
    let outcome: String
    let minutes: Int
  }
  let deviceID: String
  let urge: String
  let localTime: String
  let tag: String?
  let week: Week
  let last: Last?
}

final class EventStore: ObservableObject {
  static let shared = EventStore()

  @Published private(set) var urges: [Urge] = []
  @Published private(set) var events: [UrgeEvent] = []
  @Published var onboarded: Bool {
    didSet { UserDefaults.standard.set(onboarded, forKey: "onboarded") }
  }

  private let fileURL: URL

  private struct Snapshot: Codable {
    var urges: [Urge]
    var events: [UrgeEvent]
  }

  init() {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    fileURL = docs.appendingPathComponent("urge-store.json")
    onboarded = UserDefaults.standard.bool(forKey: "onboarded")
    load()
  }

  // MARK: - Mutations

  @discardableResult
  func logUrge(urgeID: UUID?) -> UrgeEvent {
    let event = UrgeEvent(id: UUID(), timestamp: Date(), urgeID: urgeID, outcome: nil, triggerTag: nil)
    events.append(event)
    save()
    return event
  }

  func setOutcome(_ outcome: Outcome, for eventID: UUID) {
    guard let i = events.firstIndex(where: { $0.id == eventID }) else { return }
    events[i].outcome = outcome
    save()
  }

  func setTag(_ tag: TriggerTag, for eventID: UUID) {
    guard let i = events.firstIndex(where: { $0.id == eventID }) else { return }
    events[i].triggerTag = tag
    save()
  }

  func setUrge(_ urgeID: UUID, for eventID: UUID) {
    guard let i = events.firstIndex(where: { $0.id == eventID }) else { return }
    events[i].urgeID = urgeID
    save()
  }

  func addUrge(name: String, icon: String = "hand.raised") {
    urges.append(Urge(id: UUID(), name: name, icon: icon))
    save()
  }

  func removeUrge(_ urge: Urge) {
    urges.removeAll { $0.id == urge.id }
    save()
  }

  func setUrges(_ list: [Urge]) {
    urges = list
    save()
  }

  func deleteAllData() {
    events = []
    save()
  }

  // MARK: - Queries

  func event(_ id: UUID) -> UrgeEvent? {
    events.first { $0.id == id }
  }

  func urgeName(for event: UrgeEvent) -> String {
    guard let id = event.urgeID, let urge = urges.first(where: { $0.id == id }) else {
      return "urge"
    }
    return urge.name
  }

  var eventsToday: [UrgeEvent] {
    let cal = Calendar.current
    return events.filter { cal.isDateInToday($0.timestamp) }.sorted { $0.timestamp > $1.timestamp }
  }

  func recentEvents(days: Int) -> [UrgeEvent] {
    let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
    return events.filter { $0.timestamp >= cutoff }
  }

  // Survival rate over closed events in the window; nil when no closed events.
  func survivalRate(days: Int) -> Double? {
    let closed = recentEvents(days: days).filter { $0.outcome != nil }
    guard !closed.isEmpty else { return nil }
    let rode = closed.filter { $0.outcome == .rode }.count
    return Double(rode) / Double(closed.count)
  }

  // Event counts bucketed into six 4-hour bands, for the insights histogram.
  func countsByHourBand(days: Int) -> [Int] {
    var bands = [Int](repeating: 0, count: 6)
    let cal = Calendar.current
    for event in recentEvents(days: days) {
      let hour = cal.component(.hour, from: event.timestamp)
      bands[min(hour / 4, 5)] += 1
    }
    return bands
  }

  static let bandLabels = ["0-4", "4-8", "8-12", "12-16", "16-20", "20-24"]

  func coachContext(for event: UrgeEvent) -> CoachContext {
    let week = recentEvents(days: 7)
    let rode = week.filter { $0.outcome == .rode }.count
    let bands = countsByHourBand(days: 7)
    let topBand = bands.firstIndex(of: bands.max() ?? 0) ?? 0
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm"

    var last: CoachContext.Last?
    if let previous = events
      .filter({ $0.id != event.id && $0.outcome != nil })
      .sorted(by: { $0.timestamp > $1.timestamp })
      .first,
      let outcome = previous.outcome {
      last = CoachContext.Last(outcome: outcome.rawValue, minutes: 10)
    }

    return CoachContext(
      deviceID: Self.deviceID,
      urge: urgeName(for: event),
      localTime: formatter.string(from: event.timestamp),
      tag: event.triggerTag?.rawValue,
      week: CoachContext.Week(
        events: week.count,
        rode: rode,
        commonHour: Self.bandLabels[topBand]
      ),
      last: last
    )
  }

  // Stable anonymous id for rate limiting; no account, no PII.
  static var deviceID: String {
    if let existing = UserDefaults.standard.string(forKey: "deviceID") { return existing }
    let fresh = UUID().uuidString
    UserDefaults.standard.set(fresh, forKey: "deviceID")
    return fresh
  }

  func exportJSON() -> Data? {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    encoder.dateEncodingStrategy = .iso8601
    return try? encoder.encode(Snapshot(urges: urges, events: events))
  }

  // MARK: - Persistence

  private func load() {
    guard let data = try? Data(contentsOf: fileURL) else {
      urges = Urge.defaults
      return
    }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    if let snapshot = try? decoder.decode(Snapshot.self, from: data) {
      urges = snapshot.urges
      events = snapshot.events
    } else {
      urges = Urge.defaults
    }
  }

  private func save() {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    guard let data = try? encoder.encode(Snapshot(urges: urges, events: events)) else { return }
    try? data.write(to: fileURL, options: .atomic)
  }
}
