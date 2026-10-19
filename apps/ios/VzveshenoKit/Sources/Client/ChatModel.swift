import API
import Foundation
import Observation
import Outbox

/// Модель переписки клиента с куратором (`ios-client-chat`).
///
/// Доступ — `GET /conversations/access`: нет доступа — экран «Работа с
/// куратором» без цены; доступ истёк — история только для чтения; доступ
/// есть, а переписки нет — «Куратор пока не назначен». Отправка — через
/// очередь изменений с `Idempotency-Key`: без сети сообщение «ждёт отправки».
@MainActor
@Observable
public final class ChatModel {
    public enum Phase: Equatable, Sendable {
        case loading
        /// Доступа к куратору нет: «Работа с куратором».
        case noAccess
        /// Доступ есть, куратор не назначен.
        case noCurator
        case chat
        case failed(String)
    }

    public static let pageSize = 50

    public private(set) var phase: Phase = .loading
    public private(set) var access: CuratorChatAccess?
    public private(set) var conversation: Conversation?
    /// Сообщения по возрастанию времени.
    public private(set) var messages: [ChatMessage] = []
    public private(set) var pending: [PendingChatMessage] = []
    public private(set) var hasEarlier = false
    public private(set) var loadingEarlier = false
    /// Собеседник печатает.
    public private(set) var curatorTyping = false
    public private(set) var uploading = false
    /// Текст ошибки вложения или отправки.
    public var notice: String?
    /// Экран переписки на виду: новые сообщения сразу помечаются прочитанными.
    public var isVisible = false
    /// Сохранённая переписка на экране / последнее обновление не дошло.
    public private(set) var freshness = Freshness()
    /// Откуда данные текущего прохода загрузки — на экран после него.
    @ObservationIgnored private var pass = Freshness()

    public let calendar: DayCalendar
    public let userID: Int64
    private let api: APIClient
    private let outbox: Outbox?
    private let reader: ScreenReader
    private let sleeper: Sleeper
    private let now: @Sendable () -> Date
    @ObservationIgnored private var typingTask: Task<Void, Never>?
    /// «Печатает» собеседнику — сокет (не чаще раза в 2 с решает он).
    @ObservationIgnored public var sendTyping: (@Sendable (String) async -> Void)?
    /// Прочтение отправлено — счётчики «Сегодня» и значка.
    @ObservationIgnored public var onRead: (@MainActor () -> Void)?

    public init(api: APIClient, outbox: Outbox?, cache: ScreenCache? = nil, calendar: DayCalendar, userID: Int64,
                sleeper: Sleeper = TaskSleeper(), now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        self.outbox = outbox
        reader = ScreenReader(api: api, cache: cache, now: now)
        self.calendar = calendar
        self.userID = userID
        self.sleeper = sleeper
        self.now = now
        hydrate()
    }

    public var updatedLabel: String? { freshness.label(now: now(), timeZone: calendar.timeZone) }
    public var offline: Bool { freshness.offline }

    // MARK: Кэш

    private static let accessEndpoint = Endpoint.get("/api/v1/conversations/access")
    private static let listEndpoint = Endpoint.get("/api/v1/conversations")

    private static func messagesEndpoint(_ id: String) -> Endpoint {
        .get("/api/v1/conversations/\(id)/messages", query: [URLQueryItem(name: "limit", value: "\(pageSize)")])
    }

    /// Сохранённая переписка — в первом кадре, без сети.
    private func hydrate() {
        guard let access = reader.cached(CuratorChatAccess.self, Self.accessEndpoint, userID: userID)?.value else { return }
        self.access = access
        guard access.allowed || access.expired else {
            phase = .noAccess
            return
        }
        let list = reader.cached([Conversation].self, Self.listEndpoint, userID: userID)?.value ?? []
        let id = access.expired ? access.conversationID : list.first?.id
        guard let id, let found = list.first(where: { $0.id == id }) ?? (access.expired ? Conversation(id: id) : nil) else { return }
        conversation = found
        guard let page = reader.cached([ChatMessage].self, Self.messagesEndpoint(id), userID: userID) else { return }
        merge(page.value)
        hasEarlier = page.value.count >= Self.pageSize
        freshness.cachedAt = page.updatedAt
        phase = .chat
    }

