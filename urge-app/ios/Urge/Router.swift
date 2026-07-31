import Foundation

final class NavigationRouter: ObservableObject {
  static let shared = NavigationRouter()

  enum Route: Equatable {
    case interrupt(UUID)
  }

  @Published var route: Route?
}
