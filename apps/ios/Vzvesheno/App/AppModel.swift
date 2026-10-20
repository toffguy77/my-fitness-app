import API
import Client
import Curator
import DesignSystem
import Foundation
import Health
import Navigation
import Observation
import Outbox
import Session
import Surfaces

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
    internal(set) var offline = false
    internal(set) var config: ClientConfig?
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
    internal(set) var profileName: String?
    /// Модель «Сегодня» вошедшего клиента.
    internal(set) var today: TodayModel?
    /// «Дневник», нутриенты и «Меню» вошедшего клиента.
    internal(set) var diary: DiaryModel?
    /// Вода дня — одна на «Сегодня» и «Дневник».
    internal(set) var water: WaterLedger?
    internal(set) var nutrients: NutrientsModel?
    internal(set) var mealPlan: MealPlanModel?
    internal(set) var recipes: RecipeCatalogModel?
    internal(set) var shopping: ShoppingModel?
    /// Открытый лист «Записать еду».
    var foodLog: FoodLogRequest?
    /// Переписка с куратором, лента статей и уведомления вошедшего клиента.
    internal(set) var chat: ChatModel?
    internal(set) var articles: ArticleFeedModel?
    internal(set) var notifications: NotificationsModel?
    /// Экраны куратора и суперадмина: «Клиенты», «Чаты», «Заявки», «Обращения».
    internal(set) var curator: CuratorWorkspace?
    /// Задача, подсвеченная на «Сегодня» (пуш или уведомление о задаче).
    var highlightedTask: String?
    /// «Выполнено» в пуше задачи-тренировки: лист вида и длительности.
    var workoutSheetTask: String?
    /// «Сменить часовой пояс на {пояс}?» — пояс устройства.
    var timeZoneOffer: String?
    /// Разрешение iOS на уведомления — колонка «Пуш» в настройках.
    internal(set) var notificationPermission: NotificationPermission = .notDetermined
    /// «Оформление» — на устройстве.
    var appearance: Appearance = .auto {
        didSet { preferences.set(appearance.rawValue, forKey: "appearance") }
    }
    var profileTimeZone = TimeZone.current
    /// Ссылка входа пришла при открытой сессии — ждёт подтверждения
    /// «Войти в другой аккаунт? Текущий сеанс завершится».
    var authLinkAwaitingConfirmation: AuthLink?
    /// Отказ сервера на изменение из очереди без своего экрана (Здоровье,
    /// виджеты у куратора и т. п.) — общее сообщение.
    var outboxNotice: String?
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
    /// Снимок дня для виджетов: пишет только вошедший аккаунт.
    let surfaces: SnapshotPublisher
    /// Экран, который попросил открыть App Intent, пока приложение не было готово.
    let surfaceRoutes: PendingRouteStore
    /// «Сегодня» → снимок (только у клиента).
    var todaySurface: TodaySurfaceSync?
    let health: HealthSync
    private let healthStore: HealthStore
    let messages = ErrorMessages()
    let realtime: RealtimeConnection
    let push: PushRegistrar
    /// Вложения переписки и архив выгрузки — в каталоге аккаунта.
    let files: AccountFiles
    let permissions: NotificationPermissionProvider
    let timeZones: TimeZoneSuggestionStore
    let preferences: UserDefaults
    let photoWeeks: PhotoWeekStore
    /// Найденные по штрихкоду продукты — на 90 дней.
    let barcodeCache: BarcodeCache
    let shoppingMarks: FileShoppingMarks
    var realtimeTask: Task<Void, Never>?
    /// Экран из ссылки или пуша, пришедших до оболочки (`ios-deep-links`).
    var pendingLink: ScreenLink?
    private let configLoader: ConfigLoader
    let configCache: ConfigCache
    private var pendingPKCE: PKCEPair?
    private var serverRole: Role?
    private var started = false
    /// Восстановление сессии из Keychain: досылка, передний план и пуш ждут
    /// его, иначе они видели бы «никто не вошёл».
    var restoring: Task<Void, Never>?
    /// Отказы из расширения виджетов (App Group).
    let rejections: RejectionLog
    /// Изображения: общий кэш и кэш аккаунта (в `Cache/` — стирается с кэшем экранов).
    let imageLoaders: ImageLoaders

    init(environment: AppEnvironment, transport: HTTPTransport, secure: SecureStore, installMarker: InstallMarker,
         directory: URL, deviceName: String, healthStore: HealthStore,
         installation: SecureStore = InMemorySecureStore(), pushTokens: DeviceTokenStore = InMemoryDeviceTokenStore(),
         permissions: NotificationPermissionProvider = FixedNotificationPermission(.notDetermined),
         preferences: UserDefaults = .standard, widgets: WidgetReloading = WidgetCenterReloader()) {
        self.environment = environment
        let api = APIClient(baseURL: environment.apiBaseURL, clientHeader: environment.clientHeader, transport: transport)
        self.api = api
        let cache = ScreenCache(root: directory.appendingPathComponent("Cache", isDirectory: true))
        let snapshot = DaySnapshotStore(url: directory.appendingPathComponent(SnapshotRepository.fileName))
        let outboxStore: OutboxStore = (try? SQLiteOutboxStore(url: directory.appendingPathComponent("outbox.sqlite")))
            ?? InMemoryOutboxStore()
        // Вложения переписки, ждущие отправки, — файлами рядом с очередью.
        let outbox = Outbox(store: outboxStore, api: api, files: directory.appendingPathComponent("outbox-files", isDirectory: true))
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
        let surfaces = SnapshotPublisher(repository: SnapshotRepository(store: snapshot), reloader: widgets)
        self.surfaces = surfaces
        let surfaceRoutes = PendingRouteStore(directory: directory)
        self.surfaceRoutes = surfaceRoutes
        self.outbox = outbox
        self.health = health
        self.healthStore = healthStore
        let photoWeeks = FilePhotoWeekStore(url: directory.appendingPathComponent("photo-weeks.json"))
        self.photoWeeks = photoWeeks
        let barcodeCache = BarcodeCache(url: directory.appendingPathComponent("barcodes.json"))
        self.barcodeCache = barcodeCache
        let shoppingMarks = FileShoppingMarks(url: directory.appendingPathComponent("shopping-marks.json"))
        self.shoppingMarks = shoppingMarks
        let files = AccountFiles(root: directory)
        self.files = files
        let rejections = RejectionLog(directory: directory)
        self.rejections = rejections
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        imageLoaders = ImageLoaders.make(shared: caches.appendingPathComponent("vzvesheno-images", isDirectory: true),
                                         account: cache.root.appendingPathComponent("images", isDirectory: true))
        let timeZones = FileTimeZoneSuggestionStore(url: directory.appendingPathComponent("timezone-suggestion.json"))
        self.timeZones = timeZones
        // Выход отписывает телефон от пушей и через `native/logout`
        // (`device_token`): так отписка доходит и без сети в момент выхода.
        session = SessionStore(api: api, secure: secure, installMarker: installMarker,
                               erasers: [AccountEraser(cache: cache, outbox: outbox, surfaces: surfaces,
                                                       surfaceRoutes: surfaceRoutes, health: health,
                                                       photoWeeks: photoWeeks, barcodes: barcodeCache,
                                                       shoppingMarks: shoppingMarks, timeZones: timeZones,
                                                       files: files, rejections: rejections)],
                               deviceToken: { [pushTokens] in pushTokens.load() })
        sessionRef.store = session
        auth = NativeAuthAPI(api: api, deviceName: deviceName)
        realtime = RealtimeConnection(api: api)
        // Идентификатор установки — в отдельной записи Keychain: выход его не
        // стирает, по нему сервер переносит токен к следующему вошедшему.
        push = PushRegistrar(api: api, tokens: pushTokens, environment: PushEnvironment.forApp(environment.name),
                             appVersion: environment.version, installationID: { InstallationID.value(in: installation) })
        self.permissions = permissions
        self.preferences = preferences
        let configCache = FileConfigCache(url: directory.appendingPathComponent("config.json"))
        self.configCache = configCache
        configLoader = ConfigLoader(cache: configCache) {
            try await api.sendBare(.get("/api/v1/config", requiresAuth: false), as: ClientConfig.self)
        }
        appearance = preferences.string(forKey: "appearance").flatMap(Appearance.init(rawValue:)) ?? .auto
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
        let installation = KeychainStore(policy: KeychainPolicy(service: "\(environment.bundleID).installation",
                                                                accessGroup: environment.keychainAccessGroup))
        return AppModel(environment: environment, transport: URLSessionTransport(), secure: secure,
                        installMarker: UserDefaultsInstallMarker(), directory: directory, deviceName: AppEnvironment.deviceName,
                        healthStore: HealthKitStore(), installation: installation, pushTokens: UserDefaultsDeviceTokenStore(),
                        permissions: SystemNotificationPermission())
    }

    // MARK: Запуск

    func start() async {
        guard !started else {
            await ensureRestored()
            return
        }
        started = true
        await ensureRestored()
        Task { await watchSessionEndings() }
        // Никто не вошёл — снимка дня быть не должно (выход без сети, сбой
        // посреди стирания): виджет не покажет данных прежнего аккаунта.
        if user == nil { surfaces.erase() }
        recompute()
        listenToSurfaceRoutes()
        openPendingSurfaceRoute()
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
            await refreshDeletion()
            await refreshLanguage()
        } catch APIError.network {
            offline = true
        } catch {
            // Сессия закончена — это обработает watchSessionEndings.
        }
        recompute()
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
            var entering = true
            if case .shell = before { entering = false }
            if entering { selectedTab = shell.rootTab }
            if shell == .client { stopCurator(); startClient() } else { startStaff(shell) }
            if entering { openPendingLink() }
        } else {
            stopClient()
            stopCurator()
        }
    }

    // MARK: Клиент

    /// «Сегодня» и сокет — пока открыта клиентская оболочка.
    private func startClient() {
        if chat == nil, let userID = user?.id {
            let chat = ChatModel(api: api, outbox: outbox, cache: cache, calendar: DayCalendar(timeZone: profileTimeZone),
                                 userID: userID)
            chat.sendTyping = { [realtime] id in await realtime.sendTyping(conversationID: id) }
            chat.onRead = { [weak self] in Task { await self?.refreshBadge() } }
            self.chat = chat
            articles = ArticleFeedModel(api: api, cache: cache, account: userID)
        }
        if water == nil { startWater() }
        if today == nil {
            // Сохранённый день — в первом кадре: аккаунт известен без ожидания.
            let model = TodayModel(api: api, outbox: outbox, cache: cache, photoWeeks: photoWeeks,
                                   calendar: DayCalendar(timeZone: profileTimeZone), account: user?.id,
                                   userID: { [session] in await session.user?.id })
            model.waterLedger = water
            model.observeDayChanges()
            attachSurface(to: model)
            today = model
            Task { await model.load() }
        }
        if diary == nil { startFood() }
        if realtimeTask == nil { connectRealtime() }
    }

    func stopClient() {
        stopFood()
        water = nil
        today = nil
        todaySurface = nil
        chat = nil
        articles = nil
        notifications = nil
        highlightedTask = nil
        workoutSheetTask = nil
        realtimeTask?.cancel()
        realtimeTask = nil
        Task { await realtime.disconnect() }
    }

    func connectRealtime() {
        realtimeTask?.cancel()
        realtimeTask = Task { [weak self, realtime] in
            for await event in await realtime.connect() {
                await self?.today?.handle(event)
                await self?.chat?.handle(event)
                await self?.curator?.handle(event)
                if case .unreadCount = event { self?.publishStaffSnapshot() }
                if case .unreadCount = event { await self?.refreshBadge() }
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

    /// Выход: сначала отписка устройства (пока сессия действует), затем
    /// `native/logout` и стирание данных аккаунта.
    func signOut() async {
        await push.unregister()
        await session.signOut()
    }

    // MARK: Очередь

    func onForeground() async {
        await ensureRestored()
        await session.flushPendingLogout()
        await drainOutbox()
        await showExtensionRejections()
        openPendingSurfaceRoute()
        if today != nil {
            connectRealtime()
            await today?.refresh()
        }
        await refreshCuratorOnForeground()
        await refreshFood()
        await chat?.flush()
        await refreshConfig()
        await refreshPushState()
        checkTimeZone()
        await health.refresh()
        await refreshHealthState()
    }
}

// MARK: Здоровье

extension AppModel {
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
}
