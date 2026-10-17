@testable import API
import Foundation
import TestSupport
import XCTest

/// Провайдер токена без обновления: для сценариев, где сессия не меняется.
private actor FixedTokens: AccessTokenProvider {
    var token: String?
    private(set) var ended = 0
    private(set) var renewals = 0

    init(_ token: String?) { self.token = token }

    func currentAccessToken() async -> String? { token }

    func renewAccessToken(rejected: String?) async throws -> String {
        renewals += 1
        token = "fresh"
        return "fresh"
    }

    func sessionWasEnded() async { ended += 1 }
}

final class APIClientTests: XCTestCase {
    private let base = URL(string: "https://new.burcev.team")!

    private func client(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: base, clientHeader: "ios/1.0.0/1", transport: transport)
    }

    struct Profile: Decodable, Sendable, Equatable {
        let id: Int
        let role: String
    }

    // ios-api-client: Ответ разбирается из общего конверта.
    func testSuccessEnvelopeReturnsData() async throws {
        let transport = StubTransport { _ in .success(#"{"id":7,"role":"client"}"#) }
        let me: Profile = try await client(transport).send(.get("/api/v1/auth/me"))
        XCTAssertEqual(me, Profile(id: 7, role: "client"))
    }

    func testNoContentIsEmptySuccess() async throws {
        let transport = StubTransport { _ in StubResponse(status: 204) }
        let result: EmptyResponse = try await client(transport).send(.delete("/api/v1/x"))
        XCTAssertEqual(result, EmptyResponse())
    }

    // Сценарий «Ошибка с кодом»: 429 too_many_attempts.
    func testErrorCarriesCodeParamsAndStatus() async throws {
        let transport = StubTransport { _ in .error(429, code: "too_many_attempts", params: #"{"retry_after":30}"#) }
        do {
            let _: EmptyResponse = try await client(transport).send(try .post("/api/v1/auth/native/login",
                                                                               body: ["email": "a@b.c"], requiresAuth: false))
            XCTFail("ожидалась ошибка")
        } catch let error as APIError {
            XCTAssertEqual(error.code, "too_many_attempts")
            XCTAssertEqual(error.status, 429)
            XCTAssertEqual(error, .server(status: 429, code: "too_many_attempts", params: ["retry_after": .number(30)]))
        }
    }

    func testTransportFailureIsNetworkError() async {
        let transport = StubTransport { _ in .offline }
        do {
            let _: EmptyResponse = try await client(transport).send(.get("/api/v1/x"))
            XCTFail("ожидалась ошибка")
        } catch {
            XCTAssertEqual(error as? APIError, .network)
        }
    }

    // ios-api-client: Сессия отозвана — 401 session_ended завершает сессию без повтора.
    func testSessionEndedEndsSessionWithoutRetry() async {
        let transport = StubTransport { _ in .error(401, code: "session_ended") }
        let tokens = FixedTokens("old")
        let api = client(transport)
        await api.setTokenProvider(tokens)
        do {
            let _: EmptyResponse = try await api.send(.get("/api/v1/dashboard"))
            XCTFail("ожидалась ошибка")
        } catch {
            XCTAssertEqual(error as? APIError, .sessionEnded)
        }
        let ended = await tokens.ended
        let renewals = await tokens.renewals
        XCTAssertEqual(ended, 1)
        XCTAssertEqual(renewals, 0)
        XCTAssertEqual(transport.requests.count, 1, "без повтора")
    }

    func testExpiredTokenIsRenewedAndRetried() async throws {
        let transport = StubTransport { request in
            request.header("Authorization") == "Bearer fresh" ? .success("{}") : .error(401, code: "token_expired")
        }
        let tokens = FixedTokens("old")
        let api = client(transport)
        await api.setTokenProvider(tokens)
        let _: EmptyResponse = try await api.send(.get("/api/v1/dashboard"))
        XCTAssertEqual(transport.requests.map { $0.header("Authorization") }, ["Bearer old", "Bearer fresh"])
    }

    func testWrongPasswordIsNotTreatedAsExpiredSession() async {
        let transport = StubTransport { _ in .error(401, code: "password_incorrect") }
        let tokens = FixedTokens("t")
        let api = client(transport)
        await api.setTokenProvider(tokens)
        do {
            let _: EmptyResponse = try await api.send(try .post("/api/v1/auth/native/change-password", body: ["a": "b"]))
            XCTFail("ожидалась ошибка")
        } catch {
            XCTAssertEqual((error as? APIError)?.code, "password_incorrect")
        }
        let renewals = await tokens.renewals
        XCTAssertEqual(renewals, 0)
    }

    // ios-api-client: Язык запросов — язык профиля.
    func testAcceptLanguageDefaultsToRussian() async throws {
        let transport = StubTransport { _ in .success("{}") }
        let api = client(transport)
        let _: EmptyResponse = try await api.send(.get("/api/v1/config", requiresAuth: false))
        XCTAssertEqual(transport.requests.last?.header("Accept-Language"), "ru")
    }

    func testAcceptLanguageFollowsProfileLanguage() async throws {
        let transport = StubTransport { _ in .success("{}") }
        let api = client(transport)
        await api.setLanguage("en")
        let _: EmptyResponse = try await api.send(.get("/api/v1/dashboard"))
        XCTAssertEqual(transport.requests.last?.header("Accept-Language"), "en")
        await api.setLanguage(nil)
        let _: EmptyResponse = try await api.send(.get("/api/v1/dashboard"))
        XCTAssertEqual(transport.requests.last?.header("Accept-Language"), "ru")
        await api.setLanguage("de")
        let _: EmptyResponse = try await api.send(.get("/api/v1/dashboard"))
        XCTAssertEqual(transport.requests.last?.header("Accept-Language"), "ru")
    }

    // ios-api-client: Оболочка и экран спрашивают профиль — один сетевой запрос.
    func testConcurrentIdenticalGetsShareOneRequest() async throws {
        let transport = StubTransport { _ in .success(#"{"id":7,"role":"client"}"#, delay: .milliseconds(200)) }
        let api = client(transport)
        async let first: Profile = api.send(.get("/api/v1/auth/me"))
        async let second: Profile = api.send(.get("/api/v1/auth/me"))
        let (a, b) = try await (first, second)
        XCTAssertEqual(a, b)
        XCTAssertEqual(transport.requests(to: "/api/v1/auth/me").count, 1)
    }

    func testDifferentGetsAndPostsAreNotMerged() async throws {
        let transport = StubTransport { _ in .success("{}", delay: .milliseconds(100)) }
        let api = client(transport)
        async let first: EmptyResponse = api.send(.get("/api/v1/a"))
        async let second: EmptyResponse = api.send(.get("/api/v1/b"))
        async let third: EmptyResponse = api.send(try .post("/api/v1/c", body: ["x": 1]))
        async let fourth: EmptyResponse = api.send(try .post("/api/v1/c", body: ["x": 1]))
        _ = try await (first, second, third, fourth)
        XCTAssertEqual(transport.requests.count, 4)
    }

    func testHeadersOfMutationFromQueue() async throws {
        let transport = StubTransport { _ in .success("{}") }
        let api = client(transport)
        await api.setTokenProvider(FixedTokens("abc"))
        var endpoint = try Endpoint.post("/api/v1/food-tracker/water", body: ["glasses": 1])
        endpoint.idempotencyKey = "6F9619FF-8B86-D011-B42D-00C04FC964FF"
        let _: EmptyResponse = try await api.send(endpoint)
        let request = try XCTUnwrap(transport.requests.last)
        XCTAssertEqual(request.header("Idempotency-Key"), "6F9619FF-8B86-D011-B42D-00C04FC964FF")
        XCTAssertEqual(request.header("Authorization"), "Bearer abc")
        XCTAssertEqual(request.header("X-Client"), "ios/1.0.0/1")
        XCTAssertEqual(request.header("Content-Type"), "application/json")
    }

    func testPublicEndpointCarriesNoToken() async throws {
        let transport = StubTransport { _ in .success("{}") }
        let api = client(transport)
        await api.setTokenProvider(FixedTokens("abc"))
        let _: EmptyResponse = try await api.send(.get("/api/v1/config", requiresAuth: false))
        XCTAssertNil(transport.requests.last?.header("Authorization"))
    }
}

final class BareResponseTests: XCTestCase {
    struct Config: Decodable, Sendable, Equatable {
        struct IOS: Decodable, Sendable, Equatable {
            let minimum: String
            enum CodingKeys: String, CodingKey { case minimum = "min_supported_version" }
        }
        let ios: IOS
    }

    /// `GET /api/v1/config` отвечает без конверта (router/client_config.go).
    func testConfigWithoutEnvelope() async throws {
        let transport = StubTransport { _ in StubResponse(status: 200, body: Data(#"{"ios":{"min_supported_version":"1.2.0"}}"#.utf8)) }
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "x", transport: transport)
        let config: Config = try await api.sendBare(.get("/api/v1/config", requiresAuth: false))
        XCTAssertEqual(config.ios.minimum, "1.2.0")
    }
}
