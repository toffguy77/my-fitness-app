import API
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Ответ заглушки.
public struct StubResponse: Sendable {
    public var status: Int
    public var body: Data
    public var headers: [String: String]
    public var delay: Duration

    public init(status: Int = 200, body: Data = Data(), headers: [String: String] = [:], delay: Duration = .zero) {
        self.status = status
        self.body = body
        self.headers = headers
        self.delay = delay
    }

    /// `{"status":"success","data":<json>}`.
    public static func success(_ dataJSON: String, status: Int = 200, delay: Duration = .zero) -> StubResponse {
        StubResponse(status: status, body: Data(#"{"status":"success","data":\#(dataJSON)}"#.utf8), delay: delay)
    }

    /// `{"status":"error","code":…,"message":…}`.
    public static func error(_ status: Int, code: String, message: String = "текст сервера",
                             params: String = "{}", headers: [String: String] = [:]) -> StubResponse {
        StubResponse(status: status,
                     body: Data(#"{"status":"error","code":"\#(code)","message":"\#(message)","params":\#(params)}"#.utf8),
                     headers: headers)
    }

    /// Обрыв сети.
    public static let offline = StubResponse(status: -1)
}

/// Записанный запрос.
public struct RecordedRequest: Sendable {
    public let method: String
    public let path: String
    public let query: String?
    public let headers: [String: String]
    public let body: Data?

    public func header(_ name: String) -> String? {
        headers.first { $0.key.lowercased() == name.lowercased() }?.value
    }

    public var json: [String: Any]? {
        body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    }
}

/// Транспорт-заглушка: отвечает обработчиком и записывает каждый запрос.
public final class StubTransport: HTTPTransport, @unchecked Sendable {
    public typealias Handler = @Sendable (RecordedRequest) -> StubResponse

    private let lock = NSLock()
    private var handler: Handler
    private var recorded: [RecordedRequest] = []

    public init(handler: @escaping Handler) {
        self.handler = handler
    }

    public var requests: [RecordedRequest] {
        lock.withLock { recorded }
    }

    public func requests(to path: String) -> [RecordedRequest] {
        requests.filter { $0.path == path }
    }

    /// Ответ обработчика без записи запроса — для составных заглушек.
    public func handle(_ request: RecordedRequest) -> StubResponse {
        let handler = lock.withLock { self.handler }
        return handler(request)
    }

    public func setHandler(_ handler: @escaping Handler) {
        lock.withLock { self.handler = handler }
    }

    public func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let recordedRequest = RecordedRequest(
            method: request.httpMethod ?? "GET",
            path: request.url?.path ?? "",
            query: request.url?.query,
            headers: request.allHTTPHeaderFields ?? [:],
            body: request.httpBody
        )
        let response = lock.withLock { () -> StubResponse in
            recorded.append(recordedRequest)
            return handler(recordedRequest)
        }
        if response.delay > .zero {
            try await Task.sleep(for: response.delay)
        }
        if response.status < 0 {
            throw URLError(.notConnectedToInternet)
        }
        guard let url = request.url,
              let http = HTTPURLResponse(url: url, statusCode: response.status, httpVersion: "HTTP/1.1",
                                         headerFields: response.headers) else {
            throw URLError(.badServerResponse)
        }
        return (response.body, http)
    }
}

/// Пути к файлам репозитория — для тестов, сверяющих приложение с сервером.
public enum RepositoryFiles {
    /// Корень репозитория: от этого файла вверх до каталога с `apps/api`.
    public static func root(file: StaticString = #filePath) -> URL {
        var url = URL(fileURLWithPath: "\(file)")
        for _ in 0..<12 {
            url.deleteLastPathComponent()
            if FileManager.default.fileExists(atPath: url.appendingPathComponent("apps/api").path) {
                return url
            }
        }
        fatalError("не найден корень репозитория над \(file)")
    }

    public static func url(_ relative: String) -> URL {
        root().appendingPathComponent(relative)
    }

    public static func read(_ relative: String) throws -> String {
        try String(contentsOf: url(relative), encoding: .utf8)
    }
}

/// Каталог строк (`.xcstrings`), прочитанный как JSON: на Linux его некому
/// скомпилировать, а проверять полноту и формы надо и там.
public struct StringCatalog: Sendable {
    public let entries: [String: [String: String]]
    public let keys: Set<String>

    public init(relativePath: String) throws {
        let data = try Data(contentsOf: RepositoryFiles.url(relativePath))
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        let strings = json["strings"] as? [String: Any] ?? [:]
        var entries: [String: [String: String]] = [:]
        for (key, value) in strings {
            let ru = ((value as? [String: Any])?["localizations"] as? [String: Any])?["ru"] as? [String: Any]
            var forms: [String: String] = [:]
            if let unit = ru?["stringUnit"] as? [String: Any], let text = unit["value"] as? String {
                forms["value"] = text
            }
            let plural = ((ru?["variations"] as? [String: Any])?["plural"] as? [String: Any]) ?? [:]
            for (form, body) in plural {
                if let text = ((body as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String {
                    forms[form] = text
                }
            }
            entries[key] = forms
        }
        self.entries = entries
        self.keys = Set(strings.keys)
    }

    public func value(_ key: String) -> String? {
        entries[key]?["value"]
    }

    /// Русская форма множественного числа по правилам CLDR.
    public static func russianPluralForm(_ number: Int) -> String {
        let mod10 = number % 10
        let mod100 = number % 100
        if mod10 == 1 && mod100 != 11 { return "one" }
        if (2...4).contains(mod10) && !(12...14).contains(mod100) { return "few" }
        return "many"
    }

    /// Форматирует плюральную строку так, как это сделала бы система для `ru`.
    public func format(_ key: String, _ number: Int) -> String? {
        guard let template = entries[key]?[Self.russianPluralForm(number)] ?? entries[key]?["other"] else {
            return nil
        }
        return template.replacingOccurrences(of: "%lld", with: String(number))
    }
}
