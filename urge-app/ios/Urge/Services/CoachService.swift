import Foundation

// Talks to the Cloudflare Worker proxy. The Anthropic API key lives on the
// worker, never in the app. Falls back to canned lines offline.
enum CoachService {
  // Set this to your deployed worker URL before shipping.
  static let workerBase = URL(string: "https://YOUR-WORKER.workers.dev")!

  struct CoachResponse: Codable {
    let text: String
  }

  static let fallbackLines = [
    "This peaks and passes, usually inside 15 minutes. Get a glass of water and move to another room.",
    "You do not have to win forever, just the next 10 minutes. Ten slow breaths, then decide again.",
    "The urge is a wave, not an order. Step outside or stretch until it crests.",
    "Notice where you feel it in your body and just watch it. It fades faster when you do not feed it.",
    "Change the scene. Different room, different posture, different next 10 minutes.",
  ]

  static func coachLine(context: CoachContext) async -> String {
    do {
      var request = URLRequest(url: workerBase.appendingPathComponent("coach"))
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.timeoutInterval = 6
      let encoder = JSONEncoder()
      encoder.keyEncodingStrategy = .convertToSnakeCase
      request.httpBody = try encoder.encode(context)
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        return fallbackLines.randomElement()!
      }
      let decoded = try JSONDecoder().decode(CoachResponse.self, from: data)
      return decoded.text
    } catch {
      return fallbackLines.randomElement()!
    }
  }

  struct ReportRequest: Codable {
    let deviceID: String
    let thisWeek: WeekStats
    let lastWeek: WeekStats
  }

  struct WeekStats: Codable {
    let events: Int
    let rode: Int
    let gaveIn: Int
    let byBand: [Int]
    let topTags: [String]
  }

  static func weeklyReport(request payload: ReportRequest) async -> String? {
    do {
      var request = URLRequest(url: workerBase.appendingPathComponent("report"))
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.timeoutInterval = 30
      let encoder = JSONEncoder()
      encoder.keyEncodingStrategy = .convertToSnakeCase
      request.httpBody = try encoder.encode(payload)
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
      let decoded = try JSONDecoder().decode(CoachResponse.self, from: data)
      return decoded.text
    } catch {
      return nil
    }
  }
}
