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
    /// Каталог больших тел (вложения); `nil` — тела только в строке очереди.
    private let files: URL?
    /// Тело больше этого — в отдельный файл.
    static let inlineLimit = 64 * 1024
    private var observer: OutboxObserver?
    private var draining: Task<DrainReport, Never>?

    public init(store: OutboxStore, files: URL? = nil, send: @escaping Send) {
        self.store = store
        self.files = files
        self.send = send
    }

    /// Очередь поверх клиента API.
    public init(store: OutboxStore, api: APIClient, files: URL? = nil) {
        self.init(store: store, files: files) { endpoint in try await api.sendRaw(endpoint) }
    }

    public func setObserver(_ observer: OutboxObserver?) {
        self.observer = observer
    }

    /// Ставит изменение в очередь. Интерфейс уже применил его оптимистично.
    @discardableResult
    public func enqueue(kind: String, endpoint: Endpoint, userID: Int64, preview: Data? = nil,
                        followUp: OutboxFollowUp? = nil) throws -> OutboxItem {
        let id = UUID()
        var body = endpoint.body
        var bodyFile: String?
        if let files, let data = body, data.count > Self.inlineLimit {
            let name = "\(id.uuidString.lowercased()).body"
            try ProtectedFiles.prepareDirectory(files)
            try ProtectedFiles.write(data, to: files.appendingPathComponent(name))
            body = nil
            bodyFile = name
        }
        let contentType = endpoint.contentType == "application/json" ? nil : endpoint.contentType
        let item = OutboxItem(id: id, userID: userID, kind: kind, method: endpoint.method, path: endpoint.path, body: body,
                              preview: preview, contentType: contentType, bodyFile: bodyFile, followUp: followUp)
        do {
            try store.append(item)
        } catch {
            removeBody(of: item)
            throw error
        }
        return item
    }

    /// Запрос изменения с телом из файла, если оно там.
    func endpoint(for item: OutboxItem) throws -> Endpoint {
        var endpoint = item.endpoint
        if let name = item.bodyFile {
            guard let files else { throw APIError.decoding("нет каталога тел очереди") }
            endpoint.body = try Data(contentsOf: files.appendingPathComponent(name))
        }
        return endpoint
    }

    private func removeBody(of item: OutboxItem) {
        guard let name = item.bodyFile, let files else { return }
        try? FileManager.default.removeItem(at: files.appendingPathComponent(name))
    }

    private func remove(_ item: OutboxItem) {
        try? store.remove(item.id)
        removeBody(of: item)
    }

    /// Второй шаг: сервер принял файл — сообщение с его адресом в очередь.
    /// Ставится до снятия первого шага: сбой между ними даст повтор загрузки,
    /// но не потерю сообщения.
    private func enqueueFollowUp(after item: OutboxItem, response: RawResponse) {
        guard let followUp = item.followUp,
              let uploaded = try? response.decoded(UploadedFile.self),
              let body = try? JSONEncoder.api.encode(AttachmentMessage(uploaded)) else { return }
        let next = OutboxItem(userID: item.userID, kind: followUp.kind, method: .post, path: followUp.path, body: body,
                              preview: item.preview)
        try? store.append(next)
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
        if let item = try? store.pending().first(where: { $0.id == id }) {
            remove(item)
        } else {
            try? store.remove(id)
        }
    }

    /// Выход: очередь аккаунта удаляется вместе с файлами вложений.
    public func eraseAll() {
        try? store.removeAll()
        if let files { try? FileManager.default.removeItem(at: files) }
    }

    private func performDrain(userID: Int64?) async -> DrainReport {
        var report = DrainReport()
        // Кто вошёл, ещё неизвестно (запуск до восстановления сессии, фоновая
        // задача, тихий пуш): очередь не трогается. Раньше `nil` не совпадал
        // ни с одним изменением, и всё ждущее отправки удалялось.
        guard let userID else { return report }
        // Второй шаг (сообщение после загрузки) ставится в конец очереди во
        // время прохода — тогда проход повторяется и отправляет его.
        var handled: Set<UUID> = []
        while let items = try? store.pending().filter({ $0.userID == userID && !handled.contains($0.id) }), !items.isEmpty {
            for item in items {
                // Изменения другого аккаунта не отправляются (его токена нет) и не
                // удаляются: очередь стирает выход (`eraseAll`), а не досылка, —
                // досылка не знает, вышел тот человек или сессия ещё не поднялась.
                handled.insert(item.id)
                try? store.recordAttempt(item.id)
                let verdict: DeliveryVerdict
                var response: RawResponse?
                do {
                    let raw = try await send(try endpoint(for: item))
                    response = raw
                    verdict = Self.verdict(for: raw)
                } catch let error as APIError {
                    verdict = error == .sessionEnded || error == .network ? .retryLater : .rejected(error)
                } catch {
                    verdict = .retryLater
                }
                switch verdict {
                case .delivered:
                    if let response { enqueueFollowUp(after: item, response: response) }
                    remove(item)
                    report.delivered.append(item.id)
                    if let response { await observer?.outboxDelivered(item, response: response) }
                case let .rejected(error):
                    remove(item)
                    report.rejected.append(item.id)
                    await observer?.outboxRejected(item, error: error)
                case .retryLater:
                    report.stoppedAt = item.id
                    return report
                }
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

/// Ответ `POST /conversations/:id/upload`.
struct UploadedFile: Decodable, Sendable {
    let fileURL: String
    let mimeType: String

    enum CodingKeys: String, CodingKey {
        case fileURL = "file_url"
        case mimeType = "mime_type"
    }
}

/// Сообщение с загруженным вложением.
struct AttachmentMessage: Encodable, Sendable {
    let type: String
    let content: String

    init(_ file: UploadedFile) {
        type = file.mimeType.hasPrefix("image/") ? "image" : "file"
        content = file.fileURL
    }
}
