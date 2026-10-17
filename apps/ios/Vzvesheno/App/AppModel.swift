import API
import DesignSystem
import Foundation
import Navigation
import Observation
import Outbox
import Session
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Всё, что связано с аккаунтом на устройстве, кроме Keychain: стирается при выходе.
struct AccountEraser: AccountDataEraser {
    let cache: ScreenCache
    let outbox: Outbox
    let snapshot: DaySnapshotStore

    func eraseAccountData() async {
        cache.eraseAll()
        await outbox.eraseAll()
        snapshot.erase()
        #if canImport(WidgetKit)
        // Виджет не показывает данные прежнего аккаунта ни минуты.
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

/// Состояние приложения: сессия, выбор оболочки, навигация и вход.
@MainActor
@Observable
final class AppModel {
    /// Шаг экрана входа.
    enum SignInStep: Equatable {
        case form
        case pending(PendingSignIn)
        case resetPassword(token: String)
    }

    private(set) var launch: LaunchState = .loading
    private(set) var user: SessionUser?
    private(set) var offline = false
    private(set) var config: ClientConfig?
    var selectedTab: Tab?
    var paths: [Tab: [Destination]] = [:]
    /// Текст над формой входа: «Сессия завершена, войдите снова».
    var sessionMessage: String?
    var signInStep: SignInStep = .form
    /// Ссылка из письма не сработала — почему.
    var linkError: String?
    /// Ссылка входа пришла при открытой сессии — ждёт подтверждения
    /// «Войти в другой аккаунт? Текущий сеанс завершится».
    var authLinkAwaitingConfirmation: AuthLink?
    /// Справочник компонентов открыт (только Dev-сборка).
    var showCatalogue = false

    let environment: AppEnvironment
    let api: APIClient
    let session: SessionStore
    let auth: NativeAuthAPI
    let outbox: Outbox
    let cache: ScreenCache
    let snapshot: DaySnapshotStore
    let messages = ErrorMessages()
    private let pendingLinks = PendingLinkStore()
    private let configLoader: ConfigLoader
    private let configCache: ConfigCache
    private var pendingPKCE: PKCEPair?
    private var serverRole: Role?
    private var started = false

    init(environment: AppEnvironment, transport: HTTPTransport, secure: SecureStore, installMarker: InstallMarker,
         directory: URL, deviceName: String) {
        self.environment = environment
        let api = APIClient(baseURL: environment.apiBaseURL, clientHeader: environment.clientHeader, transport: transport)
        self.api = api
        let cache = ScreenCache(root: directory.appendingPathComponent("Cache", isDirectory: true))
        let snapshot = DaySnapshotStore(url: directory.appendingPathComponent("today-snapshot.json"))
        let outboxStore: OutboxStore = (try? SQLiteOutboxStore(url: directory.appendingPathComponent("outbox.sqlite")))
            ?? InMemoryOutboxStore()
        let outbox = Outbox(store: outboxStore, api: api)
        self.cache = cache
        self.snapshot = snapshot
        self.outbox = outbox
        session = SessionStore(api: api, secure: secure, installMarker: installMarker,
                               erasers: [AccountEraser(cache: cache, outbox: outbox, snapshot: snapshot)])
        auth = NativeAuthAPI(api: api, deviceName: deviceName)
        let configCache = FileConfigCache(url: directory.appendingPathComponent("config.json"))
        self.configCache = configCache
        configLoader = ConfigLoader(cache: configCache) {
            try await api.sendBare(.get("/api/v1/config", requiresAuth: false), as: ClientConfig.self)
        }
    }

    /// Приложение на устройстве: Keychain с общей группой, файлы в App Group.
    static func live() -> AppModel {
        let environment = AppEnvironment.current()
        #if DEBUG
        if let scenario = UITestScenario.current {
            return scenario.makeModel(environment: environment)
        }
        #endif
        let directory = ProtectedFiles.directory(appGroup: environment.appGroupID)
        try? ProtectedFiles.prepareDirectory(directory)
        let secure = KeychainStore(policy: KeychainPolicy(service: "\(environment.bundleID).session",
                                                          accessGroup: environment.keychainAccessGroup))
        return AppModel(environment: environment, transport: URLSessionTransport(), secure: secure,
                        installMarker: UserDefaultsInstallMarker(), directory: directory, deviceName: AppEnvironment.deviceName)
    }

    // MARK: Запуск

    func start() async {
        guard !started else { return }
        started = true
        await session.attach()
        Task { await watchSessionEndings() }

        // Решение о версии — сразу по сохранённой конфигурации, затем по свежей.
        config = configCache.load()
        user = await session.restore()
        recompute()
        Task { await refreshConfig() }
        if user != nil {
            await refreshProfile()
        }
        await session.flushPendingLogout()
    }

    func refreshConfig() async {
        let fresh = await configLoader.load()
        if let fresh { config = fresh }
        recompute()
    }

    /// Роль — из ответа сервера; без сети — из сохранённого профиля.
    func refreshProfile() async {
        struct CurrentUser: Decodable, Sendable {
            struct Body: Decodable, Sendable {
                let id: Int64
                let email: String
                let role: String
            }
            let user: Body
        }
        do {
            let me: CurrentUser = try await api.send(.get("/api/v1/auth/me"))
            serverRole = Role(me.user.role)
            offline = false
            if var current = await session.user {
                current = SessionUser(id: current.id, email: me.user.email, name: current.name, role: me.user.role,
                                      emailVerified: current.emailVerified, onboardingCompleted: current.onboardingCompleted)
                await session.updateUser(current)
                user = current
            }
            Telemetry.identify(id: me.user.id, role: me.user.role)
            await refreshLanguage()
        } catch APIError.network {
            offline = true
        } catch {
            // Сессия закончена — это обработает watchSessionEndings.
        }
        recompute()
    }

    private func refreshLanguage() async {
        struct Profile: Decodable, Sendable {
            struct Settings: Decodable, Sendable { let language: String? }
            let settings: Settings?
        }
        let profile = try? await api.send(.get("/api/v1/users/profile"), as: Profile.self)
        await api.setLanguage(profile?.settings?.language)
    }

    private func recompute() {
        let before = launch
        launch = LaunchState.resolve(
            isSignedIn: user != nil,
            serverRole: serverRole,
            cachedRole: user.map { Role($0.role) },
            serverUnreachable: offline,
            updateRequired: VersionGate.isUpdateRequired(current: environment.version, config: config)
        )
        if case let .shell(shell, _) = launch {
            if case .shell = before {} else { selectedTab = shell.rootTab }
        }
    }

    private func watchSessionEndings() async {
        for await reason in await session.endings() {
            if reason == .ended {
                sessionMessage = messages.message(for: APIError.sessionEnded)
            }
            user = nil
            serverRole = nil
            paths = [:]
            signInStep = .form
            Telemetry.identify(id: nil, role: nil)
            recompute()
        }
    }

    // MARK: Вход

    /// Итог шага входа: сессия — в Keychain, продолжение — на экран.
    func complete(_ outcome: SignInOutcome) async throws {
        switch outcome {
        case let .pending(pending):
            signInStep = .pending(pending)
        case let .signedIn(newSession, _):
            // Сессию другого человека молча не заменяет (AccountSwitchNotConfirmed);
            // смену аккаунта человек подтверждает до этого — confirmSwitchingAccount.
            try await session.adopt(newSession)
            user = newSession.user
            sessionMessage = nil
            signInStep = .form
            serverRole = nil
            recompute()
            await refreshProfile()
            if let link = await pendingLinks.take() {
                open(link)
            }
        }
    }

    func cancelPendingSignIn() {
        signInStep = .form
    }

    /// Начало входа через Яндекс или VK: адрес для ASWebAuthenticationSession.
    func providerStartURL(_ provider: String) -> URL? {
        let pkce = PKCEPair.random()
        pendingPKCE = pkce
        return auth.providerStartURL(provider: provider, pkce: pkce)
    }

    /// Возврат входа через провайдера на `/auth/native-complete?code=…`.
    func finishProviderSignIn(code: String) async throws {
        defer { pendingPKCE = nil }
        guard let pkce = pendingPKCE else {
            // Вход начат не в этом запуске приложения: verifier потерян.
            throw APIError.server(status: 401, code: "token_invalid", params: [:])
        }
        try await complete(try await auth.exchange(code: code, pkce: pkce))
    }

    /// Причина отказа из `/auth/native-complete?error=…` — человеческими словами.
    static func providerFailureMessage(_ reason: String?) -> String {
        switch reason {
        case "cancelled": return "Вход отменён."
        case "unavailable": return "Вход через этот сервис сейчас недоступен."
        default: return "Не получилось войти. Попробуйте ещё раз или войдите по ссылке из письма."
        }
    }

    func signOut() async {
        await session.signOut()
    }

    // MARK: Ссылки

    /// Universal link: ссылки входа — без сессии, экраны — после входа.
    func open(_ url: URL) async {
        guard let link = Router.parse(url) else { return }
        switch link {
        case let .auth(authLink):
            // Не `user`: при холодном запуске по ссылке restore() ещё не
            // прошёл, и сессия есть только в Keychain.
            let hasSession = await session.hasStoredSession()
            switch AuthLinkDecision.decide(authLink, hasSession: hasSession) {
            case .handle:
                await handle(authLink)
            case .confirmSwitchingAccount:
                authLinkAwaitingConfirmation = authLink
            }
        case let .screen(screen):
            open(screen)
        }
    }

    /// Человек подтвердил вход в другой аккаунт: текущий сеанс завершается,
    /// затем ссылка обрабатывается.
    func confirmSwitchingAccount() async {
        guard let link = authLinkAwaitingConfirmation else { return }
        authLinkAwaitingConfirmation = nil
        await signOut()
        user = nil
        recompute()
        await handle(link)
    }

    func cancelSwitchingAccount() {
        authLinkAwaitingConfirmation = nil
    }

    private func handle(_ link: AuthLink) async {
        switch link {
        case let .magicLink(token):
            do {
                try await complete(try await auth.consumeMagicLink(token: token))
            } catch {
                linkError = messages.message(for: error)
            }
        case let .resetPassword(token):
            signInStep = .resetPassword(token: token)
        case let .providerComplete(code, reason):
            guard let code else {
                linkError = Self.providerFailureMessage(reason)
                return
            }
            do {
                try await finishProviderSignIn(code: code)
            } catch {
                linkError = messages.message(for: error)
            }
        }
    }

    /// `target` пуша.
    func open(_ target: PushTarget) {
        open(Router.link(for: target))
    }

    func open(_ link: ScreenLink) {
        guard case let .shell(shell, _) = launch else {
            Task { await pendingLinks.remember(link) }
            return
        }
        let target = Router.target(for: link, shell: shell)
        selectedTab = target.tab
        if let tab = target.tab {
            paths[tab] = target.path
        }
    }

    // MARK: Очередь

    func onForeground() async {
        await session.flushPendingLogout()
        await drainOutbox()
        await refreshConfig()
    }

    func drainOutbox() async {
        await outbox.drain(userID: user?.id)
    }
}
