import Foundation

/// Описание одного запроса к API.
struct Endpoint<Response: Decodable & Sendable>: Sendable {
    enum Method: String, Sendable { case get = "GET", post = "POST", put = "PUT", delete = "DELETE" }

    var method: Method
    var path: String
    var query: [URLQueryItem] = []
    var body: Data?
    var contentType = "application/json"
    /// Нужен ли `Authorization`. Вход, обновление токена и публичные маршруты — без него.
    var requiresAuth = true

    static func get(_ path: String, query: [URLQueryItem] = []) -> Endpoint {
        Endpoint(method: .get, path: path, query: query)
    }

    static func post<Body: Encodable>(_ path: String, body: Body, requiresAuth: Bool = true) -> Endpoint {
        Endpoint(method: .post, path: path, body: try? JSONEncoder.api.encode(body), requiresAuth: requiresAuth)
    }

    static func put<Body: Encodable>(_ path: String, body: Body) -> Endpoint {
        Endpoint(method: .put, path: path, body: try? JSONEncoder.api.encode(body))
    }

    static func delete(_ path: String) -> Endpoint {
        Endpoint(method: .delete, path: path)
    }

    /// DELETE с телом — так снимаются подписки на уведомления.
    static func delete<Body: Encodable>(_ path: String, body: Body) -> Endpoint {
        Endpoint(method: .delete, path: path, body: try? JSONEncoder.api.encode(body))
    }

    /// Загрузка одного файла `multipart/form-data`.
    static func upload(_ path: String, field: String, filename: String, mimeType: String, data: Data) -> Endpoint {
        let boundary = "burcev-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"\(field)\"; filename=\"\(filename)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return Endpoint(method: .post, path: path, body: body,
                        contentType: "multipart/form-data; boundary=\(boundary)")
    }
}

/// Транспорт — отдельно, чтобы тесты подставляли ответы без сети.
protocol HTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

struct URLSessionTransport: HTTPTransport {
    let session: URLSession

    /// Cookie отключены. Сервер кладёт refresh-токен ещё и в cookie для браузера,
    /// и при обновлении cookie берётся первой. Приложение хранит токен в
    /// Keychain и передаёт его в теле — двум копиям одной сессии разойтись
    /// проще, чем одной.
    static func make() -> URLSessionTransport {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.timeoutIntervalForRequest = 30
        return URLSessionTransport(session: URLSession(configuration: config))
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport("ответ не HTTP")
        }
        return (data, http)
    }
}

