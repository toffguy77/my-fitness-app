import API
import Foundation
import Navigation
import Observation

/// Уведомление `GET /notifications` (поля в camelCase).
public struct AppNotification: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    public var category: String
    public var type: String
    public var title: String
    public var content: String
    public var createdAt: String
    public var readAt: String?
    /// Адрес экрана; у записей до `notification-targets` — `{kind: "notifications"}`.
    public var target: PushTarget

    public init(id: String, category: String = "main", type: String = "general", title: String, content: String = "",
                createdAt: String = "", readAt: String? = nil, target: PushTarget = PushTarget(kind: "notifications")) {
        self.id = id
        self.category = category
        self.type = type
        self.title = title
        self.content = content
        self.createdAt = createdAt
        self.readAt = readAt
        self.target = target
    }

    enum CodingKeys: String, CodingKey {
        case id, category, type, title, content, createdAt, readAt, target
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        category = try container.decodeIfPresent(String.self, forKey: .category) ?? "main"
        type = try container.decodeIfPresent(String.self, forKey: .type) ?? "general"
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        readAt = try container.decodeIfPresent(String.self, forKey: .readAt)
        target = (try? container.decodeIfPresent(PushTarget.self, forKey: .target)) ?? PushTarget(kind: "notifications")
    }

    public var isRead: Bool { readAt != nil }

    /// Нажатие ведёт на экран; `notifications` — остаться в списке.
    public var link: ScreenLink? {
        target.kind == "notifications" ? nil : Router.link(for: target)
    }
}

/// Экран уведомлений (`ios-notifications-center`): «Основные» и «Контент»,
/// по 20, прочтение после 2 с на экране, «Прочитать все» — только вкладка.
@MainActor
@Observable
public final class NotificationsModel {
    public enum Tab: String, CaseIterable, Sendable {
        case main, content

        public var title: String { self == .main ? "Основные" : "Контент" }
    }

    public static let pageSize = 20
    public static let readDelay: Duration = .seconds(2)

    public private(set) var tab: Tab = .main
    public private(set) var counts = UnreadCounts(main: 0, content: 0)
    public private(set) var items: [Tab: [AppNotification]] = [:]
    public private(set) var hasMore: [Tab: Bool] = [:]
    public private(set) var loaded: Set<Tab> = []
    public var error: String?
    private let api: APIClient
    private let sleeper: Sleeper
    @ObservationIgnored private var readDelays: [String: Task<Void, Never>] = [:]
    /// Счётчики изменились — колокольчик «Сегодня» и значок.
    @ObservationIgnored public var onCountsChanged: (@MainActor (UnreadCounts) -> Void)?

    public init(api: APIClient, sleeper: Sleeper = TaskSleeper()) {
        self.api = api
        self.sleeper = sleeper
    }

    public var visible: [AppNotification] { items[tab] ?? [] }

    public func count(_ tab: Tab) -> Int { tab == .main ? counts.main : counts.content }

    /// Открытие экрана: счётчики и первая страница открытой вкладки. Ничего
    /// не помечается прочитанным (веб помечал «Контент» при открытии).
    public func load() async {
        await refreshCounts()
        await fetch(tab, offset: 0)
    }

    public func select(_ tab: Tab) async {
        guard tab != self.tab else { return }
        cancelReadDelays()
        self.tab = tab
        if !loaded.contains(tab) { await fetch(tab, offset: 0) }
    }

    public func loadMore() async {
        guard hasMore[tab] == true else { return }
        await fetch(tab, offset: visible.count)
    }

    public func refreshCounts() async {
        if let fresh: UnreadCounts = try? await api.send(.get("/api/v1/notifications/unread-counts")) {
            counts = fresh
            onCountsChanged?(fresh)
        }
    }

    private func fetch(_ tab: Tab, offset: Int) async {
        struct Page: Decodable, Sendable {
            let notifications: [AppNotification]
            let hasMore: Bool?
        }
        do {
            let page: Page = try await api.send(.get("/api/v1/notifications", query: [
                URLQueryItem(name: "category", value: tab.rawValue),
                URLQueryItem(name: "limit", value: "\(Self.pageSize)"),
                URLQueryItem(name: "offset", value: "\(offset)"),
            ]))
            items[tab] = offset == 0 ? page.notifications : (items[tab] ?? []) + page.notifications
            hasMore[tab] = page.hasMore ?? (page.notifications.count == Self.pageSize)
            loaded.insert(tab)
            error = nil
        } catch {
            self.error = ErrorMessages().message(for: error)
        }
    }

