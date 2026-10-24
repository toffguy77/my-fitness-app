#if DEBUG
import API
import Client
import Foundation
import Health
import Session

/// Сценарии UI-тестов: приложение запускается с `-uiTestScenario <имя>` и
/// ходит не в сеть, а в заготовленные ответы. Только отладочная сборка.
///
/// Дополнительные аргументы:
/// - `-uiTestProviders yandex,apple` — ответ `GET /auth/providers`;
/// - `-uiTestOpenURL <адрес>` — universal link сразу после запуска;
/// - `-uiTestPendingConsents` — вход через провайдера создаёт аккаунт:
///   открыт экран согласий;
/// - `-uiTestFoodOffline` — изменения дневника не доходят до сервера (нет
///   сети), чтения работают: запись остаётся «ждёт отправки»;
/// - `-uiTestCuratorAccess none|expired|noCurator` — доступ к куратору;
/// - `-uiTestPickFile 14mb` — «Файл» в переписке выбирает файл этого размера;
/// - `-uiTestPushPermission denied|notDetermined|authorized` — разрешение iOS
///   на уведомления (по умолчанию выдано);
/// - `-uiTestNoPassword` — аккаунт без пароля (вход через Apple);
/// - куратор (`UITestScenario+Curator.swift`): `-uiTestBenchmarkDown` — бенчмарк
///   отвечает 500; `-uiTestCuratorSaveFails` — цели клиента не сохраняются;
///   `-uiTestFoodEntryOffline` — КБЖУ по фото не доходит; `-uiTestLeadConflict`
///   — «Обработана» отвечает 409 `lead_already_claimed`;
/// - `-uiTestStore <имя>` — каталог данных постоянный между запусками
///   (`tmp/uitest-<имя>`), `-uiTestResetStore` — очистить его при запуске:
///   первый запуск с сетью наполняет кэш экранов, второй его показывает;
/// - `-uiTestAppleNonceOffline` — nonce входа через Apple не получить (нет
///   сети): лист Apple не должен открываться;
/// - `-uiTestOffline` — нет сети совсем (любая роль), в отличие от
///   `offlineClient`, у которого роль закреплена, а кэша нет;
/// - `-uiTestShot <экран>` — снимок для App Store (`UITestScenario+Screenshots.swift`).
enum UITestScenario: String {
    case client
    case coordinator
    case superAdmin = "super_admin"
    case nutritionist
    /// Версия ниже минимальной из /config.
    case update
    case signedOut
    /// Нет сети, а в Keychain — профиль клиента.
    case offlineClient
    /// Клиент только что зарегистрировался: онбординг не пройден.
    case newClient
    /// Вход выполнен, почта не подтверждена.
    case unverified
    /// Стенд аудита обрезки текста (`TruncationProbeView`) вместо оболочки.
    case truncationProbe

    static var current: UITestScenario? {
        argument("-uiTestScenario").flatMap(UITestScenario.init(rawValue:))
    }

