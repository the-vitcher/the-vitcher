import SwiftUI

struct SettingsView: View {
  @EnvironmentObject var store: EventStore

  @State private var newUrgeName = ""
  @State private var confirmingDelete = false

  var body: some View {
    NavigationStack {
      List {
        Section("Urges") {
          ForEach(store.urges) { urge in
            Label(urge.name, systemImage: urge.icon)
          }
          .onDelete { indexSet in
            for i in indexSet {
              store.removeUrge(store.urges[i])
            }
          }
          HStack {
            TextField("add an urge", text: $newUrgeName)
            Button("Add") {
              let trimmed = newUrgeName.trimmingCharacters(in: .whitespaces)
              guard !trimmed.isEmpty else { return }
              store.addUrge(name: trimmed)
              newUrgeName = ""
            }
          }
        }

        Section("Data") {
          if let data = store.exportJSON() {
            ShareLink(
              item: String(decoding: data, as: UTF8.self),
              preview: SharePreview("Urge data export")
            ) {
              Label("Export data", systemImage: "square.and.arrow.up")
            }
          }
          Button(role: .destructive) {
            confirmingDelete = true
          } label: {
            Label("Delete all logs", systemImage: "trash")
          }
        }

        Section("About") {
          LabeledContent("Storage", value: "on device only")
          LabeledContent("Version", value: "0.1")
        }
      }
      .navigationTitle("Settings")
      .confirmationDialog(
        "Delete all logged urges? This cannot be undone.",
        isPresented: $confirmingDelete,
        titleVisibility: .visible
      ) {
        Button("Delete everything", role: .destructive) {
          store.deleteAllData()
        }
      }
    }
  }
}
