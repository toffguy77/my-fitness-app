import API
import Foundation
import Navigation
import Outbox
import Session

/// Категории пушей сервера (`ios-push-notifications`) и их действия.
public enum PushCategory: String, CaseIterable, Sendable {
    /// Сообщение куратора: «Ответить» полем ввода.
    case chatMessage = "CHAT_MESSAGE"
    /// Задача: «Выполнено» в фоне и «Открыть».
    case task = "TASK"
    /// Задача-тренировка: «Выполнено» открывает лист вида и длительности.
    case taskWorkout = "TASK_WORKOUT"
    /// Обращение передано куратору (куратору; у клиента не приходит).
    case supportEscalated = "SUPPORT_ESCALATED"
}

/// Идентификаторы действий уведомлений.
public enum PushAction {
    public static let complete = "TASK_COMPLETE"
    public static let open = "TASK_OPEN"
    public static let reply = "CHAT_REPLY"
    /// `UNNotificationDefaultActionIdentifier` — нажатие на само уведомление.
    public static let tap = "com.apple.UNNotificationDefaultActionIdentifier"
    /// `UNNotificationDismissActionIdentifier`.
    public static let dismiss = "com.apple.UNNotificationDismissActionIdentifier"
}

/// Нагрузка пуша: `aps.category`, `aps.badge`, `target`, `notification_id`.
public struct PushPayload: Equatable, Sendable {
    public var category: PushCategory?
    public var target: PushTarget
    public var notificationID: String?
    public var badge: Int?
    /// Фоновый пуш без текста — только новый счётчик на значке.
    public var isSilent: Bool

    public init(category: PushCategory? = nil, target: PushTarget = PushTarget(kind: "notifications"), notificationID: String? = nil,
                badge: Int? = nil, isSilent: Bool = false) {
        self.category = category
        self.target = target
        self.notificationID = notificationID
        self.badge = badge
        self.isSilent = isSilent
    }

    public init(userInfo: [AnyHashable: Any]) {
        let aps = userInfo["aps"] as? [String: Any] ?? [:]
        category = (aps["category"] as? String).flatMap(PushCategory.init(rawValue:))
        badge = aps["badge"] as? Int
        isSilent = (aps["content-available"] as? Int) == 1 && aps["alert"] == nil
        notificationID = userInfo["notification_id"] as? String
        if let raw = userInfo["target"], JSONSerialization.isValidJSONObject(raw),
           let data = try? JSONSerialization.data(withJSONObject: raw),
           let decoded = try? JSONDecoder().decode(PushTarget.self, from: data) {
            target = decoded
        } else {
            target = PushTarget(kind: "notifications")
        }
    }
}

/// Что сделать в ответ на действие человека с пушем.
public enum PushResponse: Equatable, Sendable {
    /// Открыть приложение на экране.
    case open(ScreenLink)
    /// «Выполнено» — в фоне, через очередь, приложение не открывается.
    case completeTask(id: String)
    /// «Выполнено» у тренировки — приложение на листе вида и длительности.
    case openWorkoutSheet(taskID: String)
    /// Ответ куратору из уведомления — через очередь.
    case reply(conversationID: String, text: String)
    case ignore
}

public enum PushRouting {
    /// Таблица действий (`ios-notifications-center`, «Действия в пуше задачи»).
    public static func decide(_ payload: PushPayload, action: String, text: String? = nil) -> PushResponse {
        let ids = payload.target.ids
        switch action {
        case PushAction.dismiss:
            return .ignore
        case PushAction.complete:
            guard let task = ids["task_id"] else { return .open(Router.link(for: payload.target)) }
            if payload.category == .taskWorkout || ids["task_type"] == "workout" {
                return .openWorkoutSheet(taskID: task)
            }
            return .completeTask(id: task)
        case PushAction.reply:
            let trimmed = (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard let conversation = ids["conversation_id"], !trimmed.isEmpty else { return .ignore }
            return .reply(conversationID: conversation, text: trimmed)
        default:
            return .open(Router.link(for: payload.target))
        }
    }
}

/// Действия пуша, которые выполняются без открытия приложения: в очередь
/// с `Idempotency-Key`, затем досылка. Без сети изменение ждёт следующей
/// досылки (передний план, фоновое обновление) с тем же ключом.
public struct PushActionPerformer: Sendable {
    private let outbox: Outbox
    private let userID: @Sendable () async -> Int64?
    private let today: @Sendable () -> String

    /// `today` — местная дата телефона `yyyy-MM-dd` в момент нажатия: без неё
    /// сервер отметил бы задачу днём своих часов, а очередь может дослать
    /// изменение уже после полуночи.
    public init(outbox: Outbox, userID: @escaping @Sendable () async -> Int64?,
                today: @escaping @Sendable () -> String = { DayCalendar().key(Date()) }) {
        self.outbox = outbox
        self.userID = userID
        self.today = today
    }

    struct MessageBody: Encodable, Sendable {
        let type: String
        let content: String
    }

    struct CompleteBody: Encodable, Sendable {
        let date: String
    }

