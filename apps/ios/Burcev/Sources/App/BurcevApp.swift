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
    @State private var selection: Demo.Screen = Demo.screen ?? .today

    var body: some View {
        TabView(selection: $selection) {
            TodayView().tabItem { Label("Сегодня", systemImage: "sun.max") }.tag(Demo.Screen.today)
            DiaryView().tabItem { Label("Дневник", systemImage: "fork.knife") }.tag(Demo.Screen.diary)
            ConversationsView().tabItem { Label("Чат", systemImage: "bubble.left.and.bubble.right") }.tag(Demo.Screen.chat)
            ProfileView().tabItem { Label("Ещё", systemImage: "ellipsis.circle") }.tag(Demo.Screen.profile)
        }
    }
}

struct CuratorTabs: View {
    @State private var selection: Demo.Screen = {
        switch Demo.screen {
        case .chat: return .chat
        case .profile: return .profile
        default: return .clients
        }
    }()

    var body: some View {
        TabView(selection: $selection) {
            ClientsView().tabItem { Label("Клиенты", systemImage: "person.2") }.tag(Demo.Screen.clients)
            ConversationsView().tabItem { Label("Чат", systemImage: "bubble.left.and.bubble.right") }.tag(Demo.Screen.chat)
            ProfileView().tabItem { Label("Ещё", systemImage: "ellipsis.circle") }.tag(Demo.Screen.profile)
        }
    }
}
