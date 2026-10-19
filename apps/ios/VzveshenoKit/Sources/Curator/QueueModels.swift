import API
import Client
import Foundation
import Observation

/// «Заявки» (`ios-curator-leads`): порядок — сервера, без пересортировки.
@MainActor
@Observable
public final class LeadsModel {
    public private(set) var leads: [Lead] = []
    public private(set) var loaded = false
    public private(set) var error: String?
    public var includeHandled = false
    /// Текст ошибки по коду — например, `lead_already_claimed`.
    public var notice: String?

    private let api: APIClient
    private let messages: ErrorMessages

    public init(api: APIClient, messages: ErrorMessages = ErrorMessages()) {
        self.api = api
        self.messages = messages
    }

    /// «ждут: 3».
    public var waiting: Int { leads.filter { !$0.handled }.count }

    public func load() async {
        var query = [URLQueryItem(name: "limit", value: "50")]
        if includeHandled { query.append(URLQueryItem(name: "include_handled", value: "true")) }
        do {
            let page: Page<Lead> = try await api.send(.get("/api/v1/curator/leads", query: query))
            leads = page.items
            error = nil
        } catch {
            if leads.isEmpty { self.error = messages.message(for: error) }
        }
        loaded = true
    }

    public func lead(_ id: String) -> Lead? { leads.first { $0.id == id } }

    /// «Обработана». `409 lead_already_claimed` — текст по коду и карточка
    /// как обработанная другим куратором.
    public func markHandled(_ id: String) async {
        do {
            let endpoint = Endpoint(method: .post, path: "/api/v1/curator/leads/\(id)/handled", body: Data("{}".utf8))
            let response = try await api.sendRaw(endpoint)
            guard (200..<300).contains(response.status) else { throw response.apiError }
            setHandled(id)
        } catch let error as APIError where error.code == "lead_already_claimed" {
            notice = messages.message(for: error)
            setHandled(id)
        } catch {
            notice = messages.message(for: error)
        }
    }

    private func setHandled(_ id: String) {
        // Карточка помечается и остаётся на месте до следующего обновления —
        // человек видит, что случилось, даже без «Показывать обработанные».
        guard let index = leads.firstIndex(where: { $0.id == id }) else { return }
        leads[index].handled = true
    }
}

/// «Обращения» (`ios-curator-support`): порядок — сервера (эскалированные первыми).
@MainActor
@Observable
public final class SupportQueueModel {
    public private(set) var conversations: [SupportConversation] = []
    public private(set) var loaded = false
    public private(set) var error: String?

    private let api: APIClient

    public init(api: APIClient) {
        self.api = api
    }

    /// Бейдж вкладки — эскалированные без ответа.
    public var escalated: Int { conversations.filter { $0.status == "escalated" }.count }

    public func load() async {
        do {
            let page: Page<SupportConversation> = try await api.send(.get("/api/v1/curator/support/conversations",
                                                                         query: [URLQueryItem(name: "limit", value: "50")]))
            conversations = page.items
            error = nil
        } catch {
            if conversations.isEmpty { self.error = ErrorMessages().message(for: error) }
        }
        loaded = true
    }
}

/// Тред обращения: ответ в канал, закрытие, повтор недоставленного.
@MainActor
@Observable
public final class SupportThreadModel {
    public private(set) var thread: SupportThread?
    public private(set) var error: String?
    public private(set) var sending = false
    public private(set) var retrying: Set<String> = []
    public var notice: String?

    public let conversationID: String
    private let api: APIClient
    private let messages: ErrorMessages
    private var base: String { "/api/v1/curator/support/conversations/\(conversationID)" }

    public init(api: APIClient, conversationID: String, messages: ErrorMessages = ErrorMessages()) {
        self.api = api
        self.conversationID = conversationID
        self.messages = messages
    }

    public func load() async {
        do {
            thread = try await api.send(.get(base))
            error = nil
        } catch {
            if thread == nil { self.error = messages.message(for: error) }
        }
    }

    struct Reply: Encodable, Sendable { let text: String }

    /// Ответ оператора. Сервер записывает ответ до отправки в Telegram: при
    /// отказе Telegram тред перечитывается, и у ответа видно «Не доставлено».
    @discardableResult
    public func reply(_ text: String) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !sending else { return false }
        sending = true
        defer { sending = false }
        var accepted = false
        do {
            let response = try await api.sendRaw(try Endpoint.post("\(base)/reply", body: Reply(text: trimmed)))
            guard (200..<300).contains(response.status) else { throw response.apiError }
            accepted = true
        } catch {
            notice = messages.message(for: error)
        }
        let before = thread?.messages.count ?? 0
        await load()
        // Записан, но не доставлен — поле очищается: ответ уже в треде.
        return accepted || (thread?.messages.count ?? 0) > before
    }

    /// «Закрыть»: `POST …/:id/close`; `true` — вернуться к списку.
    public func close() async -> Bool {
        do {
            let response = try await api.sendRaw(Endpoint(method: .post, path: "\(base)/close", body: Data("{}".utf8)))
            guard (200..<300).contains(response.status) else { throw response.apiError }
            return true
        } catch {
            notice = messages.message(for: error)
            return false
        }
    }

    struct Retried: Decodable, Sendable { let message: SupportMessage }

    /// «Повторить»: тот же текст тому же получателю, без новой записи в треде.
    public func retry(_ messageID: String) async {
        guard !retrying.contains(messageID) else { return }
        retrying.insert(messageID)
        defer { retrying.remove(messageID) }
        do {
            let answer: Retried = try await api.send(Endpoint(method: .post, path: "\(base)/messages/\(messageID)/retry",
                                                              body: Data("{}".utf8)))
            guard let index = thread?.messages.firstIndex(where: { $0.id == messageID }) else { return }
            thread?.messages[index].delivered = answer.message.delivered ?? true
        } catch {
            notice = messages.message(for: error)
        }
    }
}
