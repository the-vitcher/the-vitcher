import Foundation

struct Urge: Codable, Identifiable, Equatable {
  let id: UUID
  var name: String
  var icon: String

  static let defaults: [Urge] = [
    Urge(id: UUID(), name: "snacking", icon: "fork.knife"),
    Urge(id: UUID(), name: "drinking", icon: "wineglass"),
    Urge(id: UUID(), name: "smoking", icon: "smoke"),
    Urge(id: UUID(), name: "porn", icon: "eye.slash"),
    Urge(id: UUID(), name: "doomscrolling", icon: "iphone"),
  ]
}

enum Outcome: String, Codable {
  case rode
  case gaveIn
}

enum TriggerTag: String, Codable, CaseIterable, Identifiable {
  case bored
  case stressed
  case tired
  case sawTrigger
  case social
  case other

  var id: String { rawValue }

  var label: String {
    switch self {
    case .sawTrigger: return "saw a trigger"
    default: return rawValue
    }
  }
}

struct UrgeEvent: Codable, Identifiable, Equatable {
  let id: UUID
  let timestamp: Date
  var urgeID: UUID?
  var outcome: Outcome?
  var triggerTag: TriggerTag?
}