    /// Уведомление появилось на экране: через 2 с — прочитано.
    public func appeared(_ notification: AppNotification) {
        guard !notification.isRead, readDelays[notification.id] == nil else { return }
        let id = notification.id
        readDelays[id] = Task { [sleeper] in
            do {
                try await sleeper.sleep(for: Self.readDelay)
            } catch {
                return
            }
            await self.markRead(id)
        }
    }

    /// Ушло с экрана раньше 2 с — не прочитано.
    public func disappeared(_ id: String) {
        readDelays.removeValue(forKey: id)?.cancel()
    }

    private func cancelReadDelays() {
        readDelays.values.forEach { $0.cancel() }
        readDelays = [:]
    }

    func markRead(_ id: String) async {
        readDelays[id] = nil
        guard (try? await api.sendRaw(Endpoint(method: .post, path: "/api/v1/notifications/\(id)/read")))?.status == 200 else {
            return
        }
        for tab in Tab.allCases {
            guard let index = items[tab]?.firstIndex(where: { $0.id == id }), items[tab]?[index].readAt == nil else { continue }
            items[tab]?[index].readAt = "now"
            if tab == .main { counts.main = max(0, counts.main - 1) } else { counts.content = max(0, counts.content - 1) }
        }
        onCountsChanged?(counts)
    }

    /// «Прочитать все» — только открытая вкладка.
    public func markAllRead() async {
        let tab = self.tab
        guard let endpoint = try? Endpoint.post("/api/v1/notifications/mark-all-read", body: ["category": tab.rawValue]),
              (try? await api.sendRaw(endpoint))?.status == 200 else { return }
        items[tab] = (items[tab] ?? []).map { item in
            var item = item
            if item.readAt == nil { item.readAt = "now" }
            return item
        }
        if tab == .main { counts.main = 0 } else { counts.content = 0 }
        onCountsChanged?(counts)
    }
}

// MARK: Отзыв на недельный отчёт

/// `GET /dashboard/weekly-reports/:reportId/feedback`.
public struct WeeklyFeedback: Decodable, Sendable, Equatable {
    public struct Rating: Decodable, Sendable, Equatable {
        public var rating: String
        public var comment: String?

        public init(rating: String, comment: String? = nil) {
            self.rating = rating
            self.comment = comment
        }

        /// «Отлично», «Хорошо», «Есть над чем поработать».
        public var title: String {
            switch rating {
            case "excellent": return "Отлично"
            case "good": return "Хорошо"
            case "needs_improvement": return "Есть над чем поработать"
            default: return rating
            }
        }
    }

    public var nutrition: Rating?
    public var activity: Rating?
    public var water: Rating?
    public var summary: String?
    public var recommendations: String?

    public init(nutrition: Rating? = nil, activity: Rating? = nil, water: Rating? = nil, summary: String? = nil,
                recommendations: String? = nil) {
        self.nutrition = nutrition
        self.activity = activity
        self.water = water
        self.summary = summary
        self.recommendations = recommendations
    }

    /// Оценки по порядку экрана: питание, активность, вода.
    public var ratings: [(title: String, rating: Rating)] {
        [("Питание", nutrition), ("Активность", activity), ("Вода", water)].compactMap { item in
            item.1.map { (item.0, $0) }
        }
    }

    public static func == (lhs: WeeklyFeedback, rhs: WeeklyFeedback) -> Bool {
        lhs.nutrition == rhs.nutrition && lhs.activity == rhs.activity && lhs.water == rhs.water && lhs.summary == rhs.summary
            && lhs.recommendations == rhs.recommendations
    }
}

@MainActor
@Observable
public final class WeeklyFeedbackModel {
    public private(set) var feedback: WeeklyFeedback?
    public private(set) var error: String?
    public let reportID: String
    private let api: APIClient

    public init(api: APIClient, reportID: String) {
        self.api = api
        self.reportID = reportID
    }

    public func load() async {
        do {
            feedback = try await api.send(.get("/api/v1/dashboard/weekly-reports/\(reportID)/feedback"))
            error = nil
        } catch APIError.server(404, _, _) {
            error = "Куратор ещё не оставил отзыв на этот отчёт."
        } catch {
            self.error = ErrorMessages().message(for: error)
        }
    }
}
