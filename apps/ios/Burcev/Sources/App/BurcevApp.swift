import SwiftUI

@main
struct BurcevApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = SessionStore()

    init() {
        Telemetry.start()
    }
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task {
                    PushRegistrar.shared.session = session
                    PushRegistrar.shared.onOpen = { url in
                        // Ссылки уведомлений — пути сайта. Статью открываем
                        // в приложении; прочее — приложение уже открыто.
                        if url.hasPrefix("/content/") {
                            session.openArticleID = String(url.dropFirst("/content/".count))
                        }
                    }
                    await session.restore()
                }
                .onOpenURL { url in Task { await session.handle(url) } }
                .onChange(of: scenePhase) { _, phase in
                    // В фоне соединение держать незачем — iOS всё равно его
                    // оборвёт; на экране — поднимаем заново.
                    guard session.user != nil else { return }
                    if phase == .active { session.socket.start() } else if phase == .background { session.socket.stop() }
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { Task { await session.handle(url) } }
                }
        }
    }
}

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        content
            .sheet(item: Binding(get: { session.resetToken.map(ResetToken.init) },
                                 set: { if $0 == nil { session.resetToken = nil } })) { token in
                ResetPasswordView(token: token.id)
            }
            .sheet(item: Binding(get: { session.openArticleID.map(ResetToken.init) },
                                 set: { if $0 == nil { session.openArticleID = nil } })) { article in
                NavigationStack { ArticleView(articleID: article.id) }
            }
            .alert("Не получилось войти по ссылке", isPresented: Binding(
                get: { session.linkError != nil }, set: { if !$0 { session.linkError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(session.linkError ?? "")
            }
    }

    private struct ResetToken: Identifiable { let id: String }

    @ViewBuilder
    private var content: some View {
        switch session.state {
        case .restoring:
            ProgressView()
                .controlSize(.large)
        case .signedOut:
            LoginView()
        case let .signedIn(user) where user.role == .client && user.email_verified == false:
            VerifyEmailView()
        case let .signedIn(user) where user.role == .client && user.onboarding_completed == false:
            OnboardingView()
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
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection: Demo.Screen = Demo.screen ?? .today

    var body: some View {
        TabView(selection: $selection) {
            TodayView().tabItem { Label("Сегодня", systemImage: "sun.max") }.tag(Demo.Screen.today)
            DiaryView().tabItem { Label("Дневник", systemImage: "fork.knife") }.tag(Demo.Screen.diary)
            MenuView().tabItem { Label("Меню", systemImage: "menucard") }.tag(Demo.Screen.menu)
            ConversationsView().tabItem { Label("Чат", systemImage: "bubble.left.and.bubble.right") }
                .badge(session.socket.unreadTotal).tag(Demo.Screen.chat)
            ProfileView().tabItem { Label("Ещё", systemImage: "ellipsis.circle") }.tag(Demo.Screen.profile)
        }
        // Команда «Открыть дневник» оставляет, какую вкладку показать.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active,
                  let raw = UserDefaults.standard.string(forKey: "launch.tab"),
                  let tab = Demo.Screen(rawValue: raw) else { return }
            UserDefaults.standard.removeObject(forKey: "launch.tab")
            selection = tab
        }
    }
}

struct CuratorTabs: View {
    @Environment(SessionStore.self) private var session
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
            ConversationsView().tabItem { Label("Чат", systemImage: "bubble.left.and.bubble.right") }
                .badge(session.socket.unreadTotal).tag(Demo.Screen.chat)
            LeadsAndSupportView().tabItem { Label("Заявки", systemImage: "tray") }.tag(Demo.Screen.leads)
            ProfileView().tabItem { Label("Ещё", systemImage: "ellipsis.circle") }.tag(Demo.Screen.profile)
        }
    }
}