/// Клиент API: подставляет токен, разворачивает обёртку ответа и один раз
/// обновляет токен на `401`.
actor APIClient {
    /// Обменивает сохранённую сессию на новый access-токен. Возвращает `nil`,
    /// если сессии больше нет.
    typealias Refresher = @Sendable () async throws -> String?

    private let baseURL: URL
    private let transport: HTTPTransport
    private var accessToken: String?
    private var refresher: Refresher?
    /// Одно обновление на все запросы, получившие `401` одновременно: иначе
    /// каждый потратил бы refresh-токен, и все, кроме первого, — уже отозванный.
    private var refreshing: Task<String?, Error>?

    init(baseURL: URL = AppConfig.apiBaseURL, transport: HTTPTransport = URLSessionTransport.make()) {
        self.baseURL = baseURL
        self.transport = transport
    }

    func setAccessToken(_ token: String?) {
        accessToken = token
    }

    func setRefresher(_ refresher: Refresher?) {
        self.refresher = refresher
    }

    func send<T>(_ endpoint: Endpoint<T>) async throws -> T {
        do {
            return try await sendUnreported(endpoint)
        } catch let APIError.decoding(detail) {
            Telemetry.contractMismatch(path: endpoint.path, detail: detail)
            throw APIError.decoding(detail)
        }
    }

    private func sendUnreported<T>(_ endpoint: Endpoint<T>) async throws -> T {
        let (data, response) = try await perform(endpoint, token: accessToken)
        if response.statusCode == 401, endpoint.requiresAuth, Self.isExpiredSession(data) {
            guard let fresh = try await refreshAccessToken() else {
                throw APIError.unauthorized
            }
            let (retryData, retryResponse) = try await perform(endpoint, token: fresh)
            return try decode(T.self, data: retryData, response: retryResponse)
        }
        return try decode(T.self, data: data, response: response)
    }

    /// Запрос, после которого сервер выдаёт новую сессию (вход, обновление).
    ///
    /// Refresh-токен сервер отдаёт только в `Set-Cookie` — для браузера, где
    /// он недоступен скриптам. Приложение достаёт его из заголовка само и
    /// хранит в Keychain; в теле ответа его нет намеренно
    /// (`auth/refresh_body_test.go`).
    func sendIssuingSession<T>(_ endpoint: Endpoint<T>) async throws -> (T, refreshToken: String?) {
        let (data, response) = try await perform(endpoint, token: nil)
        let value = try decode(T.self, data: data, response: response)
        return (value, Self.refreshToken(from: response, url: baseURL))
    }

    static func refreshToken(from response: HTTPURLResponse, url: URL) -> String? {
        var fields: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            if let key = key as? String, let value = value as? String {
                fields[key] = value
            }
        }
        return HTTPCookie.cookies(withResponseHeaderFields: fields, for: url)
            .first { $0.name == "refresh_token" && !$0.value.isEmpty }?
            .value
    }

    /// `401` бывает двух родов: токен истёк или отозван — тогда обновить и
    /// повторить; либо отказ по существу (неверный пароль при удалении
    /// аккаунта) — его надо показать, а не тратить на него refresh-токен.
    static func isExpiredSession(_ data: Data) -> Bool {
        let code = (try? JSONDecoder.api.decode(ErrorEnvelope.self, from: data))?.code
        return code == nil || code == "token_expired" || code == "session_ended"
    }

    private func refreshAccessToken() async throws -> String? {
        if let refreshing {
            return try await refreshing.value
        }
        guard let refresher else { return nil }
        let task = Task { try await refresher() }
        refreshing = task
        defer { refreshing = nil }
        let token = try await task.value
        accessToken = token
        return token
    }

    private func perform<T>(_ endpoint: Endpoint<T>, token: String?) async throws -> (Data, HTTPURLResponse) {
        var components = URLComponents(url: baseURL.appendingPathComponent(endpoint.path), resolvingAgainstBaseURL: false)
        if !endpoint.query.isEmpty {
            components?.queryItems = endpoint.query
        }
        guard let url = components?.url else {
            throw APIError.transport("неверный адрес \(endpoint.path)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(AppConfig.clientHeader, forHTTPHeaderField: "X-Client")
        if let body = endpoint.body {
            request.httpBody = body
            request.setValue(endpoint.contentType, forHTTPHeaderField: "Content-Type")
        }
        if endpoint.requiresAuth, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        do {
            return try await transport.data(for: request)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, data: Data, response: HTTPURLResponse) throws -> T {
        let status = response.statusCode
        guard (200..<300).contains(status) else {
            let envelope = try? JSONDecoder.api.decode(ErrorEnvelope.self, from: data)
            if status == 401, Self.isExpiredSession(data) { throw APIError.unauthorized }
            throw APIError.server(status: status, code: envelope?.code, message: envelope?.message)
        }
        if T.self == Empty.self, data.isEmpty || status == 204 {
            return Empty() as! T // swiftlint:disable:this force_cast
        }
        do {
            let envelope = try JSONDecoder.api.decode(Envelope<T>.self, from: data)
            if let payload = envelope.data {
                return payload
            }
            if T.self == Empty.self {
                return Empty() as! T // swiftlint:disable:this force_cast
            }
            throw APIError.decoding("в ответе нет data")
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }
}
