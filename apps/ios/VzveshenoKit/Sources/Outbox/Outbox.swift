import API
import Foundation

/// Что делать с ответом на досылаемое изменение.
public enum DeliveryVerdict: Equatable, Sendable {
    /// Принято: снять из очереди.
    case delivered
    /// Окончательный отказ по существу: снять, откатить, показать сообщение.
    case rejected(APIError)
    /// Попробовать позже, не нарушая порядка: сеть, 5xx, 401, 408, 429 и 409
    /// с `Retry-After` (тот же ключ ещё выполняется на сервере).
    case retryLater
}

/// Получатель итогов досылки: интерфейс откатывает отвергнутое и
/// показывает сообщение по коду ошибки.
public protocol OutboxObserver: Sendable {
    func outboxDelivered(_ item: OutboxItem, response: RawResponse) async
    func outboxRejected(_ item: OutboxItem, error: APIError) async
}

/// Итог одного прохода досылки.
public struct DrainReport: Equatable, Sendable {
    public var delivered: [UUID] = []
    public var rejected: [UUID] = []
    /// Проход остановлен на этом изменении — оно и всё после него ждут.
    public var stoppedAt: UUID?
}

/// Очередь изменений без сети (`ios-offline-outbox`).
///
/// Изменение сохраняется до отправки и переживает перезапуск; досылается в
/// порядке постановки с тем же `Idempotency-Key` при каждой попытке.
public actor Outbox {
    public typealias Send = @Sendable (Endpoint) async throws -> RawResponse

    private let store: OutboxStore
    private let send: Send
    private var observer: OutboxObserver?
    private var draining: Task<DrainReport, Never>?

    public init(store: OutboxStore, send: @escaping Send) {
        self.store = store
        self.send = send
    }

    /// Очередь поверх клиента API.
    public init(store: OutboxStore, api: APIClient) {
        self.init(store: store) { endpoint in try await api.sendRaw(endpoint) }
    }

    public func setObserver(_ observer: OutboxObserver?) {
        self.observer = observer
    }

    /// Ставит изменение в очередь. Интерфейс уже применил его оптимистично.
    @discardableResult
    public func enqueue(kind: String, endpoint: Endpoint, userID: Int64) throws -> OutboxItem {
        let item = OutboxItem(userID: userID, kind: kind, method: endpoint.method, path: endpoint.path, body: endpoint.body)
        try store.append(item)
        return item
    }

    public func pending() throws -> [OutboxItem] {
        try store.pending()
    }

    /// Досылает очередь по порядку. Одновременно идёт не больше одного прохода:
    /// второй вызов дожидается первого.
    @discardableResult
    public func drain(userID: Int64?) async -> DrainReport {
        if let draining {
            return await draining.value
        }
        let task = Task { await self.performDrain(userID: userID) }
        draining = task
        defer { draining = nil }
        return await task.value
    }

    /// Изменение ещё не отправлено, а человек его отменил (удалил запись,
    /// ждущую отправки): снять из очереди без запроса.
    public func discard(_ id: UUID) {
        try? store.remove(id)
    }

    /// Выход: очередь аккаунта удаляется.
    public func eraseAll() {
        try? store.removeAll()
    }

    private func performDrain(userID: Int64?) async -> DrainReport {
        var report = DrainReport()
        guard let items = try? store.pending() else { return report }
        for item in items {
            guard item.userID == userID else {
                // Изменение другого аккаунта отправить нечем — его токена нет.
                try? store.remove(item.id)
                continue
            }
            try? store.recordAttempt(item.id)
            let verdict: DeliveryVerdict
            var response: RawResponse?
            do {
                let raw = try await send(item.endpoint)
                response = raw
                verdict = Self.verdict(for: raw)
            } catch let error as APIError {
                verdict = error == .sessionEnded || error == .network ? .retryLater : .rejected(error)
            } catch {
                verdict = .retryLater
            }
            switch verdict {
            case .delivered:
                try? store.remove(item.id)
                report.delivered.append(item.id)
                if let response { await observer?.outboxDelivered(item, response: response) }
            case let .rejected(error):
                try? store.remove(item.id)
                report.rejected.append(item.id)
                await observer?.outboxRejected(item, error: error)
            case .retryLater:
                report.stoppedAt = item.id
                return report
            }
        }
        return report
    }

    /// Ответ сервера → решение.
    public static func verdict(for response: RawResponse) -> DeliveryVerdict {
        let status = response.status
        switch status {
        case 200..<300:
            return .delivered
        case 401, 408, 429:
            return .retryLater
        case 409 where response.header("Retry-After") != nil:
            return .retryLater
        case 400..<500:
            return .rejected(response.apiError)
        default:
            return .retryLater
        }
    }
}