    /// Свежий ответ, без сети — сохранённый; отметка, что на экране кэш.
    private func get<T: Decodable & Sendable>(_ type: T.Type, _ endpoint: Endpoint) async throws -> T {
        switch await reader.fetchOrCached(T.self, endpoint, userID: userID) {
        case let .success((value, cachedAt)):
            if let cachedAt {
                pass.cachedAt = cachedAt
                pass.offline = true
            }
            return value
        case let .failure(error):
            throw error
        }
    }

    // MARK: Производные

    /// Поле ввода: только при действующем доступе.
    public var canSend: Bool { access?.allowed == true && access?.expired != true && conversation != nil }

    /// «Доступ действовал до 1 октября» — при истёкшем доступе.
    public var expiredNotice: String? {
        guard let access, access.expired else { return nil }
        guard let date = access.expiresAt else { return "Доступ к куратору закончился" }
        return "Доступ действовал до \(DayText.dayMonth(date))"
    }

    public var curatorName: String { conversation?.participant?.name ?? "Куратор" }

    public var timeline: [ChatTimelineItem] { ChatTimeline.items(messages, calendar: calendar, now: now()) }

    public func isMine(_ message: ChatMessage) -> Bool { message.senderID == userID }

    // MARK: Загрузка

    public func load() async {
        await restorePending()
        pass = Freshness()
        do {
            let access = try await get(CuratorChatAccess.self, Self.accessEndpoint)
            self.access = access
            if access.expired {
                // История — только для чтения; переписка известна из ответа доступа.
                let id = access.conversationID
                let list = (try? await get([Conversation].self, Self.listEndpoint)) ?? []
                conversation = list.first { $0.id == id } ?? list.first ?? id.map { Conversation(id: $0) }
                guard conversation != nil else {
                    phase = .noAccess
                    return
                }
            } else if !access.allowed {
                phase = .noAccess
                return
            } else {
                let list = try await get([Conversation].self, Self.listEndpoint)
                guard let first = list.first else {
                    phase = .noCurator
                    return
                }
                conversation = first
            }
            try await loadLatest()
            phase = .chat
            freshness = pass
            await reconcilePending()
            if isVisible, !freshness.offline { await markRead() }
        } catch {
            if let error = error as? APIError { freshness.markFailed(error) }
            if messages.isEmpty { phase = .failed(ErrorMessages().message(for: error)) }
        }
    }

    /// Последняя страница: новые сообщения добавляются к показанным.
    public func loadLatest() async throws {
        guard let conversation else { return }
        let page = try await get([ChatMessage].self, Self.messagesEndpoint(conversation.id))
        if messages.isEmpty { hasEarlier = page.count >= Self.pageSize }
        merge(page)
    }

    /// Прокрутка к началу: следующие 50 с курсором первого показанного.
    public func loadEarlier() async {
        guard hasEarlier, !loadingEarlier, let conversation, let first = messages.first else { return }
        loadingEarlier = true
        defer { loadingEarlier = false }
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

    // MARK: Прочтение

    /// `POST /conversations/:id/read` — когда сообщения на экране.
    public func markRead() async {
        guard let conversation else { return }
        let endpoint = Endpoint(method: .post, path: "/api/v1/conversations/\(conversation.id)/read")
        if (try? await api.sendRaw(endpoint))?.status == 200 {
            self.conversation?.unreadCount = 0
            onRead?()
        }
    }

    // MARK: Сокет

    public func handle(_ event: RealtimeEvent) async {
        guard phase == .chat, let conversation else { return }
        switch event {
        case let .newMessage(id) where id == conversation.id || id.isEmpty:
            curatorTyping = false
            typingTask?.cancel()
            try? await loadLatest()
            await reconcilePending()
            if isVisible { await markRead() }
        case let .typing(id) where id == conversation.id:
            showTyping()
        case .connected:
            // Пропущенное, пока сокета не было.
            try? await loadLatest()
            await reconcilePending()
        default:
            break
        }
    }

    /// «печатает…» гаснет через 5 с без новых событий.
    private func showTyping() {
        curatorTyping = true
        typingTask?.cancel()
        typingTask = Task { [sleeper] in
            do {
                try await sleeper.sleep(for: .seconds(5))
                curatorTyping = false
            } catch {}
        }
    }

    /// Человек печатает — собеседнику уходит `typing`.
    public func userTyped() {
        guard canSend, let id = conversation?.id, let sendTyping else { return }
        Task { await sendTyping(id) }
    }

    // MARK: Отправка

    /// Текст — через очередь: без сети сообщение остаётся «ждёт отправки».
    public func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSend, !trimmed.isEmpty else { return }
        await enqueue(Body(type: "text", content: trimmed), shown: trimmed)
    }

