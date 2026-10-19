import Foundation

/// Собственные события продукта — в тот же `POST /api/v1/public/analytics/events`,
/// что у сайта. Сторонних SDK аналитики, рекламы и атрибуции в приложении нет,
/// запроса App Tracking Transparency тоже (`ios-platform-compliance`).
public actor AnalyticsClient {
    public static let path = "/api/v1/public/analytics/events"

    public struct Event: Encodable, Sendable, Equatable {
        public let name: String
        public let occurredAt: Date
        public let properties: [String: String]

        public init(name: String, occurredAt: Date = Date(), properties: [String: String] = [:]) {
            self.name = name
            self.occurredAt = occurredAt
            self.properties = properties
        }

        enum CodingKeys: String, CodingKey {
            case name
            case occurredAt = "occurred_at"
            case properties
        }
    }

    private struct Batch: Encodable {
        let visitorID: String
        let platform: String
        let appVersion: String
        let events: [Event]

        enum CodingKeys: String, CodingKey {
            case visitorID = "visitor_id"
            case platform
            case appVersion = "app_version"
            case events
        }
    }

    private let api: APIClient
    private let visitorID: String
    private let appVersion: String

    /// `visitorID` — UUID установки, без связи с рекламными идентификаторами.
    public init(api: APIClient, visitorID: String, appVersion: String) {
        self.api = api
        self.visitorID = visitorID
        self.appVersion = appVersion
    }

    /// Связывает установку с аккаунтом после входа (`POST /analytics/identify`,
    /// как у сайта): события до входа и после — одного человека.
    public func identify() async {
        guard let endpoint = try? Endpoint.post("/api/v1/analytics/identify", body: ["visitor_id": visitorID]) else { return }
        _ = try? await api.sendRaw(endpoint)
    }

    /// Отправляет события; сбой аналитики не мешает работе приложения.
    public func send(_ events: [Event]) async {
        guard !events.isEmpty else { return }
        let encoder = JSONEncoder.api
        encoder.dateEncodingStrategy = .iso8601
        guard let body = try? encoder.encode(Batch(visitorID: visitorID, platform: "ios", appVersion: appVersion, events: events)) else {
            return
        }
        _ = try? await api.sendRaw(Endpoint(method: .post, path: Self.path, body: body, requiresAuth: false))
    }
}

/// События приложения — только объявленные в словаре сервера
/// (`apps/api/internal/modules/analytics/dictionary.go`) и не серверные: имя
/// или свойство вне словаря сервер отбрасывает. Сверяет `AnalyticsTests`.
public enum ProductEvent {
    /// Письмо со ссылкой на вход запрошено. Без свойств.
    public static let magicLinkRequested = "magic_link_requested"
    /// Запись в дневник; свойство `meal_type`.
    public static let foodEntryCreated = "food_entry_created"
    /// Открыт раздел «Меню». Без свойств.
    public static let menuOpened = "menu_opened"
    /// «Подогнать оставшиеся порции». Без свойств.
    public static let planRefit = "plan_refit"
    /// «Пересобрать». Без свойств.
    public static let planRegenerated = "plan_regenerated"

    /// Имя и свойства каждого события приложения.
    public static let declared: [String: Set<String>] = [
        magicLinkRequested: [], foodEntryCreated: ["meal_type"], menuOpened: [], planRefit: [], planRegenerated: [],
    ]
}

/// Идентификатор посетителя — случайный UUID установки в настройках
/// приложения, без связи с рекламными идентификаторами устройства.
public enum AnalyticsVisitor {
    static let key = "analytics_visitor_id"

    public static func id(in defaults: UserDefaults) -> String {
        if let existing = defaults.string(forKey: key), UUID(uuidString: existing) != nil { return existing }
        let fresh = UUID().uuidString.lowercased()
        defaults.set(fresh, forKey: key)
        return fresh
    }
}