    static func argument(_ name: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: name), index + 1 < arguments.count else { return nil }
        return arguments[index + 1]
    }

    var role: String {
        switch self {
        case .coordinator: return "coordinator"
        case .superAdmin: return "super_admin"
        case .nutritionist: return "nutritionist"
        default: return "client"
        }
    }

    /// Каталог запуска: свой на каждый запуск или общий `-uiTestStore`.
    static func storeDirectory() -> URL {
        guard let name = argument("-uiTestStore"), !name.isEmpty, name.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" }) else {
            return FileManager.default.temporaryDirectory.appendingPathComponent("uitest-\(UUID().uuidString)")
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("uitest-\(name)")
        if ProcessInfo.processInfo.arguments.contains("-uiTestResetStore") {
            try? FileManager.default.removeItem(at: directory)
        }
        return directory
    }

    @MainActor
    func makeModel(environment: AppEnvironment) -> AppModel {
        let directory = Self.storeDirectory()
        let secure = InMemorySecureStore()
        if self != .signedOut {
            let user = SessionUser(id: 7, email: "anna@example.com", name: "Анна", role: role,
                                   emailVerified: self != .unverified, onboardingCompleted: self != .newClient)
            let session = NativeSession(accessToken: "access", refreshToken: "refresh", user: user)
            if let data = try? JSONEncoder().encode(session) {
                try? secure.write(data, for: "session")
            }
        }
        let providers = Self.argument("-uiTestProviders")?.split(separator: ",").map(String.init) ?? ["yandex", "vk"]
        let permission: NotificationPermission
        switch Self.argument("-uiTestPushPermission") {
        case "denied": permission = .denied
        case "notDetermined": permission = .notDetermined
        default: permission = .authorized
        }
        // Своё хранилище настроек на запуск: «Оформление» одного теста не
        // переходит в другой.
        let preferences = UserDefaults(suiteName: "uitest-\(UUID().uuidString)") ?? .standard
        let model = AppModel(environment: environment, transport: ScenarioTransport(scenario: self, providers: providers),
                             secure: secure, installMarker: MarkedInstall(), directory: directory, deviceName: "UI test",
                             // Системный запрос Здоровья в UI-тесте не показывается:
                             // подделка считает запросы, «Профиль» показывает счёт.
                             healthStore: InMemoryHealthStore(),
                             // Токен APNs симулятор не получает: выход проверяет отписку по нему.
                             pushTokens: InMemoryDeviceTokenStore(Self.argument("-uiTestPushToken")),
                             permissions: FixedNotificationPermission(permission), preferences: preferences)
        // «Почта не подтверждена» — сразу после регистрации: код только что ушёл.
        if self == .unverified {
            VerificationSendClock(defaults: preferences).markSent()
        }
        // Письмо со ссылкой уже запрашивали на этом телефоне — «Получить новую»
        // на «Ссылка устарела» отправит новое туда же.
        if let email = Self.argument("-uiTestMagicLinkEmail"),
           let data = try? JSONEncoder().encode(MagicLinkRequests.Last(email: email, consents: nil)) {
            preferences.set(data, forKey: MagicLinkRequests.key)
        }
        if ProcessInfo.processInfo.arguments.contains("-uiTestPendingConsents") {
            model.signInStep = .pending(PendingSignIn(step: .needsConsents, pendingToken: "pending", provider: "yandex", email: nil))
        }
        if Self.argument("-uiTestPushResponse") == "workout" {
            // «Выполнено» в пуше задачи-тренировки: системный пуш тест не пришлёт.
            Task { @MainActor in
                await model.start()
                await model.handlePush(.openWorkoutSheet(taskID: "t1"))
            }
        }
        // Снимок для App Store (`UITestScenario+Screenshots.swift`).
        if let shot = StoreShot.current {
            Task { @MainActor in await shot.open(model) }
        }
        if let raw = Self.argument("-uiTestOpenURL"), let url = URL(string: raw) {
            Task { @MainActor in
                await model.start()
                await model.open(url)
            }
        }
        return model
    }
}

private struct MarkedInstall: InstallMarker {
    func isMarked() -> Bool { true }
    func mark() {}
}

/// Заготовленные ответы сервера для сценария. Помнит изменения: стакан
/// воды, отметку задачи-тренировки.
final class ScenarioTransport: HTTPTransport, @unchecked Sendable {
    let scenario: UITestScenario
    let providers: [String]
    private let lock = NSLock()
    private var glasses = 5
    private var taskDone = false
    private var workout: (kind: String, minutes: Int)?
    /// Дневник сценария: записи по датам.
    var entries: [String: [[String: Any]]] = [:]
    var seeded: Set<String> = []
    var favorites: Set<String> = ["p1"]
    var planEaten = false
    var planRecipe = "r1"
    var planLocked = false
    var nextEntry = 100
    let foodOffline = ProcessInfo.processInfo.arguments.contains("-uiTestFoodOffline")
    /// Переписка, уведомления и настройки сценария (`UITestScenario+Client.swift`).
    var chatMessages: [[String: Any]] = []
    var readNotifications: Set<String> = []
    var exportRequested = false
    var deletionCodeSent = false
    /// Вход «deleting@…»: удаление запрошено, пока его не отменили.
    var deletionScheduledFor: String?
    /// Клиенты, переписки, заявки и обращения куратора (`UITestScenario+Curator.swift`).
    var curator = CuratorScenarioState()

