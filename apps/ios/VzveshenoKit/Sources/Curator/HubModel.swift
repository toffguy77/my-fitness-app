import API
import Client
import Foundation
import Navigation
import Observation
import Outbox

/// Тон бейджа причины.
public enum BadgeTone: Sendable, Equatable {
    case danger, warning, info, neutral
    /// Цвет действия: «Ожидает отзыв» ждёт куратора, а не тревожит.
    case accent
}

/// Бейдж причины «Требуют внимания»: «Алерт КБЖУ · 132%».
public struct AttentionBadge: Sendable, Equatable, Identifiable {
    public var id: String { reason }
    public var reason: String
    public var text: String
    public var tone: BadgeTone
    /// Полные `detail` причины — для VoiceOver.
    public var details: [String]

    public init(reason: String, text: String, tone: BadgeTone, details: [String]) {
        self.reason = reason
        self.text = text
        self.tone = tone
        self.details = details
    }
}

/// Строка «Требуют внимания»: один клиент, все его причины.
public struct AttentionGroup: Sendable, Equatable, Identifiable {
    public var clientID: Int64
    public var name: String
    /// Пункты по возрастанию приоритета (1 — самый срочный).
    public var items: [AttentionItem]
    public var badges: [AttentionBadge]

    public var id: Int64 { clientID }
    public var topPriority: Int { items.first?.priority ?? Int.max }
    /// Куда ведёт нажатие — адрес пункта с наивысшим приоритетом.
    public var actionURL: String { items.first?.actionURL ?? "/curator/clients/\(clientID)" }

    public init(clientID: Int64, name: String, items: [AttentionItem], badges: [AttentionBadge]) {
        self.clientID = clientID
        self.name = name
        self.items = items
        self.badges = badges
    }

    /// Экран, который открывает нажатие (через общий маршрутизатор).
    public var link: ScreenLink {
        guard let url = URL(string: "https://burcev.team" + actionURL), case let .screen(link)? = Router.parse(url),
              link != .unknown else {
            return .curatorClient(id: String(clientID), tab: nil)
        }
        return link
    }
}

public enum AttentionGrouping {
    /// Пункты сервера → строки по клиенту в порядке наивысшего приоритета
    /// группы (при равном — по порядку сервера, то есть по имени).
    public static func groups(_ items: [AttentionItem], clients: [CuratorClient] = [], today: String? = nil,
                              calendar: DayCalendar = DayCalendar()) -> [AttentionGroup] {
        var order: [Int64] = []
        var byClient: [Int64: [AttentionItem]] = [:]
        for item in items {
            if byClient[item.clientID] == nil { order.append(item.clientID) }
            byClient[item.clientID, default: []].append(item)
        }
        let groups = order.enumerated().map { index, id -> (Int, AttentionGroup) in
            let list = (byClient[id] ?? []).enumerated().sorted { ($0.element.priority, $0.offset) < ($1.element.priority, $1.offset) }
                .map(\.element)
            let client = clients.first { $0.id == id }
            let name = list.first?.clientName.isEmpty == false ? list[0].clientName : (client?.displayName ?? "Без имени")
            return (index, AttentionGroup(clientID: id, name: name, items: list,
                                          badges: badges(list, client: client, today: today, calendar: calendar)))
        }
        return groups.sorted { ($0.1.topPriority, $0.0) < ($1.1.topPriority, $1.0) }.map(\.1)
    }

    static func badges(_ items: [AttentionItem], client: CuratorClient?, today: String?, calendar: DayCalendar) -> [AttentionBadge] {
        var order: [String] = []
        var byReason: [String: [AttentionItem]] = [:]
        for item in items {
            if byReason[item.reasonCode] == nil { order.append(item.reasonCode) }
            byReason[item.reasonCode, default: []].append(item)
        }
        return order.map { code in
            let list = byReason[code] ?? []
            let reason = AttentionReason(rawValue: code)
            let title = reason?.title ?? (list.first?.detail ?? code)
            let short = shortDetail(reason, list, client: client, today: today, calendar: calendar)
            let text: String
            if let short {
                text = reason == .inactive ? "\(title) \(short)" : "\(title) · \(short)"
            } else {
                text = title
            }
            return AttentionBadge(reason: code, text: text, tone: tone(reason), details: list.map(\.detail))
        }
    }

