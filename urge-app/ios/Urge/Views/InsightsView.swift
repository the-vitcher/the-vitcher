import SwiftUI

struct InsightsView: View {
  @EnvironmentObject var store: EventStore

  @State private var report: String?
  @State private var loadingReport = false

  var body: some View {
    NavigationStack {
      List {
        Section("Last 7 days") {
          statRow(
            label: "Urges logged",
            value: "\(store.recentEvents(days: 7).count)"
          )
          statRow(
            label: "Survival rate",
            value: survivalText
          )
        }

        Section("When urges hit") {
          HourBands(counts: store.countsByHourBand(days: 30))
            .frame(height: 140)
            .listRowBackground(Color.clear)
        }

        Section("Weekly report") {
          if let report {
            Text(report)
              .font(.callout)
          } else {
            Button {
              loadReport()
            } label: {
              if loadingReport {
                ProgressView()
              } else {
                Label("Generate this week's report", systemImage: "sparkles")
              }
            }
            .disabled(loadingReport)
          }
        }
      }
      .navigationTitle("Insights")
    }
  }

  private var survivalText: String {
    guard let rate = store.survivalRate(days: 7) else { return "no closed logs yet" }
    return "\(Int((rate * 100).rounded()))%"
  }

  private func statRow(label: String, value: String) -> some View {
    HStack {
      Text(label)
      Spacer()
      Text(value)
        .foregroundStyle(.secondary)
    }
  }

  private func loadReport() {
    loadingReport = true
    let thisWeek = weekStats(daysAgo: 0)
    let lastWeek = weekStats(daysAgo: 7)
    let payload = CoachService.ReportRequest(
      deviceID: EventStore.deviceID,
      thisWeek: thisWeek,
      lastWeek: lastWeek
    )
    Task {
      let text = await CoachService.weeklyReport(request: payload)
      report = text ?? "Could not reach the coach right now. Try again in a bit."
      loadingReport = false
    }
  }

  private func weekStats(daysAgo: Int) -> CoachService.WeekStats {
    let cal = Calendar.current
    let end = cal.date(byAdding: .day, value: -daysAgo, to: Date()) ?? Date()
    let start = cal.date(byAdding: .day, value: -7, to: end) ?? end
    let window = store.events.filter { $0.timestamp >= start && $0.timestamp < end }
    var bands = [Int](repeating: 0, count: 6)
    for event in window {
      bands[min(cal.component(.hour, from: event.timestamp) / 4, 5)] += 1
    }
    let tagCounts = Dictionary(grouping: window.compactMap { $0.triggerTag }, by: { $0 })
      .mapValues { $0.count }
    let topTags = tagCounts.sorted { $0.value > $1.value }.prefix(3).map { $0.key.rawValue }
    return CoachService.WeekStats(
      events: window.count,
      rode: window.filter { $0.outcome == .rode }.count,
      gaveIn: window.filter { $0.outcome == .gaveIn }.count,
      byBand: bands,
      topTags: Array(topTags)
    )
  }
}

struct HourBands: View {
  let counts: [Int]

  var body: some View {
    let peak = max(counts.max() ?? 1, 1)
    HStack(alignment: .bottom, spacing: 10) {
      ForEach(counts.indices, id: \.self) { i in
        VStack(spacing: 4) {
          RoundedRectangle(cornerRadius: 4)
            .fill(Color.accentColor.opacity(0.8))
            .frame(height: max(CGFloat(counts[i]) / CGFloat(peak) * 100, 4))
          Text(EventStore.bandLabels[i])
            .font(.system(size: 9))
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
      }
    }
    .padding(.vertical, 8)
  }
}
