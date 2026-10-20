@testable import API
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest

/// Заглушка на уровне `URLProtocol`: настоящий `URLSessionTransport` без сети.
final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var respond: (@Sendable (URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var seen: [URLRequest] = []

    override static func canInit(with request: URLRequest) -> Bool { true }
    override static func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.seen.append(request)
        let (status, data) = Self.respond?(request) ?? (500, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: [:])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class URLProtocolTransportTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.respond = nil
        StubURLProtocol.seen = []
        super.tearDown()
    }

    func testURLSessionTransportThroughURLProtocol() async throws {
        StubURLProtocol.respond = { _ in (429, Data(#"{"status":"error","code":"too_many_attempts","message":"x"}"#.utf8)) }
        let config = URLSessionTransport.defaultConfiguration
        config.protocolClasses = [StubURLProtocol.self]
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios/1.0.0/1",
                            transport: URLSessionTransport(configuration: config))
        do {
            let _: EmptyResponse = try await api.send(.get("/api/v1/config", requiresAuth: false))
            XCTFail("ожидалась ошибка")
        } catch let error as APIError {
            XCTAssertEqual(error.code, "too_many_attempts")
            XCTAssertEqual(error.status, 429)
        }
        let request = try XCTUnwrap(StubURLProtocol.seen.first)
        XCTAssertEqual(request.url?.absoluteString, "https://burcev.team/api/v1/config")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept-Language"), "ru")
    }
}