    /// `true` — изменение поставлено в очередь.
    @discardableResult
    public func perform(_ response: PushResponse) async -> Bool {
        // Дата — в момент нажатия, до ожидания сессии и очереди.
        let date = today()
        guard let user = await userID() else { return false }
        let item: (kind: String, endpoint: Endpoint)?
        switch response {
        case let .completeTask(id):
            item = (try? Endpoint.post("/api/v1/dashboard/tasks/\(id)/complete", body: CompleteBody(date: date)))
                .map { ("push.task", $0) }
        case let .reply(conversation, text):
            item = (try? Endpoint.post("/api/v1/conversations/\(conversation)/messages", body: MessageBody(type: "text", content: text)))
                .map { ("chat.message", $0) }
        default:
            item = nil
        }
        guard let item, (try? await outbox.enqueue(kind: item.kind, endpoint: item.endpoint, userID: user)) != nil else {
            return false
        }
        await outbox.drain(userID: user)
        return true
    }
}

// MARK: Регистрация устройства

/// Окружение APNs по конфигурации сборки, а не по стенду: токен выдаёт
/// подпись. Отладочная сборка (подпись разработчика, `aps-environment` =
/// `development`) — песочница; выпускная (архив, TestFlight, App Store) —
/// боевой, и для Dev-стенда тоже. Значение — `APSEnvironment` из Info.plist,
/// тот же build setting, что и entitlement.
public enum PushEnvironment {
    public static let sandbox = "sandbox"
    public static let production = "production"

    /// `development` → `sandbox`; `production`, пусто или неизвестно → `production`:
    /// дистрибутивная подпись всегда даёт боевой токен.
    public static func forBuild(apsEnvironment: String?) -> String {
        apsEnvironment == "development" ? sandbox : production
    }
}

/// Где хранится последний токен APNs.
public protocol DeviceTokenStore: Sendable {
    func load() -> String?
    func save(_ token: String?)
}

public final class InMemoryDeviceTokenStore: DeviceTokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var token: String?

    public init(_ token: String? = nil) { self.token = token }

    public func load() -> String? { lock.withLock { token } }
    public func save(_ token: String?) { lock.withLock { self.token = token } }
}

/// Случайный идентификатор установки: в Keychain, переживает выход из
/// аккаунта — по нему сервер переносит токен к следующему вошедшему на этом
/// же телефоне и отказывает тому, кто знает только чужой токен.
public enum InstallationID {
    static let key = "installation_id"

    public static func value(in store: SecureStore) -> String {
        if let data = try? store.read(key), let existing = String(data: data, encoding: .utf8), !existing.isEmpty {
            return existing
        }
        let fresh = UUID().uuidString.lowercased()
        try? store.write(Data(fresh.utf8), for: key)
        return fresh
    }
}

/// Регистрация токена APNs (`push-devices`): `POST /notifications/devices`
/// при каждом запуске с сессией, `DELETE /notifications/devices/:token` при выходе.
public actor PushRegistrar {
    struct Body: Encodable, Sendable {
        let token: String
        let environment: String
        let appVersion: String
        let installationID: String

        enum CodingKeys: String, CodingKey {
            case token, environment
            case appVersion = "app_version"
            case installationID = "installation_id"
        }
    }

    private let api: APIClient
    private let tokens: DeviceTokenStore
    private let environment: String
    private let appVersion: String
    private let installationID: @Sendable () -> String

    public init(api: APIClient, tokens: DeviceTokenStore, environment: String, appVersion: String,
                installationID: @escaping @Sendable () -> String) {
        self.api = api
        self.tokens = tokens
        self.environment = environment
        self.appVersion = appVersion
        self.installationID = installationID
    }

    public nonisolated var token: String? { tokens.load() }

    public static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }

    /// Токен от системы: запомнить и отдать серверу.
    @discardableResult
    public func didReceive(token: Data) async -> Bool {
        let hex = Self.hex(token)
        tokens.save(hex)
        return await register()
    }

    /// Повторная регистрация того же токена обновляет `last_seen_at`.
    @discardableResult
    public func register() async -> Bool {
        guard let token = tokens.load(),
              let endpoint = try? Endpoint.post("/api/v1/notifications/devices",
                                                body: Body(token: token, environment: environment, appVersion: appVersion,
                                                           installationID: installationID())) else { return false }
        return (try? await api.sendRaw(endpoint))?.status == 204
    }

    /// Выход: устройство отписывается, пока сессия ещё действует. Без сети
    /// отписку досылает `native/logout` с `device_token`.
    public func unregister() async {
        guard let token = tokens.load() else { return }
        let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
        _ = try? await api.sendRaw(.delete("/api/v1/notifications/devices/\(encoded)"))
    }
}

/// Число на значке: важное непрочитанное — уведомления «Основные» и сообщения
/// чата; новые статьи значок не красят (`notification-targets`).
public enum Badge {
    public static func count(unread: UnreadCounts?, chatUnread: Int) -> Int {
        max(0, (unread?.main ?? 0) + chatUnread)
    }
}
