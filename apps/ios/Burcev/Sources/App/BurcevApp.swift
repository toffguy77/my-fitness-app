import SwiftUI

@main
struct BurcevApp: App {
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task { await session.restore() }
        }
    }
}

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        switch session.state {
        case .restoring:
            ProgressView()
                .controlSize(.large)
        case .signedOut:
            LoginView()
        case let .signedIn(user):
            switch user.role {
            case .coordinator:
                CuratorTabs()
            default:
                // Клиент и всё прочее. Суперадмин работает на сайте, но
                // войти и посмотреть клиентскую часть ему ничто не мешает.
                ClientTabs()
            }
        }
    }
}

struct ClientTabs: View {
    var body: some View {
        TabView {
            TodayView().tabItem { Label("Сегодня", systemImage: "sun.max") }
            DiaryView().tabItem { Label("Дневник", systemImage: "fork.knife") }
            ConversationsView().tabItem { Label("Чат", systemImage: "bubble.left.and.bubble.right") }
            ProfileView().tabItem { Label("Профиль", systemImage: "person.crop.circle") }
        }
    }
}

struct CuratorTabs: View {
    var body: some View {
        TabView {
            ClientsView().tabItem { Label("Клиенты", systemImage: "person.2") }
            ConversationsView().tabItem { Label("Чат", systemImage: "bubble.left.and.bubble.right") }
            ProfileView().tabItem { Label("Профиль", systemImage: "person.crop.circle") }
        }
    }
}
