import API
import Client
import Foundation
import Observation
import Outbox

/// «Чаты»: список переписок куратора.
@MainActor
@Observable
public final class ConversationListModel {
    public private(set) var conversations: [CuratorConversation] = []
    public private(set) var loaded = false
    public private(set) var error: String?
    public private(set) var freshness = Freshness()

    private let reader: ScreenReader
    private let account: Int64?
    static let endpoint = Endpoint.get("/api/v1/conversations")

    public init(api: APIClient, cache: ScreenCache? = nil, account: Int64? = nil) {
        reader = ScreenReader(api: api, cache: cache)
        self.account = account
        if let cached = reader.cached([CuratorConversation].self, Self.endpoint, userID: account) {
            conversations = cached.value
            freshness.cachedAt = cached.updatedAt
        }
    }

    public var sorted: [CuratorConversation] { ConversationOrder.sorted(conversations) }
    public var updatedLabel: String? { freshness.label() }
    public var offline: Bool { freshness.offline }

    public func load() async {
        switch await reader.fetch([CuratorConversation].self, Self.endpoint, userID: account) {
        case let .success(list):
            conversations = list
            error = nil
            freshness.markFresh()
        case let .failure(failure):
            freshness.markFailed(failure)
            if conversations.isEmpty { error = ErrorMessages().message(for: failure) }
        }
        loaded = true
    }

    public func handle(_ event: RealtimeEvent) async {
        switch event {
        case .newMessage, .unreadCount, .connected: await load()
        default: break
        }
    }
}

/// Какую переписку открыть: по её id (пуш) или по клиенту (карточка, ссылка).
public enum ConversationReference: Equatable, Sendable, Hashable {
    case conversation(String)
    case client(Int64)
}

/// Переписка куратора с клиентом (`ios-curator-chat`). Отправка — сразу в
/// сеть: офлайн-записи у куратора нет; очередь — только у ответа из пуша.
@MainActor
@Observable
public final class CuratorConversationModel {
    public enum Phase: Equatable, Sendable {
        case loading
        /// `404` по клиенту: «Переписка с клиентом не найдена».
        case notFound
        case chat
        case failed(String)
    }

    public static let notFoundText = "Переписка с клиентом не найдена"
    public static let pageSize = 50

    public let reference: ConversationReference
    public private(set) var phase: Phase = .loading
    public private(set) var conversation: CuratorConversation?
    public private(set) var messages: [ChatMessage] = []
    public private(set) var hasEarlier = false
    public private(set) var sending = false
    public private(set) var typing = false
    public var notice: String?
    public var isVisible = false
    /// Клиент из «Клиентов»: КБЖУ дня в шапке и пояс для приёма пищи.
    public var client: CuratorClient?

    public let curatorID: Int64
    /// Пояс куратора — время сообщений.
    public let calendar: DayCalendar
    private let api: APIClient
    private let reader: ScreenReader
    private let now: @Sendable () -> Date
    @ObservationIgnored public var onRead: (@MainActor () -> Void)?
    /// Сохранённые сообщения на экране / обновление не дошло. Только чтение:
    /// отправка куратора — онлайн.
    public private(set) var freshness = Freshness()

    public init(api: APIClient, reference: ConversationReference, curatorID: Int64, calendar: DayCalendar,
                cache: ScreenCache? = nil, now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        reader = ScreenReader(api: api, cache: cache, now: now)
        self.reference = reference
        self.curatorID = curatorID
        self.calendar = calendar
        self.now = now
        hydrate()
    }

    public var updatedLabel: String? { freshness.label(now: now(), timeZone: calendar.timeZone) }
    public var offline: Bool { freshness.offline }

    private func conversationEndpoint() -> Endpoint {
        switch reference {
        case let .client(id): return .get("/api/v1/conversations/by-participant/\(id)")
        case .conversation: return ConversationListModel.endpoint
        }
    }

    private static func messagesEndpoint(_ id: String) -> Endpoint {
        .get("/api/v1/conversations/\(id)/messages", query: [URLQueryItem(name: "limit", value: "\(pageSize)")])
    }

    private func find(_ list: [CuratorConversation]) -> CuratorConversation? {
        if case let .conversation(id) = reference { return list.first { $0.id == id } }
        return nil
    }

    /// Сохранённая переписка — сразу, без сети.
    private func hydrate() {
        let found: CuratorConversation?
        switch reference {
        case .client:
            found = reader.cached(CuratorConversation.self, conversationEndpoint(), userID: curatorID)?.value
        case .conversation:
            found = find(reader.cached([CuratorConversation].self, conversationEndpoint(), userID: curatorID)?.value ?? [])
        }
        guard let found, let page = reader.cached([ChatMessage].self, Self.messagesEndpoint(found.id), userID: curatorID) else {
            return
        }
        conversation = found
        merge(page.value)
        hasEarlier = page.value.count >= Self.pageSize
        freshness.cachedAt = page.updatedAt
        phase = .chat
    }

    // MARK: Производные

    public var clientID: Int64? {
        if case let .client(id) = reference { return id }
        return conversation?.clientID
    }

    public var title: String { conversation?.displayName ?? client?.displayName ?? "Клиент" }

    /// «сегодня 2 960 из 2 240 ккал».
    public var subtitle: String {
        guard let today = client?.todayKBZHU else { return "клиент" }
        let eaten = NumberText.grouped(NumberText.jsRound(today.calories))
        if let plan = client?.plan, plan.calories > 0 {
            return "сегодня \(eaten) из \(NumberText.grouped(NumberText.jsRound(plan.calories))) ккал"
        }
        return "сегодня \(eaten) ккал"
    }

