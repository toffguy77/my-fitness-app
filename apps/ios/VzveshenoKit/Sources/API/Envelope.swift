import Foundation

/// Значение из `params` ошибки: сервер кладёт туда строки, числа и списки.
public enum ParamValue: Sendable, Hashable, Decodable, CustomStringConvertible {
    case string(String)
    case number(Double)
    case bool(Bool)
    case list([ParamValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else {
            self = .list(try container.decode([ParamValue].self))
        }
    }

    public var description: String {
        switch self {
        case let .string(value): return value
        case let .number(value):
            return value.rounded() == value && abs(value) < 1e15 ? String(Int64(value)) : String(value)
        case let .bool(value): return value ? "true" : "false"
        case let .list(values): return values.map(\.description).joined(separator: ", ")
        }
    }
}

/// Общий конверт ответа: `{status, data, code, params, message}`.
///
/// `message` разбирается, но наружу не выходит: показывать его человеку
/// запрещено (`ios-api-client`), текст берётся по `code`.
struct Envelope<T: Decodable>: Decodable {
    let status: String?
    let data: T?
    let code: String?
    let params: [String: ParamValue]?
}

/// Конверт ошибки, у которого нет `data`.
struct ErrorEnvelope: Decodable {
    let status: String?
    let code: String?
    let params: [String: ParamValue]?
}

/// Ответ без полезной нагрузки.
public struct EmptyResponse: Decodable, Sendable, Equatable {
    public init() {}
}

enum EnvelopeDecoder {
    /// Разбирает ответ по статусу: успех — `data`, `204` — пустой успех,
    /// иначе — ошибка с кодом, параметрами и статусом.
    static func decode<T: Decodable>(_ type: T.Type, data: Data, status: Int) throws -> T {
        guard (200..<300).contains(status) else {
            throw serverError(data: data, status: status)
        }
        if status == 204 || data.isEmpty {
            if let empty = EmptyResponse() as? T { return empty }
            throw APIError.decoding("пустой ответ \(status)")
        }
        let envelope: Envelope<T>
        do {
            envelope = try JSONDecoder.api.decode(Envelope<T>.self, from: data)
        } catch {
            throw APIError.decoding(describe(error))
        }
        if let status = envelope.status, status != "success" {
            throw APIError.server(status: 200, code: envelope.code, params: envelope.params ?? [:])
        }
        if let payload = envelope.data { return payload }
        if let empty = EmptyResponse() as? T { return empty }
        throw APIError.decoding("в ответе нет data")
    }

    static func serverError(data: Data, status: Int) -> APIError {
        let envelope = try? JSONDecoder.api.decode(ErrorEnvelope.self, from: data)
        return .server(status: status, code: envelope?.code, params: envelope?.params ?? [:])
    }

    static func errorCode(in data: Data) -> String? {
        (try? JSONDecoder.api.decode(ErrorEnvelope.self, from: data))?.code
    }

    /// Описание ошибки разбора без значений из ответа: только вид и путь ключей.
    static func describe(_ error: Error) -> String {
        guard let error = error as? DecodingError else { return "\(type(of: error))" }
        func keys(_ context: DecodingError.Context) -> String {
            context.codingPath.map { $0.intValue.map { "[\($0)]" } ?? $0.stringValue }.joined(separator: ".")
        }
        switch error {
        case let .keyNotFound(key, context): return "keyNotFound \(key.stringValue) at \(keys(context))"
        case let .typeMismatch(type, context): return "typeMismatch \(type) at \(keys(context))"
        case let .valueNotFound(type, context): return "valueNotFound \(type) at \(keys(context))"
        case let .dataCorrupted(context): return "dataCorrupted at \(keys(context))"
        @unknown default: return "unknown"
        }
    }
}
