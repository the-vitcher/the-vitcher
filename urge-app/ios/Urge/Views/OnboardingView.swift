import SwiftUI
import UserNotifications

struct OnboardingView: View {
  @EnvironmentObject var store: EventStore

  @State private var page = 0
  @State private var selectedNames: Set<String> = []
  @State private var customName = ""

  var body: some View {
    TabView(selection: $page) {
      introPage.tag(0)
      pickUrgesPage.tag(1)
      panicButtonPage.tag(2)
      privacyPage.tag(3)
    }
    .tabViewStyle(.page)
    .indexViewStyle(.page(backgroundDisplayMode: .always))
  }

  private var introPage: some View {
    OnboardPage(
      icon: "hand.raised.fill",
      title: "Catch the urge, ride the wave",
      body: "Urges peak and pass within about 15 minutes. When one hits, touch your phone once. We log it, start a timer, and help you ride it out.",
      buttonTitle: "Get started"
    ) { page = 1 }
  }

  private var pickUrgesPage: some View {
    VStack(spacing: 16) {
      Text("What are you fighting?")
        .font(.title2.bold())
        .padding(.top, 60)
      Text("Pick as many as apply. You can change these later.")
        .font(.subheadline)
        .foregroundStyle(.secondary)

      ScrollView {
        VStack(spacing: 8) {
          ForEach(Urge.defaults) { urge in
            toggleRow(urge.name, icon: urge.icon)
          }
          HStack {
            TextField("something else", text: $customName)
              .textFieldStyle(.roundedBorder)
            Button("Add") {
              let trimmed = customName.trimmingCharacters(in: .whitespaces)
              guard !trimmed.isEmpty else { return }
              selectedNames.insert(trimmed)
              customName = ""
            }
          }
          .padding(.top, 4)
          ForEach(customSelected, id: \.self) { name in
            toggleRow(name, icon: "hand.raised")
          }
        }
        .padding(.horizontal)
      }

      Button {
        applySelection()
        page = 2
      } label: {
        Text("Continue")
          .frame(maxWidth: .infinity)
          .padding(.vertical, 6)
      }
      .buttonStyle(.borderedProminent)
      .disabled(selectedNames.isEmpty)
      .padding()
    }
  }

  private var customSelected: [String] {
    let defaults = Set(Urge.defaults.map { $0.name })
    return selectedNames.filter { !defaults.contains($0) }.sorted()
  }

  private func toggleRow(_ name: String, icon: String) -> some View {
    Button {
      if selectedNames.contains(name) {
        selectedNames.remove(name)
      } else {
        selectedNames.insert(name)
      }
    } label: {
      HStack {
        Label(name, systemImage: icon)
        Spacer()
        if selectedNames.contains(name) {
          Image(systemName: "checkmark.circle.fill")
            .foregroundStyle(Color.accentColor)
        }
      }
      .padding()
      .background(Color(.secondarySystemBackground))
      .clipShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.plain)
  }

  private var panicButtonPage: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Set up your panic button")
        .font(.title2.bold())
        .padding(.top, 60)
      Text("Bind logging to a physical gesture so it takes zero thought in the moment.")
        .font(.subheadline)
        .foregroundStyle(.secondary)

      VStack(alignment: .leading, spacing: 12) {
        instruction("1", "Open the Shortcuts app and create a new shortcut with the \"Log urge\" action from Urge.")
        instruction("2", "Back Tap: Settings, Accessibility, Touch, Back Tap, Triple Tap, pick your shortcut.")
        instruction("3", "Action Button (iPhone 15 Pro and later): Settings, Action Button, Shortcut, pick \"Log urge\".")
      }
      .padding()
      .background(Color(.secondarySystemBackground))
      .clipShape(RoundedRectangle(cornerRadius: 14))

      Text("You can also just use the big button on the Today screen.")
        .font(.footnote)
        .foregroundStyle(.secondary)

      Spacer()

      Button {
        page = 3
      } label: {
        Text("Continue")
          .frame(maxWidth: .infinity)
          .padding(.vertical, 6)
      }
      .buttonStyle(.borderedProminent)
    }
    .padding()
  }

  private func instruction(_ number: String, _ text: String) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Text(number)
        .font(.headline)
        .frame(width: 24, height: 24)
        .background(Color.accentColor.opacity(0.2))
        .clipShape(Circle())
      Text(text)
        .font(.callout)
    }
  }

  private var privacyPage: some View {
    OnboardPage(
      icon: "lock.shield",
      title: "Your data stays on this phone",
      body: "No account. No cloud database. Logs live on your device only. The AI coach sees anonymous counts and times, never your notes. We will also ask to send you one reminder per timer.",
      buttonTitle: "Done"
    ) {
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
      store.onboarded = true
    }
  }

  private func applySelection() {
    let icons = Dictionary(uniqueKeysWithValues: Urge.defaults.map { ($0.name, $0.icon) })
    let list = selectedNames.sorted().map { name in
      Urge(id: UUID(), name: name, icon: icons[name] ?? "hand.raised")
    }
    store.setUrges(list)
  }
}

struct OnboardPage: View {
  let icon: String
  let title: String
  let body_: String
  let buttonTitle: String
  let action: () -> Void

  init(icon: String, title: String, body: String, buttonTitle: String, action: @escaping () -> Void) {
    self.icon = icon
    self.title = title
    self.body_ = body
    self.buttonTitle = buttonTitle
    self.action = action
  }

  var body: some View {
    VStack(spacing: 20) {
      Spacer()
      Image(systemName: icon)
        .font(.system(size: 56))
        .foregroundStyle(Color.accentColor)
      Text(title)
        .font(.title.bold())
        .multilineTextAlignment(.center)
      Text(body_)
        .font(.body)
        .multilineTextAlignment(.center)
        .foregroundStyle(.secondary)
      Spacer()
      Button(action: action) {
        Text(buttonTitle)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 6)
      }
      .buttonStyle(.borderedProminent)
    }
    .padding(24)
  }
}
