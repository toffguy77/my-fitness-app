import API
import Client
import DesignSystem
import Foundation
import Health
import Navigation
import Observation
import Outbox
import Session
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Состояние приложения: сессия, выбор оболочки, навигация и вход.
@MainActor
@Observable
final class AppModel {
    /// Шаг экрана входа.
    enum SignInStep: Equatable {
        case form
        case pending(PendingSignIn)
        case resetPassword(token: String)
        /// Ссылка из письма не подошла: просрочена, использована или чужая.
        case linkExpired
    }

    private(set) var launch: LaunchState = .loading
    internal(set) var user: SessionUser?
    private(set) var offline = false
    private(set) var config: ClientConfig?
    var selectedTab: AppTab?
    var paths: [AppTab: [Destination]] = [:]
    /// Текст над формой входа: «Сессия завершена, войдите снова».
    var sessionMessage: String?
    var signInStep: SignInStep = .form
    /// Ссылка из письма не сработала — почему.
    var linkError: String?
    /// Вход аккаунта, ждущего удаления: экран «Аккаунт будет удалён».
    internal(set) var pendingDeletion: PendingDeletion?
    /// Имя из профиля — для аватара в шапке.
    private(set) var profileName: String?
    /// Модель «Сегодня» вошедшего клиента.
    private(set) var today: TodayModel?
    /// «Дневник», нутриенты и «Меню» вошедшего клиента.
    internal(set) var diary: DiaryModel?
    internal(set) var nutrients: NutrientsModel?
    internal(set) var mealPlan: MealPlanModel?
    internal(set) var recipes: RecipeCatalogModel?
    internal(set) var shopping: ShoppingModel?
    /// Открытый лист «Записать еду».
    var foodLog: FoodLogRequest?
    var profileTimeZone = TimeZone.current
    /// Ссылка входа пришла при открытой сессии — ждёт подтверждения
    /// «Войти в другой аккаунт? Текущий сеанс завершится».
    var authLinkAwaitingConfirmation: AuthLink?
    /// Справочник компонентов открыт (только Dev-сборка).
    var showCatalogue = false
    /// Здоровье подключено в профиле приложения.
    private(set) var healthConnected = false
    /// Здоровье есть на устройстве.
    private(set) var healthAvailable = true
    /// «Нет данных из Здоровья за 3 дня — проверьте доступ» на «Сегодня».
    private(set) var healthAccessHint = false
    #if DEBUG
    /// Сколько раз сценарий UI-теста получил системный запрос Здоровья.
    private(set) var uiTestHealthAuthorizationRequests: Int?
    #endif

    let environment: AppEnvironment
    let api: APIClient
    let session: SessionStore
    let auth: NativeAuthAPI
    let outbox: Outbox
    let cache: ScreenCache
    let snapshot: DaySnapshotStore
    let health: HealthSync
    private let healthStore: HealthStore
    let messages = ErrorMessages()
    let realtime: RealtimeConnection
    let photoWeeks: PhotoWeekStore
    /// Найденные по штрихкоду продукты — на 90 дней.
    let barcodeCache: BarcodeCache
    let shoppingMarks: FileShoppingMarks
    private var realtimeTask: Task<Void, Never>?
    private let pendingLinks = PendingLinkStore()
    private let configLoader: ConfigLoader
    private let configCache: ConfigCache
    private var pendingPKCE: PKCEPair?
    private var serverRole: Role?
    private var started = false

    init(environment: AppEnvironment, transport: HTTPTransport, secure: SecureStore, installMarker: InstallMarker,
         directory: URL, deviceName: String, healthStore: HealthStore) {
        self.environment = environment
        let api = APIClient(baseURL: environment.apiBaseURL, clientHeader: environment.clientHeader, transport: transport)
        self.api = api
        let cache = ScreenCache(root: directory.appendingPathComponent("Cache", isDirectory: true))
        let snapshot = DaySnapshotStore(url: directory.appendingPathComponent("today-snapshot.json"))
        let outboxStore: OutboxStore = (try? SQLiteOutboxStore(url: directory.appendingPathComponent("outbox.sqlite")))
            ?? InMemoryOutboxStore()
        let outbox = Outbox(store: outboxStore, api: api)
        // Сессия создаётся после Здоровья (её стиратели включают Здоровье),
        // а Здоровью нужен вошедший пользователь — ссылка заполняется ниже.
        let sessionRef = SessionRef()
        // Состояние Здоровья — в каталоге аккаунта: фоновая доставка читает
        // якоря и часовой пояс профиля на заблокированном телефоне.
        let health = HealthSync(
            store: healthStore, outbox: outbox,
            stateStore: FileHealthStateStore(url: directory.appendingPathComponent("health-state.json")),
            currentUser: { [sessionRef] in await sessionRef.store?.user?.id },
            drain: { [outbox] userID in await outbox.drain(userID: userID) }
        )
        self.cache = cache
        self.snapshot = snapshot
        self.outbox = outbox
        self.health = health
        self.healthStore = healthStore
        let photoWeeks = FilePhotoWeekStore(url: directory.appendingPathComponent("photo-weeks.json"))
        self.photoWeeks = photoWeeks
        let barcodeCache = BarcodeCache(url: directory.appendingPathComponent("barcodes.json"))
        self.barcodeCache = barcodeCache
        let shoppingMarks = FileShoppingMarks(url: directory.appendingPathComponent("shopping-marks.json"))
        self.shoppingMarks = shoppingMarks
        session = SessionStore(api: api, secure: secure, installMarker: installMarker,
                               erasers: [AccountEraser(cache: cache, outbox: outbox, snapshot: snapshot, health: health,
                                                       photoWeeks: photoWeeks, barcodes: barcodeCache,
                                                       shoppingMarks: shoppingMarks)])
        sessionRef.store = session
        auth = NativeAuthAPI(api: api, deviceName: deviceName)
        realtime = RealtimeConnection(api: api)
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
                        installMarker: UserDefaultsInstallMarker(), directory: directory, deviceName: AppEnvironment.deviceName,
                        healthStore: HealthKitStore())
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
        // Наблюдатели Здоровья живут до конца процесса: при каждом запуске,
        // в том числе фоновом по событию Здоровья, — заново и после restore(),
        // чтобы досылке было чьим токеном отправлять.
        let userID = user?.id
        Task {
            await health.resume(userID: userID)
            await refreshHealthState()
        }
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