    /// Вложение: больше 10 МБ — отказ до отправки; иначе — в очередь двумя
    /// шагами: загрузка `POST /conversations/:id/upload`, затем сообщение с
    /// адресом файла (`Idempotency-Key`). Без сети пузырь «ждёт отправки».
    @discardableResult
    public func send(_ attachment: AttachmentDraft) async -> Bool {
        if let rejection = attachment.rejection {
            notice = rejection
            return false
        }
        guard canSend, let conversation, let outbox else { return false }
        let form = MultipartForm(fields: [:], file: (name: "file", filename: attachment.fileName,
                                                     mime: attachment.mimeType, data: attachment.data))
        let endpoint = Endpoint(method: .post, path: "/api/v1/conversations/\(conversation.id)/upload", body: form.body,
                                contentType: form.contentType)
        let shown = attachment.isImage ? "Фото" : attachment.fileName
        let followUp = OutboxFollowUp(kind: Self.messageKind, path: "/api/v1/conversations/\(conversation.id)/messages")
        do {
            let item = try await outbox.enqueue(kind: Self.uploadKind, endpoint: endpoint, userID: userID,
                                                preview: Data(shown.utf8), followUp: followUp)
            pending.append(PendingChatMessage(id: item.id, text: shown, createdAt: now()))
        } catch {
            // Очередь не записала файл (нет места) — черновик остаётся у человека.
            notice = "Не удалось сохранить вложение для отправки. Попробуйте ещё раз."
            return false
        }
        uploading = true
        defer { uploading = false }
        await flush()
        return true
    }

    public static let messageKind = "chat.message"
    public static let uploadKind = "chat.upload"

    struct Body: Encodable, Sendable {
        let type: String
        let content: String
    }

    private func enqueue(_ body: Body, shown: String) async {
        guard let conversation, let outbox,
              let endpoint = try? Endpoint.post("/api/v1/conversations/\(conversation.id)/messages", body: body),
              let item = try? await outbox.enqueue(kind: Self.messageKind, endpoint: endpoint, userID: userID,
                                                   preview: Data(shown.utf8)) else { return }
        pending.append(PendingChatMessage(id: item.id, text: shown, createdAt: now()))
        await flush()
    }

    /// Досылка очереди и сверка «ждёт отправки» с ней.
    public func flush() async {
        guard let outbox else { return }
        let report = await outbox.drain(userID: userID)
        for id in report.rejected { markFailed(id) }
        if !report.delivered.isEmpty { try? await loadLatest() }
        await reconcilePending()
        await restorePending()
    }

    func markFailed(_ id: UUID) {
        if let index = pending.firstIndex(where: { $0.id == id }) {
            pending[index].status = .failed("Сообщение не отправлено")
        }
    }

    /// Ждущие отправки сообщения этой переписки — и после перезапуска: из
    /// очереди, включая второй шаг вложения, поставленный после загрузки.
    private func restorePending() async {
        guard let outbox, let conversation, let items = try? await outbox.pending() else { return }
        let prefix = "/api/v1/conversations/\(conversation.id)/"
        let failed = pending.filter { $0.status != .waiting }
        let waiting = items.filter { $0.userID == userID && $0.path.hasPrefix(prefix)
            && ($0.kind == Self.messageKind || $0.kind == Self.uploadKind) }
            .map { item in
                PendingChatMessage(id: item.id, text: item.preview.flatMap { String(data: $0, encoding: .utf8) } ?? Self.text(of: item),
                                   createdAt: item.createdAt)
            }
        pending = failed + waiting.filter { item in !failed.contains { $0.id == item.id } }
    }

    private static func text(of item: OutboxItem) -> String {
        guard let body = item.body, let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return "Сообщение" }
        return json["type"] as? String == "text" ? (json["content"] as? String ?? "") : "Вложение"
    }

    /// Ушедшие из очереди (досланы другим проходом) — больше не «ждут».
    private func reconcilePending() async {
        guard let outbox, !pending.isEmpty else { return }
        let queued = Set(((try? await outbox.pending()) ?? []).map(\.id))
        let gone = pending.filter { $0.status == .waiting && !queued.contains($0.id) }
        guard !gone.isEmpty else { return }
        pending.removeAll { item in gone.contains { $0.id == item.id } }
        try? await loadLatest()
    }

    /// Отказавшее сообщение убрать с экрана.
    public func dismissFailed(_ id: UUID) {
        pending.removeAll { $0.id == id }
    }
}
