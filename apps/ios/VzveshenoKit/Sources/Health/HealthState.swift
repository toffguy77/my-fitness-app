import Foundation
import Outbox

/// Что приложение помнит о подключении Здоровья между запусками, в том
/// числе фоновыми: якоря, часовой пояс профиля, что уже записано.
public struct HealthState: Codable, Equatable, Sendable {
    /// Подключено человеком в профиле приложения.
    public var connected = false
    /// Чьё подключение: очередь досылает только изменения своего аккаунта.
    public var userID: Int64?
    public var connectedAt: Date?
    /// Последний раз, когда Здоровье отдало шаги или вес.
    public var lastDataAt: Date?
    /// Якоря `HKAnchoredObjectQuery` по видам.
    public var anchors: [HealthReadKind: Data] = [:]
    /// Часовой пояс профиля: фоновая доставка считает сутки по нему, не
    /// дожидаясь `/users/profile`.
    public var timeZoneID = "Europe/Moscow"
    /// Записанное в Здоровье: идентификатор синхронизации → версия и отпечаток.
    public var written: [String: WrittenSample] = [:]

    public init() {}

    public var timeZone: TimeZone { TimeZone(identifier: timeZoneID) ?? TimeZone(identifier: "Europe/Moscow") ?? .current }
}

/// Образец, записанный в Здоровье.
public struct WrittenSample: Codable, Equatable, Sendable {
    /// `HKMetadataKeySyncVersion` последней записи.
    public var version: Int
    /// Отпечаток значений: та же запись без изменений не переписывается.
    public var fingerprint: String
    /// Дата дня (`YYYY-MM-DD`) — по ней сверяется открытый день.
    public var day: String

    public init(version: Int, fingerprint: String, day: String) {
        self.version = version
        self.fingerprint = fingerprint
        self.day = day
    }
}

/// Хранилище состояния.
public protocol HealthStateStore: Sendable {
    func load() -> HealthState
    func save(_ state: HealthState) throws
    func erase()
}

/// Состояние в памяти — для тестов и сценариев UI-тестов.
public final class InMemoryHealthStateStore: HealthStateStore, @unchecked Sendable {
    private let lock = NSLock()
    private var state: HealthState

    public init(_ state: HealthState = HealthState()) {
        self.state = state
    }

    public func load() -> HealthState { lock.withLock { state } }
    public func save(_ state: HealthState) throws { lock.withLock { self.state = state } }
    public func erase() { lock.withLock { state = HealthState() } }
}

/// Состояние в файле JSON в каталоге аккаунта: класс защиты
/// `completeUntilFirstUserAuthentication` — фоновая доставка читает его на
/// заблокированном телефоне; выход стирает.
public final class FileHealthStateStore: HealthStateStore, @unchecked Sendable {
    public let url: URL
    private let lock = NSLock()

    public init(url: URL) {
        self.url = url
    }

    public func load() -> HealthState {
        lock.withLock {
            guard let data = try? Data(contentsOf: url),
                  let state = try? JSONDecoder().decode(HealthState.self, from: data) else {
                return HealthState()
            }
            return state
        }
    }

    public func save(_ state: HealthState) throws {
        let data = try JSONEncoder().encode(state)
        try lock.withLock { try ProtectedFiles.write(data, to: url) }
    }

    public func erase() {
        lock.withLock { _ = try? FileManager.default.removeItem(at: url) }
    }
}

/// Подсказка «Нет данных из Здоровья за 3 дня — проверьте доступ»
/// (`healthkit-client`).
///
/// Отказ на чтение Здоровье не сообщает — приложение видит только пустоту.
/// Подсказка появляется, когда подключение включено, а ни шагов, ни веса не
/// было трое суток: с последних данных или, если их не было вовсе, с
/// подключения.
public enum HealthAccessHint {
    public static let quietPeriod: TimeInterval = 3 * 24 * 60 * 60

    public static func shouldShow(_ state: HealthState, now: Date) -> Bool {
        guard state.connected, let connectedAt = state.connectedAt else { return false }
        let since = max(state.lastDataAt ?? connectedAt, connectedAt)
        return now.timeIntervalSince(since) >= quietPeriod
    }
}
