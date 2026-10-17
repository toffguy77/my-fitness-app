import API
import Foundation
#if canImport(SQLite3)
import SQLite3
#elseif canImport(CSQLite)
import CSQLite
#endif

/// Изменение, ждущее отправки.
public struct OutboxItem: Codable, Equatable, Sendable, Identifiable {
    public let id: UUID
    /// Чьё изменение: очередь не досылает чужое после смены аккаунта.
    public let userID: Int64
    /// Постоянный для всех попыток этого изменения (`idempotent-mutations`).
    public let idempotencyKey: String
    /// Что это за изменение — по нему интерфейс откатывает оптимистичный результат.
    public let kind: String
    public let method: HTTPMethod
    public let path: String
    public let body: Data?
    public let createdAt: Date
    public var attempts: Int

    public init(id: UUID = UUID(), userID: Int64, idempotencyKey: String = UUID().uuidString.lowercased(),
                kind: String, method: HTTPMethod, path: String, body: Data?, createdAt: Date = Date(), attempts: Int = 0) {
        self.id = id
        self.userID = userID
        self.idempotencyKey = idempotencyKey
        self.kind = kind
        self.method = method
        self.path = path
        self.body = body
        self.createdAt = createdAt
        self.attempts = attempts
    }

    public var endpoint: Endpoint {
        Endpoint(method: method, path: path, body: body, idempotencyKey: idempotencyKey)
    }
}

/// Хранилище очереди. Порядок — порядок постановки.
public protocol OutboxStore: Sendable {
    func append(_ item: OutboxItem) throws
    func pending() throws -> [OutboxItem]
    func remove(_ id: UUID) throws
    func recordAttempt(_ id: UUID) throws
    func removeAll() throws
}

/// Очередь в памяти — для тестов логики досылки.
public final class InMemoryOutboxStore: OutboxStore, @unchecked Sendable {
    private let lock = NSLock()
    private var items: [OutboxItem] = []

    public init() {}

    public func append(_ item: OutboxItem) throws { lock.withLock { items.append(item) } }
    public func pending() throws -> [OutboxItem] { lock.withLock { items } }
    public func remove(_ id: UUID) throws { lock.withLock { items.removeAll { $0.id == id } } }
    public func recordAttempt(_ id: UUID) throws {
        lock.withLock {
            if let index = items.firstIndex(where: { $0.id == id }) { items[index].attempts += 1 }
        }
    }
    public func removeAll() throws { lock.withLock { items.removeAll() } }
}

public struct SQLiteError: Error, Equatable, Sendable {
    public let code: Int32
    public let message: String
}

/// Очередь в SQLite в общем контейнере App Group: её пишут и приложение, и
/// расширение виджетов, поэтому — таблица с блокировкой, а не CoreData.
///
/// Журнал `DELETE`, а не WAL: файлов два (база и журнал на время записи), и
/// оба получают класс защиты каталога.
public final class SQLiteOutboxStore: OutboxStore, @unchecked Sendable {
    public let url: URL
    private let lock = NSLock()
    private var db: OpaquePointer?

    public init(url: URL) throws {
        self.url = url
        try ProtectedFiles.prepareDirectory(url.deletingLastPathComponent())
        var handle: OpaquePointer?
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(url.path, &handle, flags, nil) == SQLITE_OK else {
            let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "open"
            sqlite3_close(handle)
            throw SQLiteError(code: -1, message: message)
        }
        db = handle
        sqlite3_busy_timeout(handle, 5000)
        try execute("PRAGMA journal_mode=DELETE")
        try execute("""
            CREATE TABLE IF NOT EXISTS outbox (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT NOT NULL UNIQUE,
                payload BLOB NOT NULL
            )
            """)
        try ProtectedFiles.apply(to: url)
    }

    deinit {
        sqlite3_close(db)
    }

    public func append(_ item: OutboxItem) throws {
        let payload = try JSONEncoder().encode(item)
        try lock.withLock {
            try run("INSERT INTO outbox (id, payload) VALUES (?, ?)") { statement in
                bind(statement, 1, item.id.uuidString)
                _ = payload.withUnsafeBytes { bytes in
                    sqlite3_bind_blob(statement, 2, bytes.baseAddress, Int32(payload.count), Self.transient)
                }
            }
        }
        try ProtectedFiles.apply(to: url)
    }

    public func pending() throws -> [OutboxItem] {
        try lock.withLock {
            var items: [OutboxItem] = []
            var statement: OpaquePointer?
            guard sqlite3_prepare_v2(db, "SELECT payload FROM outbox ORDER BY seq", -1, &statement, nil) == SQLITE_OK else {
                throw error()
            }
            defer { sqlite3_finalize(statement) }
            while sqlite3_step(statement) == SQLITE_ROW {
                let count = Int(sqlite3_column_bytes(statement, 0))
                guard let bytes = sqlite3_column_blob(statement, 0) else { continue }
                let data = Data(bytes: bytes, count: count)
                if let item = try? JSONDecoder().decode(OutboxItem.self, from: data) {
                    items.append(item)
                }
            }
            return items
        }
    }

    public func remove(_ id: UUID) throws {
        try lock.withLock {
            try run("DELETE FROM outbox WHERE id = ?") { bind($0, 1, id.uuidString) }
        }
    }

    public func recordAttempt(_ id: UUID) throws {
        guard var item = try pending().first(where: { $0.id == id }) else { return }
        item.attempts += 1
        let payload = try JSONEncoder().encode(item)
        try lock.withLock {
            try run("UPDATE outbox SET payload = ? WHERE id = ?") { statement in
                _ = payload.withUnsafeBytes { bytes in
                    sqlite3_bind_blob(statement, 1, bytes.baseAddress, Int32(payload.count), Self.transient)
                }
                bind(statement, 2, id.uuidString)
            }
        }
    }

    public func removeAll() throws {
        try lock.withLock { try execute("DELETE FROM outbox") }
    }

    // MARK: SQLite

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private func bind(_ statement: OpaquePointer?, _ index: Int32, _ text: String) {
        sqlite3_bind_text(statement, index, text, -1, Self.transient)
    }

    private func execute(_ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw error() }
    }

    private func run(_ sql: String, bind: (OpaquePointer?) -> Void) throws {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { throw error() }
        defer { sqlite3_finalize(statement) }
        bind(statement)
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error() }
    }

    private func error() -> SQLiteError {
        SQLiteError(code: sqlite3_errcode(db), message: String(cString: sqlite3_errmsg(db)))
    }
}