    init(scenario: UITestScenario, providers: [String]) {
        self.scenario = scenario
        self.providers = providers
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let path = request.url?.path ?? ""
        if scenario == .offlineClient && path != "/api/v1/config" {
            throw URLError(.notConnectedToInternet)
        }
        if ProcessInfo.processInfo.arguments.contains("-uiTestOffline") {
            throw URLError(.notConnectedToInternet)
        }
        let body = request.httpBody.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        let method = request.httpMethod ?? "GET"
        if foodOffline && method != "GET" && path.hasPrefix("/api/v1/food-tracker/") {
            throw URLError(.notConnectedToInternet)
        }
        if path.hasSuffix("/food-entry"), ProcessInfo.processInfo.arguments.contains("-uiTestFoodEntryOffline") {
            throw URLError(.notConnectedToInternet)
        }
        if path == "/api/v1/auth/native/apple/nonce", ProcessInfo.processInfo.arguments.contains("-uiTestAppleNonceOffline") {
            throw URLError(.notConnectedToInternet)
        }
        if path == "/api/v1/auth/native/logout" || path.hasPrefix("/api/v1/notifications/devices/") {
            let token = (body["device_token"] as? String).map { " device_token=\($0)" } ?? ""
            let line = "\(method) \(path)\(token)"
            Task { @MainActor in UITestCounters.shared.signOutRequests.append(line) }
        }
        let query = Dictionary((URLComponents(url: request.url ?? URL(fileURLWithPath: "/"), resolvingAgainstBaseURL: false)?
            .queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first })
        let (status, text) = lock.withLock {
            storeShotResponse(method, path) ?? curatorResponse(method, path, body, query) ?? foodResponse(method, path, body, query)
                ?? menuResponse(method, path, body)
                ?? clientResponse(method, path, body, query) ?? respond(method, path, body)
        }
        let response = HTTPURLResponse(url: request.url ?? URL(fileURLWithPath: "/"), statusCode: status,
                                       httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])
        guard let response else { throw URLError(.badServerResponse) }
        return (Data(text.utf8), response)
    }

    static func ok(_ data: String) -> (Int, String) { (200, #"{"status":"success","data":\#(data)}"#) }
    static func error(_ status: Int, _ code: String) -> (Int, String) {
        (status, #"{"status":"error","code":"\#(code)","message":"текст сервера"}"#)
    }

    private func respond(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String) {
        if let auth = authResponse(method, path, body) { return auth }
        if let dashboard = dashboardResponse(method, path, body) { return dashboard }
        switch path {
        case "/api/v1/config":
            let minimum = scenario == .update ? "9.0.0" : "1.0.0"
            return (200, #"{"features":{},"ios":{"min_supported_version":"\#(minimum)"},"support_url":"mailto:support@burcev.team","#
                + #""legal":{"terms_url":"https://new.burcev.team/legal/terms","privacy_url":"https://new.burcev.team/legal/privacy"}}"#)
        case "/api/v1/auth/me":
            return Self.ok(#"{"user":{"id":7,"email":"anna@example.com","role":"\#(scenario.role)"}}"#)
        case "/api/v1/users/profile":
            let onboarded = scenario == .newClient ? "false" : "true"
            return Self.ok(#"{"profile":{"id":7,"email":"anna@example.com","name":"Дарья","role":"\#(scenario.role)","#
                           + #""onboarding_completed":\#(onboarded),"settings":{"language":"ru","units":"metric","#
                           + #""timezone":"Europe/Moscow"}}}"#)
        case "/api/v1/users/settings":
            return Self.ok(#"{"settings":{"apple_health_enabled":true}}"#)
        case "/api/v1/users/onboarding/complete":
            return Self.ok(#"{"message":"Онбординг завершён"}"#)
        case "/api/v1/health/import":
            return Self.ok(#"{"accepted":0,"rejected":[]}"#)
        case "/api/v1/notifications/unread-counts":
            return Self.ok(#"{"main":2,"content":1}"#)
        case "/api/v1/auth/ws-ticket":
            return Self.error(503, "feature_unavailable")
        default:
            return Self.error(404, "not_found")
        }
    }

    private func authResponse(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String)? {
        let user = #"{"id":7,"email":"anna@example.com","role":"client","email_verified":true,"onboarding_completed":true}"#
        switch path {
        case "/api/v1/auth/providers":
            return Self.ok(#"{"providers":[\#(providers.map { "\"\($0)\"" }.joined(separator: ","))]}"#)
        case "/api/v1/auth/native/logout":
            return (204, "")
        case "/api/v1/auth/native/apple/nonce":
            // Nonce выдаёт сервер (apple-sign-in); лист Apple открывается после него.
            return Self.ok(#"{"nonce":"uitest-apple-nonce","expires_in":600}"#)
        case "/api/v1/auth/native/login":
            // «deleting@…» — аккаунт, ждущий удаления: вход успешен, сессия выдана.
            let deleting = (body["email"] as? String)?.hasPrefix("deleting") == true
            deletionScheduledFor = deleting ? "2026-10-31T10:00:00Z" : nil
            let deletion = deleting
                ? #","pending_deletion":{"requested_at":"2026-10-01T10:00:00Z","scheduled_for":"2026-10-31T10:00:00Z"}"#
                : ""
            return Self.ok(#"{"access_token":"a2","refresh_token":"r2","expires_in":900,"user":\#(user)\#(deletion)}"#)
        case "/api/v1/users/me/deletion" where method == "DELETE":
            deletionScheduledFor = nil
            return Self.ok(#"{"cancelled":true}"#)
        case "/api/v1/auth/native/magic-link/consume":
            return Self.error(400, "token_invalid")
        case "/api/v1/auth/native/magic-link/request":
            return Self.ok("null")
        case "/api/v1/auth/native/consents":
            return Self.ok(#"{"status":"registered","access_token":"a3","refresh_token":"r3","user":\#(user),"created":true}"#)
        case "/api/v1/auth/verify-email":
            return body["code"] as? String == "482913" ? Self.ok("null") : Self.error(400, "validation")
        case "/api/v1/auth/resend-verification", "/api/v1/auth/reset-password":
            return Self.ok("null")
        default:
            return nil
        }
    }

    /// День как на макете Today.png: 549 из 2 472, вода 5 из 8, задача-тренировка.
    private func dashboardResponse(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String)? {
        switch path {
        case let daily where daily.hasPrefix("/api/v1/dashboard/daily/"):
            let date = String(daily.suffix(10))
            let workoutJSON = workout.map {
                #","workout_types":["\#($0.kind)"],"workout_duration":\#($0.minutes),"workout_source":"manual""#
            } ?? #","workout_source":null"#
            return Self.ok(#"{"id":"d","user_id":7,"date":"\#(date)T00:00:00Z","calories":549,"protein":76,"fat":49,"carbs":18,"#
                           + #""weight":78.4,"steps":6412,"workout_completed":\#(workout != nil),"steps_source":"healthkit","#
                           + #""weight_source":"healthkit"\#(workoutJSON)}"#)
        case "/api/v1/dashboard/daily":
            return Self.ok(#"{"id":"d","date":"2026-01-01","calories":0,"steps":0,"workout_completed":false}"#)
        case "/api/v1/dashboard/week":
            return Self.ok(#"{"metrics":[],"count":0}"#)
        case "/api/v1/dashboard/weekly-plan":
            return Self.ok(#"{"plan":null}"#)
        case "/api/v1/nutrition-calc/targets":
            if scenario == .newClient {
                return Self.ok(#"{"targets":null,"message":"нет данных","missing":{"profile":true,"weight":true}}"#)
            }
            return Self.ok(#"{"id":1,"date":"2026-01-01","calories":2472,"protein":125,"fat":80,"carbs":230,"workout_bonus":0}"#)
        case "/api/v1/food-tracker/water":
            if method == "POST" { glasses += (body["glasses"] as? Int) ?? 1 }
            return Self.ok(#"{"glasses":\#(glasses),"goal":8,"glass_size":250,"enabled":true}"#)
        case "/api/v1/dashboard/tasks":
            let status = taskDone ? "completed" : "active"
            return Self.ok(#"{"tasks":[{"id":"t1","title":"Силовая тренировка","type":"workout","due_date":"2099-12-31T00:00:00Z","#
                           + #""status":"\#(status)","recurrence":"once"}],"count":1,"week":0}"#)
        case "/api/v1/dashboard/tasks/t1/complete":
            taskDone = true
            if let kind = body["workout_type"] as? String, let minutes = body["workout_duration"] as? Int {
                workout = (kind, minutes)
            }
            return Self.ok(#"{"task":{"id":"t1","title":"Силовая тренировка","type":"workout","due_date":"2099-12-31","#
                           + #""status":"completed","recurrence":"once"},"metric_synced":true}"#)
        case "/api/v1/dashboard/onboarding":
            return Self.ok(#"{"active":false,"steps":[],"curator":{"conversation_id":"c1","name":"Анна","unread_count":2,"#
                           + #""last_message":{"text":"Белок держите отлично, добавьте овощей к ужину","#
                           + #""created_at":"2026-01-01T10:00:00Z","from_curator":true}},"#
                           + #""curator_access":{"allowed":true,"expired":false}}"#)
        case "/api/v1/dashboard/progress":
            return Self.ok(#"{"weight_trend":[],"nutrition_adherence":71,"target_weight":null}"#)
        case "/api/v1/nutrition-calc/history":
            return Self.ok(#"{"days":[]}"#)
        default:
            return nil
        }
    }
}
// MARK: Дневник, запись еды и «Меню» сценария

extension ScenarioTransport {
    /// Сегодня по Москве — пояс профиля сценария.
    static var today: String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func json(_ value: Any) -> String {
        (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])).flatMap { String(data: $0, encoding: .utf8) }
            ?? "null"
    }

    /// Запись дневника: `slot` — приём, время и день.
    static func entry(_ id: String, _ name: String, portion: (unit: String, amount: Double), nutrition: [Double],
                      slot: (meal: String, time: String, date: String)) -> [String: Any] {
        ["id": id, "foodId": "f-\(id)", "foodName": name, "mealType": slot.meal, "portionType": portion.unit,
         "portionAmount": portion.amount,
         "nutrition": ["calories": nutrition[0], "protein": nutrition[1], "fat": nutrition[2], "carbs": nutrition[3]],
         "time": slot.time, "date": slot.date]
    }

    /// День как на макете Diary.png: завтрак и обед, ужин пуст.
    func seed(_ date: String) {
        guard !seeded.contains(date) else { return }
        seeded.insert(date)
        guard date == Self.today else { return }
        entries[date] = [
            Self.entry("e1", "Овсянка на молоке", portion: ("grams", 250), nutrition: [280, 25, 40, 14],
                       slot: ("breakfast", "08:10", date)),
            Self.entry("e2", "Кофе с молоком", portion: ("milliliters", 200), nutrition: [40, 5, 4, 4],
                       slot: ("breakfast", "08:12", date)),
            Self.entry("e3", "Куриная грудка запечённая", portion: ("grams", 150), nutrition: [229, 46, 5, 0],
                       slot: ("lunch", "13:20", date)),
        ] + Self.storeShotEntries(date)
    }

    static let buckwheat = #"{"id":"p1","name":"Гречка отварная","servingSize":100,"servingUnit":"g","#
        + #""nutritionPer100":{"calories":110,"protein":4,"fat":1,"carbs":21},"source":"database"}"#
    static let yogurt = #"{"id":"y1","name":"Йогурт греческий 2%","brand":"Теос","servingSize":140,"servingUnit":"g","#
        + #""nutritionPer100":{"calories":66,"protein":7,"fat":2,"carbs":4},"source":"openfoodfacts","barcode":"4607012345678"}"#

    func foodResponse(_ method: String, _ path: String, _ body: [String: Any], _ query: [String: String]) -> (Int, String)? {
        switch (method, path) {
        case ("GET", "/api/v1/food-tracker/entries"):
            let date = query["date"] ?? Self.today
            seed(date)
            let list = entries[date] ?? []
            let grouped = Dictionary(grouping: list) { $0["mealType"] as? String ?? "snack" }
            let byMeal = ["breakfast", "lunch", "dinner", "snack"].reduce(into: [String: Any]()) { $0[$1] = grouped[$1] ?? [] }
            return Self.ok(Self.json(["entries": byMeal]))
        case ("POST", "/api/v1/food-tracker/entries"):
            let date = body["date"] as? String ?? Self.today
            seed(date)
            nextEntry += 1
            let entry = Self.entry("e\(nextEntry)", body["foodName"] as? String ?? "Продукт",
                                   portion: (body["portionType"] as? String ?? "grams", body["portionAmount"] as? Double ?? 100),
                                   nutrition: [body["calories"] as? Double ?? 0, body["protein"] as? Double ?? 0,
                                               body["fat"] as? Double ?? 0, body["carbs"] as? Double ?? 0],
                                   slot: (body["mealType"] as? String ?? "snack", body["time"] as? String ?? "12:00", date))
            entries[date, default: []].append(entry)
            return (201, #"{"status":"success","data":\#(Self.json(entry))}"#)
        case let ("PUT", path) where path.hasPrefix("/api/v1/food-tracker/entries/"):
            return Self.ok(#"{"success":true}"#)
        case let ("DELETE", path) where path.hasPrefix("/api/v1/food-tracker/entries/"):
            let id = String(path.dropFirst("/api/v1/food-tracker/entries/".count))
            for date in entries.keys { entries[date]?.removeAll { $0["id"] as? String == id } }
            return Self.ok(#"{"success":true,"message":"Запись успешно удалена"}"#)
        case ("GET", "/api/v1/food-tracker/search"):
            return Self.ok(#"{"items":[\#(Self.buckwheat)],"total":1}"#)
        case ("GET", "/api/v1/food-tracker/recent"):
            return Self.ok(#"{"foods":[\#(Self.buckwheat)]}"#)
        case ("GET", "/api/v1/food-tracker/favorites"):
            return Self.ok(favorites.contains("p1") ? #"{"foods":[\#(Self.buckwheat)]}"# : #"{"foods":[]}"#)
        case let (verb, path) where path.hasPrefix("/api/v1/food-tracker/favorites/"):
            if verb == "POST" { favorites.insert("p1") } else { favorites.remove("p1") }
            return Self.ok(#"{"success":true}"#)
        case let ("GET", path) where path.hasPrefix("/api/v1/food-tracker/barcode/"):
            return path.hasSuffix("4607012345678")
                ? Self.ok(#"{"found":true,"cached":false,"food":\#(Self.yogurt)}"#)
                : Self.ok(#"{"found":false,"cached":false,"message":"Продукт не найден. Попробуйте ввести вручную."}"#)
        case ("POST", "/api/v1/food-tracker/recognize"):
            return Self.ok(#"{"foods":[{"name":"Курица с рисом","confidence":0.4,"estimated_weight":360,"#
                           + #""nutrition":{"calories":140,"protein":18,"fat":2,"carbs":14}}],"composition":["#
                           + #"{"name":"Куриная грудка запечённая","confidence":0.95,"estimated_weight":150,"#
                           + #""nutrition":{"calories":152.7,"protein":30.7,"fat":3.3,"carbs":0}},"#
                           + #"{"name":"Рис басмати","confidence":0.92,"estimated_weight":180,"#
                           + #""nutrition":{"calories":127,"protein":2.7,"fat":0.3,"carbs":28}},"#
                           + #"{"name":"Соус, похож на сливочный","confidence":0.4,"estimated_weight":30,"#
                           + #""nutrition":{"calories":300,"protein":2,"fat":30,"carbs":5}}],"#
                           + #""success":true,"remaining_recognitions":2}"#)
        case ("POST", "/api/v1/food-tracker/user-foods"), ("POST", "/api/v1/food-tracker/user-foods/clone"):
            let name = body["name"] as? String ?? "Овсянка на молоке"
            return (201, #"{"status":"success","data":{"id":"u1","user_id":7,"name":"\#(name)","calories_per_100":112,"#
                    + #""protein_per_100":4,"fat_per_100":4,"carbs_per_100":15}}"#)
        case ("GET", "/api/v1/food-tracker/recommendations"):
            return Self.ok(#"{"daily":{"vitamins":[\#(Self.vitaminD)]},"weekly":[],"custom":[]}"#)
        case let ("GET", path) where path.hasPrefix("/api/v1/food-tracker/recommendations/"):
            return Self.ok(Self.vitaminD)
        default:
            return nil
        }
    }

    static let vitaminD = #"{"id":"d1","name":"Витамин D","category":"vitamins","unit":"mcg","is_weekly":false,"#
        + #""description":"Жирорастворимый витамин, который кожа вырабатывает на солнце.","#
        + #""benefits":"Помогает усваивать кальций, поддерживает кости, мышцы и иммунитет.","#
        + #""effects":"Слабость, боли в мышцах, ломкость костей, частые простуды.","#
        + #""daily_target":15,"norm_source":"МР 2.3.1.0253-21","norm_needs_profile":false,"current_intake":4.2,"#
        + #""percentage":28,"intake_counted_entries":3,"intake_total_entries":5,"is_tracked":true,"sources":[]}"#

    func plan(_ date: String) -> String {
        let name = planRecipe == "r2" ? "Омлет" : "Сырники"
        return #"{"date":"\#(date)","meal_types":["breakfast","lunch"],"target":{"kcal":2472,"protein":125,"fat":80,"carbs":230},"#
            + #""target_changed":false,"items":[{"meal_type":"breakfast","recipe_id":"\#(planRecipe)","recipe_version_id":"v","#
            + #""name":"\#(name)","photo_url":null,"grams":180,"portion_grams":180,"nutrition":{"kcal":420,"protein":30,"#
            + #""fat":15,"carbs":40},"percent_of_target":{"kcal":17,"protein":24,"fat":19,"carbs":17},"locked":\#(planLocked),"#
            + #""manual_grams":false,"unavailable":false,"eaten":\#(planEaten),"eaten_grams":null,"food_entry_id":null}],"#
            + #""empty":[{"meal_type":"lunch","reason":"no_recipes"}],"totals":{"kcal":420,"protein":30,"fat":15,"carbs":40},"#
            + #""percent_of_target":{"kcal":17,"protein":24,"fat":19,"carbs":17},"remaining":{"kcal":2052,"protein":95,"#
            + #""fat":65,"carbs":190},"calorie_split":{"protein":29,"fat":32,"carbs":38},"deviations":[]}"#
    }

    func menuResponse(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String)? {
        guard path.hasPrefix("/api/v1/meal-plans/") || path.hasPrefix("/api/v1/recipes") || path == "/api/v1/shopping-list"
            || path == "/api/v1/meal-plan-settings" else { return nil }
        let parts = path.split(separator: "/").map(String.init)
        switch (method, path) {
        case let ("GET", path) where path.hasSuffix("/alternatives"):
            return Self.ok(#"{"items":[{"recipe_id":"r2","name":"Омлет","photo_url":null,"grams":200,"#
                           + #""nutrition":{"kcal":320,"protein":24,"fat":20,"carbs":5},"day_totals":{"kcal":320}}]}"#)
        case let ("POST", path) where path.hasSuffix("/eat"):
            let date = parts[3]
            seed(date)
            planEaten = true
            nextEntry += 1
            let name = planRecipe == "r2" ? "Омлет" : "Сырники"
            entries[date, default: []].append(Self.entry("e\(nextEntry)", name, portion: ("grams", body["grams"] as? Double ?? 180),
                                                         nutrition: [420, 30, 15, 40],
                                                         slot: ("breakfast", body["time"] as? String ?? "12:00", date)))
            return (201, #"{"status":"success","data":{"entry_id":"e\#(nextEntry)","plan":\#(plan(date))}}"#)
        case let ("PUT", path) where path.contains("/items/"):
            if let recipe = body["recipe_id"] as? String { planRecipe = recipe }
            if let locked = body["locked"] as? Bool { planLocked = locked }
            return Self.ok(plan(parts[3]))
        case let (_, path) where path.hasPrefix("/api/v1/meal-plans/"):
            return Self.ok(plan(parts[3]))
        case ("GET", "/api/v1/recipes"):
            return Self.ok(#"{"items":[{"id":"r1","name":"Сырники","cook_minutes":25,"meal_types":["breakfast"],"#
                           + #""portion_grams":180,"per_portion":{"kcal":420,"protein":30,"fat":15,"carbs":40}}],"#
                           + #""total":1,"limit":20,"offset":0}"#)
        case let ("GET", path) where path.hasPrefix("/api/v1/recipes/"):
            return Self.ok(#"{"id":"v","recipe_id":"r1","name":"Сырники","description":"Нежные, из творога 5%.","#
                           + #""cook_minutes":25,"portion_grams":180,"per_portion":{"kcal":420,"protein":30,"fat":15,"carbs":40},"#
                           + #""ingredients":[{"position":1,"food_name":"Творог 5%","grams":400,"to_taste":false},"#
                           + #"{"position":2,"food_name":"Соль","to_taste":true}],"#
                           + #""steps":[{"position":1,"text":"Смешайте творог с яйцом и мукой."}]}"#)
        case let (_, path) where path.hasSuffix("/reject"):
            return (204, "")
        case ("GET", "/api/v1/shopping-list"):
            return Self.ok(#"{"from":"2026-10-17","to":"2026-10-19","has_plans":true,"departments":[{"name":"Молочное","#
                           + #""items":[{"food_id":"t1","name":"Творог 5%","grams":400,"pieces":null,"piece_grams":null,"#
                           + #""quantity_text":"400 г"}]}],"at_home":["Соль"]}"#)
        case (_, "/api/v1/meal-plan-settings"):
            return Self.ok(#"{"meal_types":["breakfast","lunch","dinner"]}"#)
        default:
            return nil
        }
    }
}
#endif