    /// Короткая часть `detail` для бейджа: процент алерта, число сообщений,
    /// число просроченных задач, дни без записей.
    static func shortDetail(_ reason: AttentionReason?, _ items: [AttentionItem], client: CuratorClient?, today: String?,
                            calendar: DayCalendar) -> String? {
        switch reason {
        case .redAlert:
            guard let detail = items.first?.detail, let open = detail.lastIndex(of: "("), let close = detail.lastIndex(of: ")"),
                  open < close else { return nil }
            return String(detail[detail.index(after: open)..<close])
        case .unreadMessage:
            return items.first?.detail.split(separator: ":").last.map { $0.trimmingCharacters(in: .whitespaces) }
        case .overdueTask, .awaitingFeedback:
            return items.count > 1 ? String(items.count) : nil
        case .inactive:
            guard let last = client?.lastActivityDate, let today, let from = calendar.date(DayKey.of(last)),
                  let to = calendar.date(today) else { return nil }
            let days = calendar.calendar.dateComponents([.day], from: from, to: to).day ?? 0
            return days > 0 ? CuratorText.days(days) : nil
        case .incompleteProfile, .none:
            return nil
        }
    }

    static func tone(_ reason: AttentionReason?) -> BadgeTone {
        switch reason {
        case .redAlert: return .danger
        case .awaitingFeedback: return .accent
        case .overdueTask: return .warning
        case .unreadMessage: return .info
        case .inactive, .incompleteProfile, .none: return .neutral
        }
    }

    /// «Остальные»: клиенты, которых нет в «Требуют внимания», по имени.
    public static func others(_ clients: [CuratorClient], excluding groups: [AttentionGroup]) -> [CuratorClient] {
        let shown = Set(groups.map(\.clientID))
        return clients.filter { !shown.contains($0.id) }
            .sorted { $0.displayName.localizedCompare($1.displayName) == .orderedAscending }
    }

    /// Поиск по имени без сервера, без учёта регистра.
    public static func matches(_ name: String, query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || name.localizedCaseInsensitiveContains(trimmed)
    }
}

/// Экран «Клиенты» (`ios-curator-hub`).
@MainActor
@Observable
public final class HubModel {
    public enum Phase: Equatable, Sendable {
        case loading
        case loaded
        /// «Не удалось загрузить данные» с «Повторить».
        case failed
    }

    public private(set) var phase: Phase = .loading
    public private(set) var analytics: CuratorAnalytics?
    public private(set) var attention: [AttentionItem] = []
    public private(set) var clients: [CuratorClient] = []
    /// Своя динамика за 4 недели; ошибка бенчмарка экран не трогает.
    public private(set) var benchmark: CuratorBenchmark?
    /// Непрочитанные сообщения — показатель и бейдж «Чатов».
    public private(set) var unread = 0
    public var query = ""
    /// Сохранённые «Клиенты» на экране / последнее обновление не дошло.
    public private(set) var freshness = Freshness()

    public let calendar: DayCalendar
    private let reader: ScreenReader
    private let account: Int64?
    private let now: @Sendable () -> Date

    /// Кэш — только на чтение: действия куратора идут онлайн.
    public init(api: APIClient, calendar: DayCalendar, cache: ScreenCache? = nil, account: Int64? = nil,
                now: @escaping @Sendable () -> Date = { Date() }) {
        reader = ScreenReader(api: api, cache: cache, now: now)
        self.account = account
        self.calendar = calendar
        self.now = now
        hydrate()
    }

