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

    public let calendar: DayCalendar
    public let userID: Int64
    private let api: APIClient
    private let outbox: Outbox?
    private let sleeper: Sleeper
    private let now: @Sendable () -> Date
    @ObservationIgnored private var typingTask: Task<Void, Never>?
    /// «Печатает» собеседнику — сокет (не чаще раза в 2 с решает он).
    @ObservationIgnored public var sendTyping: (@Sendable (String) async -> Void)?
    /// Прочтение отправлено — счётчики «Сегодня» и значка.
    @ObservationIgnored public var onRead: (@MainActor () -> Void)?

    public init(api: APIClient, outbox: Outbox?, calendar: DayCalendar, userID: Int64, sleeper: Sleeper = TaskSleeper(),
                now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        self.outbox = outbox
        self.calendar = calendar
        self.userID = userID
        self.sleeper = sleeper
        self.now = now
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
        do {
            let access: CuratorChatAccess = try await api.send(.get("/api/v1/conversations/access"))
            self.access = access
            if access.expired {
                // История — только для чтения; переписка известна из ответа доступа.
                let id = access.conversationID
                let list: [Conversation] = (try? await api.send(.get("/api/v1/conversations"))) ?? []
                conversation = list.first { $0.id == id } ?? list.first ?? id.map { Conversation(id: $0) }
                guard conversation != nil else {
                    phase = .noAccess
                    return
                }
            } else if !access.allowed {
                phase = .noAccess
                return
            } else {
                let list: [Conversation] = try await api.send(.get("/api/v1/conversations"))
                guard let first = list.first else {
                    phase = .noCurator
                    return
                }
                conversation = first
            }
            try await loadLatest()
            phase = .chat
            await reconcilePending()
            if isVisible { await markRead() }
        } catch {
            if messages.isEmpty { phase = .failed(ErrorMessages().message(for: error)) }
        }
    }

    /// Последняя страница: новые сообщения добавляются к показанным.
    public func loadLatest() async throws {
        guard let conversation else { return }
        let page: [ChatMessage] = try await api.send(.get("/api/v1/conversations/\(conversation.id)/messages",
                                                          query: [URLQueryItem(name: "limit", value: "\(Self.pageSize)")]))
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

    /// Вложение: больше 10 МБ — отказ до отправки; иначе загрузка
    /// `POST /conversations/:id/upload` и сообщение с адресом файла.
    @discardableResult
    public func send(_ attachment: AttachmentDraft) async -> Bool {
        if let rejection = attachment.rejection {
            notice = rejection
            return false
        }
        guard canSend, let conversation else { return false }
        uploading = true
        defer { uploading = false }
        do {
            let form = MultipartForm(fields: [:], file: (name: "file", filename: attachment.fileName,
                                                         mime: attachment.mimeType, data: attachment.data))
            let endpoint = Endpoint(method: .post, path: "/api/v1/conversations/\(conversation.id)/upload", body: form.body,
                                    contentType: form.contentType)
            let uploaded: ChatAttachment = try await api.send(endpoint)
            let type = uploaded.mimeType.hasPrefix("image/") ? "image" : "file"
            await enqueue(Body(type: type, content: uploaded.fileURL), shown: type == "image" ? "Фото" : uploaded.fileName)
            return true
        } catch {
            notice = ErrorMessages().message(for: error)
            return false
        }
    }

    struct Body: Encodable, Sendable {
        let type: String
        let content: String
    }

    private func enqueue(_ body: Body, shown: String) async {
        guard let conversation, let outbox,
              let endpoint = try? Endpoint.post("/api/v1/conversations/\(conversation.id)/messages", body: body),
              let item = try? await outbox.enqueue(kind: "chat.message", endpoint: endpoint, userID: userID) else { return }
        pending.append(PendingChatMessage(id: item.id, text: shown, createdAt: now()))
        await flush()
    }

    /// Досылка очереди и сверка «ждёт отправки» с ней.
    public func flush() async {
        guard let outbox else { return }
        let report = await outbox.drain(userID: userID)
        for id in report.rejected {
            if let index = pending.firstIndex(where: { $0.id == id }) {
                pending[index].status = .failed("Сообщение не отправлено")
            }
        }
        if !report.delivered.isEmpty { try? await loadLatest() }
        await reconcilePending()
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
