import API
import Foundation

/// Окончательный отказ сервера на изменение из очереди, случившийся там, где
/// показать его некому: в расширении виджетов. Приложение забирает отказы при
/// выходе на передний план и показывает сообщение.
public struct RejectedChange: Codable, Equatable, Sendable {
    public let id: UUID
    public let userID: Int64
    public let kind: String
    /// Код ошибки сервера (`validation`, `not_found`…) или `nil`.
    public let code: String?
    public let status: Int?

    public init(id: UUID, userID: Int64, kind: String, code: String?, status: Int?) {
        self.id = id
        self.userID = userID
        self.kind = kind
        self.code = code
        self.status = status
    }

    public init(item: OutboxItem, error: APIError) {
        var code: String?
        var status: Int?
        if case let .server(value, serverCode, _) = error {
            status = value
            code = serverCode
        }
        self.init(id: item.id, userID: item.userID, kind: item.kind, code: code, status: status)
    }

    /// Ошибка для каталога текстов.
    public var error: APIError {
        APIError.server(status: status ?? 400, code: code, params: [:])
    }
}

/// Отказы в файле App Group: пишет расширение (наблюдатель его очереди),
/// забирает приложение. Файл защищён и стирается выходом.
public final class RejectionLog: OutboxObserver, @unchecked Sendable {
    public static let fileName = "outbox-rejections.json"
    /// Больше не нужно: после сотни отказов подряд важен сам факт.
    static let limit = 100

    public let url: URL
    private let lock = NSLock()

    public init(url: URL) {
        self.url = url
    }

    public convenience init(directory: URL) {
        self.init(url: directory.appendingPathComponent(Self.fileName))
    }

    public func outboxDelivered(_ item: OutboxItem, response: RawResponse) async {}

    public func outboxRejected(_ item: OutboxItem, error: APIError) async {
        append(RejectedChange(item: item, error: error))
    }

    public func append(_ change: RejectedChange) {
        lock.withLock {
            var all = read()
            all.append(change)
            if let data = try? JSONEncoder().encode(Array(all.suffix(Self.limit))) {
                try? ProtectedFiles.write(data, to: url)
            }
        }
    }

    /// Отказы этого аккаунта; забранные из файла удаляются, чужие остаются.
    public func take(userID: Int64) -> [RejectedChange] {
        lock.withLock {
            let all = read()
            let mine = all.filter { $0.userID == userID }
            guard !mine.isEmpty else { return [] }
            let rest = all.filter { $0.userID != userID }
            if rest.isEmpty {
                try? FileManager.default.removeItem(at: url)
            } else if let data = try? JSONEncoder().encode(rest) {
                try? ProtectedFiles.write(data, to: url)
            }
            return mine
        }
    }

    public func erase() {
        lock.withLock { _ = try? FileManager.default.removeItem(at: url) }
    }

    private func read() -> [RejectedChange] {
        (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode([RejectedChange].self, from: $0) } ?? []
    }
}

/// Очередь, которую не удалось открыть (файл SQLite недоступен). Постановка
/// бросает: действие сообщает о неудаче, а не делает вид, что записало, —
/// очередь в памяти расширения пропала бы вместе с процессом.
public final class UnavailableOutboxStore: OutboxStore, @unchecked Sendable {
    public struct Unavailable: Error, Equatable, Sendable {}

    public init() {}

    public func append(_ item: OutboxItem) throws { throw Unavailable() }
    public func pending() throws -> [OutboxItem] { [] }
    public func remove(_ id: UUID) throws {}
    public func recordAttempt(_ id: UUID) throws {}
    public func removeAll() throws {}
}
