import API
import Foundation

/// Сохранённый ответ, уже разобранный.
public struct CachedValue<T: Sendable>: Sendable {
    public let value: T
    public let updatedAt: Date

    public init(value: T, updatedAt: Date) {
        self.value = value
        self.updatedAt = updatedAt
    }
}

/// Откуда данные на экране (`ios-offline-outbox`).
///
/// Показ кэша и отсутствие сети — разные вещи: при запуске с сетью экран
/// сначала показывает кэш с подписью «Обновлено в …», и плашки «Нет
/// подключения» в этот момент быть не должно. Её показывает `offline`.
public struct Freshness: Equatable, Sendable {
    /// Время сохранённого ответа, который сейчас на экране; `nil` — на экране
    /// свежий ответ или ничего.
    public var cachedAt: Date?
    /// Последняя попытка обновить не дошла до сервера.
    public var offline: Bool

    public init(cachedAt: Date? = nil, offline: Bool = false) {
        self.cachedAt = cachedAt
        self.offline = offline
    }

    public static let fresh = Freshness()

    /// «Обновлено в 14:20» — только пока на экране кэш.
    public func label(now: Date = Date(), timeZone: TimeZone = .current) -> String? {
        cachedAt.map { CachedScreen(data: Data(), updatedAt: $0).updatedLabel(now: now, timeZone: timeZone) }
    }

    /// Свежий ответ пришёл.
    public mutating func markFresh() {
        cachedAt = nil
        offline = false
    }

    /// Обновить не удалось: сеть — плашка, остальное — сообщение экрана.
    public mutating func markFailed(_ error: APIError) {
        offline = error == .network
    }
}

/// Чтение экрана через кэш: сохранённое — сразу, затем свежее.
///
/// Ключ — адрес запроса (путь и параметры), поэтому «Сегодня» и «Дневник»
/// делят один ответ воды и нормы, а сценарий UI-теста находит кэш тем же
/// ключом. Сохраняется только ответ, который разобрался: конверт ошибки в
/// кэш не попадает.
public struct ScreenReader: Sendable {
    public let api: APIClient
    public let cache: ScreenCache?
    /// Часы метки «Обновлено в …» — тестам свои.
    public let now: @Sendable () -> Date

    public init(api: APIClient, cache: ScreenCache?, now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        self.cache = cache
        self.now = now
    }

    public static func key(_ endpoint: Endpoint) -> String {
        let query = endpoint.query.sorted { ($0.name, $0.value ?? "") < ($1.name, $1.value ?? "") }
            .map { "\($0.name)=\($0.value ?? "")" }.joined(separator: "&")
        return query.isEmpty ? endpoint.path : endpoint.path + "?" + query
    }

    /// Сохранённый ответ этого аккаунта. Без пользователя кэша нет.
    public func cached<T: Decodable & Sendable>(_ type: T.Type, _ endpoint: Endpoint, userID: Int64?) -> CachedValue<T>? {
        guard let userID, let entry = cache?.load(Self.key(endpoint), userID: userID),
              let value = try? RawResponse(data: entry.data, status: 200).decoded(T.self) else { return nil }
        return CachedValue(value: value, updatedAt: entry.updatedAt)
    }

    /// Свежий ответ; разобравшийся — сохраняется для следующего открытия.
    public func fetch<T: Decodable & Sendable>(_ type: T.Type, _ endpoint: Endpoint,
                                               userID: Int64?) async -> Result<T, APIError> {
        do {
            let raw = try await api.sendRaw(endpoint)
            let value = try raw.decoded(T.self)
            if let userID { try? cache?.store(raw.data, for: Self.key(endpoint), userID: userID, at: now()) }
            return .success(value)
        } catch let error as APIError {
            return .failure(error)
        } catch {
            return .failure(.network)
        }
    }

    /// Свежий ответ, а без сети — сохранённый.
    public func fetchOrCached<T: Decodable & Sendable>(_ type: T.Type, _ endpoint: Endpoint,
                                                       userID: Int64?) async -> Result<(T, Date?), APIError> {
        switch await fetch(T.self, endpoint, userID: userID) {
        case let .success(value):
            return .success((value, nil))
        case let .failure(error):
            if error == .network, let cached = cached(T.self, endpoint, userID: userID) {
                return .success((cached.value, cached.updatedAt))
            }
            return .failure(error)
        }
    }
}