    /// `GET /users/profile` → `{profile: {name, onboarding_completed, settings}}`:
    /// язык запросов, пояс профиля и признак онбординга. (Раньше разбиралось
    /// без обёртки `profile`, и язык с поясом не применялись.)
    private func refreshLanguage() async {
        struct Answer: Decodable, Sendable {
            struct Profile: Decodable, Sendable {
                struct Settings: Decodable, Sendable {
                    let language: String?
                    let timezone: String?
                }
                let name: String?
                let onboardingCompleted: Bool?
                let settings: Settings?

                enum CodingKeys: String, CodingKey {
                    case name, settings
                    case onboardingCompleted = "onboarding_completed"
                }
            }
            let profile: Profile
        }
        guard let answer = try? await api.send(.get("/api/v1/users/profile"), as: Answer.self) else { return }
        let profile = answer.profile
        profileName = profile.name
        await api.setLanguage(profile.settings?.language)
        // Сутки шагов и дата взвешивания — по поясу профиля, не устройства.
        if let timezone = profile.settings?.timezone {
            await health.setTimeZone(timezone)
            if let zone = TimeZone(identifier: timezone), zone != profileTimeZone {
                profileTimeZone = zone
                today = nil
                diary = nil
            }
        }
        if let completed = profile.onboardingCompleted, var current = await session.user, current.onboardingCompleted != completed {
            current.onboardingCompleted = completed
            await session.updateUser(current)
            user = current
        }
    }

    func recompute() {
        let before = launch
        launch = LaunchState.resolve(
            isSignedIn: user != nil,
            serverRole: serverRole,
            cachedRole: user.map { Role($0.role) },
            serverUnreachable: offline,
            updateRequired: VersionGate.isUpdateRequired(current: environment.version, config: config),
            pendingDeletion: pendingDeletion != nil,
            emailVerified: user?.emailVerified,
            onboardingCompleted: user?.onboardingCompleted
        )
        if case let .shell(shell, _) = launch {
            if case .shell = before {} else { selectedTab = shell.rootTab }
            if shell == .client { startClient() }
        } else {
            stopClient()
        }
    }

    // MARK: Клиент

    /// «Сегодня» и сокет — пока открыта клиентская оболочка.
    private func startClient() {
        if today == nil {
            let model = TodayModel(api: api, outbox: outbox, cache: cache, photoWeeks: photoWeeks,
                                   calendar: DayCalendar(timeZone: profileTimeZone),
                                   userID: { [session] in await session.user?.id })
            model.onWaterChanged = { [health] day, glasses, glassSize in
                Task { await health.setWater(day: day, glasses: glasses, glassMilliliters: Double(glassSize), at: Date()) }
            }
            model.observeDayChanges()
            today = model
            Task { await model.load() }
        }
        if diary == nil { startFood() }
        if realtimeTask == nil { connectRealtime() }
    }

    private func stopClient() {
        stopFood()
        today = nil
        realtimeTask?.cancel()
        realtimeTask = nil
        Task { await realtime.disconnect() }
    }

    private func connectRealtime() {
        realtimeTask?.cancel()
        realtimeTask = Task { [weak self, realtime] in
            for await event in await realtime.connect() {
                await self?.today?.handle(event)
            }
        }
    }

    /// Приложение ушло в фон: сокет закрывается, вернётся по переднему плану.
    func onBackground() {
        realtimeTask?.cancel()
        realtimeTask = nil
        Task { await realtime.disconnect() }
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
            pendingDeletion = nil
            profileName = nil
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
            pendingDeletion = newSession.pendingDeletion
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
            } catch APIError.server(_, .some("token_invalid"), _) {
                // Просроченная, использованная и поддельная ссылка сервер не
                // различает — для человека это одно: «Ссылка устарела».
                signInStep = .linkExpired
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
        if shell == .client, openFoodTracker(link) { return }
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
        if today != nil {
            connectRealtime()
            await today?.refresh()
        }
        await refreshFood()
        await refreshConfig()
        await health.refresh()
        await refreshHealthState()
    }

    // MARK: Здоровье

    /// «Продолжить» на экране подключения. `false` — Здоровья на устройстве
    /// нет или запрос не удался.
    func connectHealth() async -> Bool {
        guard let userID = user?.id else { return false }
        let connected = (try? await health.connect(userID: userID)) ?? false
        await refreshHealthState()
        return connected
    }

    func disconnectHealth() async {
        await health.disconnect()
        await refreshHealthState()
    }

    func refreshHealthState() async {
        healthConnected = await health.isConnected
        healthAvailable = await health.isAvailable
        healthAccessHint = await health.showsAccessHint()
        #if DEBUG
        uiTestHealthAuthorizationRequests = (healthStore as? InMemoryHealthStore)?.authorizationRequests
        #endif
    }

    func drainOutbox() async {
        await outbox.drain(userID: user?.id)
    }
}
