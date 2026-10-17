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