    public var timeline: [ChatTimelineItem] { ChatTimeline.items(messages, calendar: calendar, now: now()) }

    /// Пояс клиента — для приёма пищи по времени фото; без него — свой.
    public var clientCalendar: DayCalendar {
        client?.timezone.flatMap(TimeZone.init(identifier:)).map { DayCalendar(timeZone: $0) } ?? calendar
    }

    /// Фото клиента — под ним «Ввести КБЖУ».
    public func canEnterFood(_ message: ChatMessage) -> Bool {
        message.kind == .image && message.senderID != curatorID
    }

    // MARK: Загрузка

    public func load() async {
        do {
            switch reference {
            case .client:
                conversation = try await reader.fetch(CuratorConversation.self, conversationEndpoint(), userID: curatorID).get()
            case .conversation:
                let list = try await reader.fetch([CuratorConversation].self, conversationEndpoint(), userID: curatorID).get()
                guard let found = find(list) else {
                    phase = .notFound
                    return
                }
                conversation = found
            }
            try await loadLatest()
            phase = .chat
            freshness.markFresh()
            if isVisible { await markRead() }
        } catch APIError.server(404, _, _) {
            phase = .notFound
        } catch {
            if let error = error as? APIError { freshness.markFailed(error) }
            if messages.isEmpty { phase = .failed(ErrorMessages().message(for: error)) }
        }
    }

    public func loadLatest() async throws {
        guard let conversation else { return }
        let page = try await reader.fetch([ChatMessage].self, Self.messagesEndpoint(conversation.id), userID: curatorID).get()
        if messages.isEmpty { hasEarlier = page.count >= Self.pageSize }
        merge(page)
    }

    public func loadEarlier() async {
        guard hasEarlier, let conversation, let first = messages.first else { return }
        do {
            let page: [ChatMessage] = try await api.send(.get(
                "/api/v1/conversations/\(conversation.id)/messages",
                query: [URLQueryItem(name: "limit", value: "\(Self.pageSize)"), URLQueryItem(name: "cursor", value: first.id)]))
            hasEarlier = page.count >= Self.pageSize
            merge(page)
        } catch {
            notice = ErrorMessages().message(for: error)
        }
    }

    private func merge(_ page: [ChatMessage]) {
        var byID = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        for message in page { byID[message.id] = message }
        messages = byID.values.sorted { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
    }

    public func markRead() async {
        guard let conversation else { return }
        if (try? await api.sendRaw(Endpoint(method: .post, path: "/api/v1/conversations/\(conversation.id)/read")))?.status == 200 {
            self.conversation?.unreadCount = 0
            onRead?()
        }
    }

    public func handle(_ event: RealtimeEvent) async {
        guard phase == .chat, let conversation else { return }
        switch event {
        case let .newMessage(id) where id == conversation.id || id.isEmpty:
            typing = false
            try? await loadLatest()
            if isVisible { await markRead() }
        case let .typing(id) where id == conversation.id:
            typing = true
        case .connected:
            try? await loadLatest()
        default:
            break
        }
    }

    // MARK: Отправка

    struct Body: Encodable, Sendable {
        let type: String
        let content: String
    }

    /// Текст — сразу на сервер. `false` — не ушло, поле ввода сохраняет текст.
    @discardableResult
    public func send(_ text: String) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let conversation, !sending else { return false }
        sending = true
        defer { sending = false }
        do {
            let message: ChatMessage = try await api.send(try Endpoint.post("/api/v1/conversations/\(conversation.id)/messages",
                                                                             body: Body(type: "text", content: trimmed)))
            merge([message])
            return true
        } catch {
            notice = ErrorMessages().message(for: error)
            return false
        }
    }

    /// Фото куратора: загрузка `POST …/upload`, затем сообщение с адресом файла.
    @discardableResult
    public func send(_ attachment: AttachmentDraft) async -> Bool {
        if let rejection = attachment.rejection {
            notice = rejection
            return false
        }
        guard let conversation, !sending else { return false }
        sending = true
        defer { sending = false }
        do {
            let form = MultipartForm(fields: [:], file: (name: "file", filename: attachment.fileName, mime: attachment.mimeType,
                                                         data: attachment.data))
            let uploaded: ChatAttachment = try await api.send(Endpoint(method: .post,
                                                                       path: "/api/v1/conversations/\(conversation.id)/upload",
                                                                       body: form.body, contentType: form.contentType))
            let type = uploaded.mimeType.hasPrefix("image/") ? "image" : "file"
            let message: ChatMessage = try await api.send(try Endpoint.post("/api/v1/conversations/\(conversation.id)/messages",
                                                                            body: Body(type: type, content: uploaded.fileURL)))
            merge([message])
            return true
        } catch {
            notice = ErrorMessages().message(for: error)
            return false
        }
    }

    /// «Записать в дневник»: `POST …/messages/:msgId/food-entry`. Бросает —
    /// лист остаётся открытым с введённым.
    public func submitFoodEntry(_ draft: FoodEntryDraft, photo: ChatMessage) async throws {
        guard let conversation else { throw APIError.network }
        let endpoint = try Endpoint.post("/api/v1/conversations/\(conversation.id)/messages/\(photo.id)/food-entry", body: draft.body)
        let card: ChatMessage = try await api.send(endpoint)
        merge([card])
    }
}
