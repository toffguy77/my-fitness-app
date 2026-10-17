import API
import Foundation
@testable import Session
import TestSupport
import XCTest

final class NativeAuthTests: XCTestCase {
    private func auth(_ transport: StubTransport) -> NativeAuthAPI {
        NativeAuthAPI(api: APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios/1.0.0/1",
                                     transport: transport),
                      deviceName: "iPhone Анны")
    }

    func testSHA256Vectors() {
        XCTAssertEqual(SHA256.hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        XCTAssertEqual(SHA256.hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(SHA256.hex(String(repeating: "a", count: 1000)),
                       "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3")
        XCTAssertEqual(SHA256.base64URL("abc"), "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0")
    }

    /// Соглашение nonce: в запрос к Apple — SHA-256 строчным hex, серверу — исходное значение.
    func testAppleNonceConvention() async throws {
        let nonce = AppleNonce(raw: "abc")
        XCTAssertEqual(nonce.hashed, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(nonce.hashed, nonce.hashed.lowercased())

        let transport = StubTransport { _ in .success(sessionJSON(access: "a", refresh: "r")) }
        let outcome = try await auth(transport).apple(identityToken: "id", authorizationCode: "code", nonce: nonce,
                                                      givenName: "Анна", familyName: nil)
        guard case .signedIn = outcome else { return XCTFail("ожидался вход") }
        let body = try XCTUnwrap(transport.requests.last?.json)
        XCTAssertEqual(transport.requests.last?.path, "/api/v1/auth/native/apple")
        XCTAssertEqual(body["nonce"] as? String, "abc", "серверу — исходное значение")
        XCTAssertEqual(body["identity_token"] as? String, "id")
        XCTAssertEqual(body["authorization_code"] as? String, "code")
        XCTAssertEqual((body["full_name"] as? [String: String])?["given_name"], "Анна")
        XCTAssertEqual(body["device_name"] as? String, "iPhone Анны")
    }

    func testRandomNoncesDiffer() {
        XCTAssertNotEqual(AppleNonce.random(), AppleNonce.random())
        XCTAssertEqual(AppleNonce.random().hashed.count, 64)
    }

    func testProviderStartAndExchange() async throws {
        let pkce = PKCEPair(verifier: "abc")
        let transport = StubTransport { _ in .success(sessionJSON(access: "a", refresh: "r")) }
        let api = auth(transport)
        let url = try XCTUnwrap(api.providerStartURL(provider: "yandex", pkce: pkce))
        XCTAssertEqual(url.absoluteString,
                       "https://burcev.team/api/v1/auth/oauth/yandex?client=ios&app_challenge=ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0")
        XCTAssertEqual(pkce.challenge.count, 43)

        _ = try await api.exchange(code: "c0de", pkce: pkce)
        let body = try XCTUnwrap(transport.requests.last?.json)
        XCTAssertEqual(transport.requests.last?.path, "/api/v1/auth/native/oauth/exchange")
        XCTAssertEqual(body["code"] as? String, "c0de")
        XCTAssertEqual(body["code_verifier"] as? String, "abc")
    }

    /// Новый человек через провайдера: аккаунта нет, пока нет согласий.
    func testNeedsConsentsThenConsents() async throws {
        let pending = "0b3e4f9e-3f3a-4d6a-9d7e-2f1f0d3c9a11"
        let transport = StubTransport { request in
            if request.path == "/api/v1/auth/native/consents" {
                return .success(sessionJSON(access: "a", refresh: "r").replacingOccurrences(of: "signed_in", with: "registered"))
            }
            return .success(#"{"status":"needs_consents","pending_token":"\#(pending)","provider":"apple"}"#)
        }
        let api = auth(transport)
        let outcome = try await api.apple(identityToken: "i", authorizationCode: "c", nonce: .random(), givenName: nil, familyName: nil)
        guard case let .pending(step) = outcome else { return XCTFail("ожидалось продолжение") }
        XCTAssertEqual(step.step, .needsConsents)
        XCTAssertEqual(step.pendingToken, pending)

        let consents = Consents(termsOfService: true, privacyPolicy: true, dataProcessing: true, marketing: false)
        XCTAssertTrue(consents.requiredGiven)
        let done = try await api.giveConsents(consents, pending: step)
        guard case let .signedIn(session, created) = done else { return XCTFail("ожидался вход") }
        XCTAssertTrue(created)
        XCTAssertEqual(session.user.role, "client")
        let body = try XCTUnwrap(transport.requests.last?.json)
        XCTAssertEqual(body["pending_token"] as? String, pending)
        let sent = try XCTUnwrap(body["consents"] as? [String: Bool])
        XCTAssertEqual(sent, ["terms_of_service": true, "privacy_policy": true, "data_processing": true, "marketing": false])
    }

    func testRequiredConsentsMissing() {
        XCTAssertFalse(Consents(termsOfService: true, privacyPolicy: true).requiredGiven)
    }

    func testLinkConfirmationAndEmailSteps() async throws {
        let transport = StubTransport { request in
            switch request.path {
            case "/api/v1/auth/native/oauth/email":
                return .success(#"{"status":"needs_link_confirmation","pending_token":"p","email":"a@b.c"}"#)
            default:
                return .success(sessionJSON(access: "a", refresh: "r"))
            }
        }
        let api = auth(transport)
        let start = PendingSignIn(step: .needsEmail, pendingToken: "p", provider: "vk", email: nil)
        guard case let .pending(next) = try await api.provideEmail("a@b.c", pending: start) else { return XCTFail("ожидалось продолжение") }
        XCTAssertEqual(next.step, .needsLinkConfirmation)
        XCTAssertEqual(next.email, "a@b.c")
        guard case .signedIn = try await api.confirmLink(password: "pw", pending: next) else { return XCTFail("ожидался вход") }
        XCTAssertEqual(transport.requests.last?.json?["password"] as? String, "pw")
    }

    func testPasswordLoginAndMagicLink() async throws {
        let transport = StubTransport { request in
            request.path.hasSuffix("/request") ? .success("{}") : .success(sessionJSON(access: "a", refresh: "r"))
        }
        let api = auth(transport)
        guard case let .signedIn(session, _) = try await api.login(email: "a@b.c", password: "pw") else { return XCTFail("вход") }
        XCTAssertEqual(session.refreshToken, "r")
        XCTAssertEqual(transport.requests.last?.path, "/api/v1/auth/native/login")
        try await api.requestMagicLink(email: "a@b.c", consents: nil)
        XCTAssertEqual(transport.requests.last?.path, "/api/v1/auth/native/magic-link/request")
        _ = try await api.consumeMagicLink(token: "t")
        XCTAssertEqual(transport.requests.last?.json?["token"] as? String, "t")
    }
}
