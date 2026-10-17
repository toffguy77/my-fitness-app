import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Транспорт — отдельно, чтобы тесты подставляли ответы без сети.
public protocol HTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// Транспорт на `URLSession` без cookie: сессия приложения живёт в Keychain,
/// и вторая её копия в cookie только расходилась бы с первой.
public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    public init(configuration: URLSessionConfiguration = URLSessionTransport.defaultConfiguration) {
        session = URLSession(configuration: configuration)
    }

    public static var defaultConfiguration: URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.timeoutIntervalForRequest = 30
        return config
    }

    public func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.network }
        return (data, http)
    }
}

/// Кто выдаёт access-токен и обновляет его. Реализует `SessionStore`.
public protocol AccessTokenProvider: Sendable {
    /// Текущий access-токен или `nil`, если сессии нет.
    func currentAccessToken() async -> String?
    /// Новый access-токен после `401 token_expired`. Все запросы, получившие
    /// отказ одним и тем же токеном, должны дождаться одного обновления.
    /// Бросает `APIError.sessionEnded`, если сессия закончена.
    func renewAccessToken(rejected: String?) async throws -> String
    /// Сервер сказал `session_ended` на обычный запрос.
    func sessionWasEnded() async
}

/// Сырой ответ сервера: тело и статус.
public struct RawResponse: Sendable {
    public let data: Data
    public let status: Int
    public let headers: [String: String]

    public init(data: Data, status: Int, headers: [String: String] = [:]) {
        self.data = data
        self.status = status
        self.headers = headers
    }

    init(data: Data, response: HTTPURLResponse) {
        var headers: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            if let key = key as? String, let value = value as? String {
                headers[key.lowercased()] = value
            }
        }
        self.init(data: data, status: response.statusCode, headers: headers)
    }

    public func header(_ name: String) -> String? {
        headers[name.lowercased()]
    }
}

/// Клиент API: подставляет токен и язык, разворачивает конверт, обновляет
/// сессию на `401 token_expired` и объединяет одинаковые GET в полёте.
public actor APIClient {
    public nonisolated let baseURL: URL
    private let transport: HTTPTransport
    private let clientHeader: String
    private var tokens: AccessTokenProvider?
    private var language = "ru"
    private var inFlight: [String: Task<RawResponse, Error>] = [:]

    public init(baseURL: URL, clientHeader: String, transport: HTTPTransport = URLSessionTransport()) {
        self.baseURL = baseURL
        self.clientHeader = clientHeader
        self.transport = transport
    }

    public func setTokenProvider(_ provider: AccessTokenProvider?) {
        tokens = provider
    }

    /// Язык профиля для `Accept-Language`: `ru` или `en`; прочее и `nil` — `ru`.
    public func setLanguage(_ code: String?) {
        language = code == "en" ? "en" : "ru"
    }

    public var acceptLanguage: String { language }

    /// Запрос с разбором конверта.
    public func send<T: Decodable & Sendable>(_ endpoint: Endpoint, as type: T.Type = T.self) async throws -> T {
        let raw = try await sendRaw(endpoint)
        return try EnvelopeDecoder.decode(T.self, data: raw.data, status: raw.status)
    }

    /// Ответ без конверта: `GET /api/v1/config` отдаёт объект как есть.
    public func sendBare<T: Decodable & Sendable>(_ endpoint: Endpoint, as type: T.Type = T.self) async throws -> T {
        let raw = try await sendRaw(endpoint)
        guard (200..<300).contains(raw.status) else { throw raw.apiError }
        do {
            return try JSONDecoder.api.decode(T.self, from: raw.data)
        } catch {
            throw APIError.decoding(EnvelopeDecoder.describe(error))
        }
    }

    /// Запрос без разбора: очередь сама решает, что значит статус.
    public func sendRaw(_ endpoint: Endpoint) async throws -> RawResponse {
        guard endpoint.method == .get else {
            return try await performAuthorized(endpoint)
        }
        let key = try request(endpoint, token: nil).url?.absoluteString ?? endpoint.path
        if let running = inFlight[key] {
            return try await running.value
        }
        let task = Task { try await self.performAuthorized(endpoint) }
        inFlight[key] = task
        defer { inFlight[key] = nil }
        return try await task.value
    }

    private func performAuthorized(_ endpoint: Endpoint) async throws -> RawResponse {
        let token = endpoint.requiresAuth ? await tokens?.currentAccessToken() : nil
        let first = try await perform(endpoint, token: token)
        guard first.status == 401, endpoint.requiresAuth, let tokens else { return first }
        switch EnvelopeDecoder.errorCode(in: first.data) {
        case "session_ended":
            await tokens.sessionWasEnded()
            throw APIError.sessionEnded
        case "token_expired":
            let fresh = try await tokens.renewAccessToken(rejected: token)
            return try await perform(endpoint, token: fresh)
        case "unauthorized" where token == nil:
            // Токена ещё не было (запуск, восстановление) — попробовать поднять
            // сессию тем же единственным обновлением.
            let fresh = try await tokens.renewAccessToken(rejected: nil)
            return try await perform(endpoint, token: fresh)
        default:
            return first
        }
    }

    private func perform(_ endpoint: Endpoint, token: String?) async throws -> RawResponse {
        let request = try request(endpoint, token: token)
        do {
            let (data, response) = try await transport.data(for: request)
            return RawResponse(data: data, response: response)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network
        }
    }

    func request(_ endpoint: Endpoint, token: String?) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.decoding("неверный адрес стенда")
        }
        components.path = endpoint.path
        if !endpoint.query.isEmpty {
            components.queryItems = endpoint.query
        }
        guard let url = components.url else { throw APIError.decoding("неверный путь \(endpoint.path)") }
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(language, forHTTPHeaderField: "Accept-Language")
        request.setValue(clientHeader, forHTTPHeaderField: "X-Client")
        if let body = endpoint.body {
            request.httpBody = body
            request.setValue(endpoint.contentType, forHTTPHeaderField: "Content-Type")
        }
        if let token, endpoint.requiresAuth {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let key = endpoint.idempotencyKey {
            request.setValue(key, forHTTPHeaderField: "Idempotency-Key")
        }
        return request
    }
}

extension RawResponse {
    /// Ошибка этого ответа с кодом и параметрами из конверта.
    public var apiError: APIError {
        EnvelopeDecoder.serverError(data: data, status: status)
    }
}
