import SwiftUI

@main
struct UrgeApp: App {
  @StateObject private var store = EventStore.shared
  @StateObject private var router = NavigationRouter.shared

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(store)
        .environmentObject(router)
        .onOpenURL { url in
          // urge://log lets a Shortcut or widget trigger a log without the intent.
          guard url.scheme == "urge", url.host == "log" else { return }
          let event = store.logUrge(urgeID: store.urges.count == 1 ? store.urges[0].id : nil)
          router.route = .interrupt(event.id)
        }
    }
  }
}

struct RootView: View {
  @EnvironmentObject var store: EventStore
  @EnvironmentObject var router: NavigationRouter

  var body: some View {
    Group {
      if store.onboarded {
        MainTabView()
      } else {
        OnboardingView()
      }
    }
    .fullScreenCover(item: interruptEventID) { box in
      InterruptView(eventID: box.id)
    }
  }

  // Bridge the router route into an Identifiable binding for fullScreenCover.
  private var interruptEventID: Binding<IdentifiedUUID?> {
    Binding(
      get: {
        if case .interrupt(let id) = router.route { return IdentifiedUUID(id: id) }
        return nil
      },
      set: { newValue in
        if newValue == nil { router.route = nil }
      }
    )
  }
}

struct IdentifiedUUID: Identifiable, Equatable {
  let id: UUID
}

struct MainTabView: View {
  var body: some View {
    TabView {
      TodayView()
        .tabItem { Label("Today", systemImage: "sun.max") }
      InsightsView()
        .tabItem { Label("Insights", systemImage: "chart.bar") }
      SettingsView()
        .tabItem { Label("Settings", systemImage: "gearshape") }
    }
  }
}
