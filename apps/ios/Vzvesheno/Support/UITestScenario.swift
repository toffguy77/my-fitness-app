#if DEBUG
import API
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
///   открыт экран согласий.
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

    @MainActor
    func makeModel(environment: AppEnvironment) -> AppModel {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("uitest-\(UUID().uuidString)")
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
        let model = AppModel(environment: environment, transport: ScenarioTransport(scenario: self, providers: providers),
                             secure: secure, installMarker: MarkedInstall(), directory: directory, deviceName: "UI test",
                             // Системный запрос Здоровья в UI-тесте не показывается:
                             // подделка считает запросы, «Профиль» показывает счёт.
                             healthStore: InMemoryHealthStore())
        if ProcessInfo.processInfo.arguments.contains("-uiTestPendingConsents") {
            model.signInStep = .pending(PendingSignIn(step: .needsConsents, pendingToken: "pending", provider: "yandex", email: nil))
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
private final class ScenarioTransport: HTTPTransport, @unchecked Sendable {
    let scenario: UITestScenario
    let providers: [String]
    private let lock = NSLock()
    private var glasses = 5
    private var taskDone = false
    private var workout: (kind: String, minutes: Int)?

    init(scenario: UITestScenario, providers: [String]) {
        self.scenario = scenario
        self.providers = providers
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let path = request.url?.path ?? ""
        if scenario == .offlineClient && path != "/api/v1/config" {
            throw URLError(.notConnectedToInternet)
        }
        let body = request.httpBody.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        let (status, text) = lock.withLock { respond(request.httpMethod ?? "GET", path, body) }
        let response = HTTPURLResponse(url: request.url ?? URL(fileURLWithPath: "/"), statusCode: status,
                                       httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])
        guard let response else { throw URLError(.badServerResponse) }
        return (Data(text.utf8), response)
    }

    private static func ok(_ data: String) -> (Int, String) { (200, #"{"status":"success","data":\#(data)}"#) }
    private static func error(_ status: Int, _ code: String) -> (Int, String) {
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
        case "/api/v1/auth/native/login":
            // «deleting@…» — аккаунт, ждущий удаления: вход успешен, сессия выдана.
            let deleting = (body["email"] as? String)?.hasPrefix("deleting") == true
            let deletion = deleting
                ? #","pending_deletion":{"requested_at":"2026-10-01T10:00:00Z","scheduled_for":"2026-10-31T10:00:00Z"}"#
                : ""
            return Self.ok(#"{"access_token":"a2","refresh_token":"r2","expires_in":900,"user":\#(user)\#(deletion)}"#)
        case "/api/v1/users/me/deletion" where method == "DELETE":
            return Self.ok(#"{"cancelled":true}"#)
        case "/api/v1/auth/native/magic-link/consume":
            return Self.error(400, "token_invalid")
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
#endif
