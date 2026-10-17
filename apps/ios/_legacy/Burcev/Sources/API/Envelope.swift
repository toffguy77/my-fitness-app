import Foundation

/// Обёртка каждого ответа API: `{"status":"success","data":…}` или
/// `{"status":"error","code":…,"message":…}`.
struct Envelope<T: Decodable>: Decodable {
    let status: String
    let data: T?
    let message: String?
    let code: String?
}

/// Ответ без полезной нагрузки (выход, удаление).
struct Empty: Decodable, Sendable {}

/// Ошибка в обёртке — разбирается отдельно, потому что `data` у неё нет.
struct ErrorEnvelope: Decodable {
    let status: String?
    let message: String?
    let code: String?
}

extension JSONDecoder {
    /// Декодер для ответов API.
    ///
    /// Даты разбираются вручную в моделях: сервер отдаёт и RFC 3339 с долями
    /// секунды, и без них, и календарные даты `2006-01-02` — одна стратегия на
    /// всё это не годится.
    static let api: JSONDecoder = {
        let decoder = JSONDecoder()
        return decoder
    }()
}

extension JSONEncoder {
    static let api: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
}
