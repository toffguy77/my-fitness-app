import Foundation

/// HTTP-метод запроса к API.
public enum HTTPMethod: String, Sendable, Codable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

/// Описание одного запроса: путь без адреса стенда, тело и нужен ли access-токен.
public struct Endpoint: Sendable, Hashable {
    public var method: HTTPMethod
    /// Путь от корня стенда, например `/api/v1/auth/me`.
    public var path: String
    public var query: [URLQueryItem]
    public var body: Data?
    public var contentType: String
    /// Вход, обновление сессии и публичные маршруты идут без `Authorization`.
    public var requiresAuth: Bool
    /// Ключ повтора для изменений из очереди (`idempotent-mutations`).
    public var idempotencyKey: String?

    public init(
        method: HTTPMethod,
        path: String,
        query: [URLQueryItem] = [],
        body: Data? = nil,
        contentType: String = "application/json",
        requiresAuth: Bool = true,
        idempotencyKey: String? = nil
    ) {
        self.method = method
        self.path = path
        self.query = query
        self.body = body
        self.contentType = contentType
        self.requiresAuth = requiresAuth
        self.idempotencyKey = idempotencyKey
    }

    public static func get(_ path: String, query: [URLQueryItem] = [], requiresAuth: Bool = true) -> Endpoint {
        Endpoint(method: .get, path: path, query: query, requiresAuth: requiresAuth)
    }

    public static func post<Body: Encodable>(_ path: String, body: Body, requiresAuth: Bool = true) throws -> Endpoint {
        Endpoint(method: .post, path: path, body: try JSONEncoder.api.encode(body), requiresAuth: requiresAuth)
    }

    public static func put<Body: Encodable>(_ path: String, body: Body) throws -> Endpoint {
        Endpoint(method: .put, path: path, body: try JSONEncoder.api.encode(body))
    }

    public static func delete(_ path: String) -> Endpoint {
        Endpoint(method: .delete, path: path)
    }
}

extension JSONEncoder {
    /// Кодировщик тел запросов: ключи по порядку, чтобы одно изменение давало
    /// одно и то же тело при каждом повторе (сервер сверяет его хэш).
    public static var api: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

extension JSONDecoder {
    public static var api: JSONDecoder { JSONDecoder() }
}