    public var updatedLabel: String? { freshness.label(now: now(), timeZone: calendar.timeZone) }
    public var offline: Bool { freshness.offline }

    private static let analyticsEndpoint = Endpoint.get("/api/v1/curator/analytics")
    private static let attentionEndpoint = Endpoint.get("/api/v1/curator/attention")
    private static let clientsEndpoint = Endpoint.get("/api/v1/curator/clients")
    private static let benchmarkEndpoint = Endpoint.get("/api/v1/curator/analytics/benchmark",
                                                        query: [URLQueryItem(name: "weeks", value: "4")])

    private func hydrate() {
        guard let analytics = reader.cached(CuratorAnalytics.self, Self.analyticsEndpoint, userID: account),
              let attention = reader.cached([AttentionItem].self, Self.attentionEndpoint, userID: account),
              let clients = reader.cached([CuratorClient].self, Self.clientsEndpoint, userID: account) else { return }
        self.analytics = analytics.value
        self.attention = attention.value
        self.clients = clients.value
        unread = analytics.value.totalUnread
        benchmark = reader.cached(CuratorBenchmark.self, Self.benchmarkEndpoint, userID: account)?.value
        freshness.cachedAt = min(analytics.updatedAt, attention.updatedAt, clients.updatedAt)
        phase = .loaded
    }

    // MARK: Производные

    public var groups: [AttentionGroup] {
        AttentionGrouping.groups(attention, clients: clients, today: calendar.key(now()), calendar: calendar)
    }

    public var visibleGroups: [AttentionGroup] {
        groups.filter { AttentionGrouping.matches($0.name, query: query) }
    }

    public var visibleOthers: [CuratorClient] {
        AttentionGrouping.others(clients, excluding: groups).filter { AttentionGrouping.matches($0.displayName, query: query) }
    }

    public func client(_ id: Int64) -> CuratorClient? { clients.first { $0.id == id } }

    // MARK: Загрузка

    /// Сводка, внимание и клиенты — вместе; бенчмарк — отдельно и молча.
    /// Без сети — сохранённые с подписью; «Не удалось загрузить» — только
    /// когда показать нечего.
    public func load() async {
        if analytics == nil { phase = .loading }
        let reader = reader
        let account = account
        async let analytics = reader.fetchOrCached(CuratorAnalytics.self, Self.analyticsEndpoint, userID: account)
        async let attention = reader.fetchOrCached([AttentionItem].self, Self.attentionEndpoint, userID: account)
        async let clients = reader.fetchOrCached([CuratorClient].self, Self.clientsEndpoint, userID: account)
        let loaded = await (analytics, attention, clients)
        switch (loaded.0, loaded.1, loaded.2) {
        case let (.success(analytics), .success(attention), .success(clients)):
            self.analytics = analytics.0
            self.attention = attention.0
            self.clients = clients.0
            unread = analytics.0.totalUnread
            phase = .loaded
            let cached = [analytics.1, attention.1, clients.1].compactMap { $0 }
            freshness = Freshness(cachedAt: cached.min(), offline: !cached.isEmpty)
        default:
            let errors = [loaded.0.failure, loaded.1.failure, loaded.2.failure].compactMap { $0 }
            if let error = errors.first { freshness.markFailed(error) }
            if self.analytics == nil { phase = .failed }
        }
        if case let .success((value, _)) = await reader.fetchOrCached(CuratorBenchmark.self, Self.benchmarkEndpoint, userID: account) {
            benchmark = value
        }
    }

    /// Событие сокета: счётчик — сразу, новое сообщение — тихое обновление.
    public func handle(_ event: RealtimeEvent) async {
        switch event {
        case let .unreadCount(count):
            unread = count
            analytics?.totalUnread = count
        case .newMessage, .connected:
            guard phase == .loaded else { return }
            await load()
        default:
            break
        }
    }
}

extension Result {
    var failure: Failure? {
        if case let .failure(error) = self { return error }
        return nil
    }
}
