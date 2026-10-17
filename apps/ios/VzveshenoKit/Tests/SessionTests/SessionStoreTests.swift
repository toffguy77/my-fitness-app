import API
import Foundation
@testable import Session
import TestSupport
import XCTest

final class MemoryInstallMarker: InstallMarker, @unchecked Sendable {
    private let lock = NSLock()
    private var marked: Bool
    init(marked: Bool = true) { self.marked = marked }
    func isMarked() -> Bool { lock.withLock { marked } }
    func mark() { lock.withLock { marked = true } }
}

actor RecordingEraser: AccountDataEraser {
    private(set) var calls = 0
    func eraseAccountData() async { calls += 1 }
}

private let userJSON = #"{"id":7,"email":"anna@example.com","role":"client","email_verified":true,"#
    + #""onboarding_completed":true}"#

func sessionJSON(access: String, refresh: String) -> String {
    #"{"status":"signed_in","access_token":"\#(access)","refresh_token":"\#(refresh)","#
        + #""expires_in":900,"refresh_expires_in":2592000,"user":\#(userJSON)}"#
}

final class SessionStoreTests: XCTestCase {
    private let base = URL(string: "https://new.burcev.team")!

    private func make(_ transport: StubTransport, secure: InMemorySecureStore = InMemorySecureStore(),
                      marker: MemoryInstallMarker = MemoryInstallMarker(),
                      erasers: [AccountDataEraser] = [],
                      deviceToken: String? = nil) async -> (APIClient, SessionStore) {
        let api = APIClient(baseURL: base, clientHeader: "ios/1.0.0/1", transport: transport)
        let store = SessionStore(api: api, secure: secure, installMarker: marker, erasers: erasers,
                                 deviceToken: { deviceToken })
        await store.attach()
        return (api, store)
    }

    private let anna = SessionUser(id: 7, email: "anna@example.com", role: "client", emailVerified: true, onboardingCompleted: true)

    // ios-api-client / ios-session-storage: три запроса — один refresh.
    func testThreeExpiredRequestsShareOneRefresh() async throws {
        let transport = StubTransport { request in
            if request.path == "/api/v1/auth/native/refresh" {
                return .success(sessionJSON(access: "new", refresh: "r2"), delay: .milliseconds(150))
            }
            return request.header("Authorization") == "Bearer new" ? .success("{}") : .error(401, code: "token_expired")
        }
        let secure = InMemorySecureStore()
        let (api, store) = await make(transport, secure: secure)
        try await store.adopt(NativeSession(accessToken: "old", refreshToken: "r1", user: anna))

        async let a: EmptyResponse = api.send(.get("/api/v1/dashboard"))
        async let b: EmptyResponse = api.send(.get("/api/v1/food-tracker/entries"))
        async let c: EmptyResponse = api.send(.get("/api/v1/notifications"))
        _ = try await (a, b, c)

        let refreshes = transport.requests(to: "/api/v1/auth/native/refresh")
        XCTAssertEqual(refreshes.count, 1, "один native/refresh на все три")
        XCTAssertEqual(refreshes.first?.json?["refresh_token"] as? String, "r1")
        for path in ["/api/v1/dashboard", "/api/v1/food-tracker/entries", "/api/v1/notifications"] {
            XCTAssertEqual(transport.requests(to: path).last?.header("Authorization"), "Bearer new", path)
        }
        // Ротированный refresh-токен — в Keychain.
        let stored = try JSONDecoder().decode(NativeSession.self, from: XCTUnwrap(secure.read(SessionStore.sessionKey)))
        XCTAssertEqual(stored.refreshToken, "r2")
        XCTAssertEqual(stored.accessToken, "new")
    }

    // Сценарий «Сессия отозвана»: обновление отвечает 401 session_ended.
    func testRevokedRefreshEndsSession() async throws {
        let transport = StubTransport { request in
            request.path == "/api/v1/auth/native/refresh" ? .error(401, code: "session_ended") : .error(401, code: "token_expired")
        }
        let secure = InMemorySecureStore()
        let eraser = RecordingEraser()
        let (api, store) = await make(transport, secure: secure, erasers: [eraser])
        try await store.adopt(NativeSession(accessToken: "old", refreshToken: "r1", user: anna))
        let endings = await store.endings()

        do {
            let _: EmptyResponse = try await api.send(.get("/api/v1/dashboard"))
            XCTFail("ожидалась ошибка")
        } catch {
            XCTAssertEqual(error as? APIError, .sessionEnded)
        }
        XCTAssertNil(try secure.read(SessionStore.sessionKey), "сессия удалена из Keychain")
        let user = await store.user
        XCTAssertNil(user)
        var iterator = endings.makeAsyncIterator()
        let reason = await iterator.next()
        XCTAssertEqual(reason, .ended)
        let erased = await eraser.calls
        XCTAssertEqual(erased, 1)
        XCTAssertEqual(ErrorMessages { $0 == "error.session_ended_sign_in" ? "Сессия завершена, войдите снова" : nil }
            .message(for: APIError.sessionEnded), "Сессия завершена, войдите снова")
    }

    func testRefreshWithoutNetworkKeepsSession() async throws {
        let transport = StubTransport { request in
            request.path == "/api/v1/auth/native/refresh" ? .offline : .error(401, code: "token_expired")
        }
        let secure = InMemorySecureStore()
        let (api, store) = await make(transport, secure: secure)
        try await store.adopt(NativeSession(accessToken: "old", refreshToken: "r1", user: anna))
        do {
            let _: EmptyResponse = try await api.send(.get("/api/v1/dashboard"))
            XCTFail("ожидалась ошибка")
        } catch {
            XCTAssertEqual(error as? APIError, .network)
        }
        XCTAssertNotNil(try secure.read(SessionStore.sessionKey), "без сети сессия не теряется")
    }

    // ios-session-storage: Перезапуск через неделю — сессия из Keychain.
    func testSessionSurvivesRestart() async throws {
        let secure = InMemorySecureStore()
        let marker = MemoryInstallMarker()
        let transport = StubTransport { _ in .success("{}") }
        let (_, first) = await make(transport, secure: secure, marker: marker)
        try await first.adopt(NativeSession(accessToken: "a", refreshToken: "r", user: anna))

        let (_, relaunched) = await make(transport, secure: secure, marker: marker)
        let restored = await relaunched.restore()
        XCTAssertEqual(restored, anna)
        let token = await relaunched.currentAccessToken()
        XCTAssertEqual(token, "a")
        XCTAssertTrue(transport.requests.isEmpty, "без экрана входа и без сети")
    }

    // ios-session-storage: Переустановка — записи прежней установки удалены.
    func testFirstLaunchAfterReinstallDropsKeychain() async throws {
        let secure = InMemorySecureStore()
        try secure.write(try JSONEncoder().encode(NativeSession(accessToken: "a", refreshToken: "r", user: anna)),
                         for: SessionStore.sessionKey)
        let marker = MemoryInstallMarker(marked: false)
        let (_, store) = await make(StubTransport { _ in .success("{}") }, secure: secure, marker: marker)
        let restored = await store.restore()
        XCTAssertNil(restored, "показан экран входа")
        XCTAssertTrue(secure.keys.isEmpty)
        XCTAssertTrue(marker.isMarked())
    }

    // ios-session-storage: Выход без сети.
    func testSignOutOffline() async throws {
        let transport = StubTransport { _ in .offline }
        let secure = InMemorySecureStore()
        let eraser = RecordingEraser()
        let (_, store) = await make(transport, secure: secure, erasers: [eraser], deviceToken: "apns-1")
        try await store.adopt(NativeSession(accessToken: "a", refreshToken: "r1", user: anna))

        await store.signOut()

        XCTAssertNil(try secure.read(SessionStore.sessionKey), "экран входа сразу")
        let erased = await eraser.calls
        XCTAssertEqual(erased, 1, "кэш, очередь, снимок и виджеты очищены")
        let pending = await store.hasPendingLogout
        XCTAssertTrue(pending, "выход ждёт сети")
        let pendingRecord = try XCTUnwrap(secure.read(SessionStore.pendingLogoutKey))
        let record = try XCTUnwrap(JSONSerialization.jsonObject(with: pendingRecord) as? [String: String])
        XCTAssertEqual(Set(record.keys), ["refresh_token", "device_token"], "только refresh-токен и токен устройства")

        // Сеть появилась.
        transport.setHandler { _ in StubResponse(status: 204) }
        await store.flushPendingLogout()
        let logout = try XCTUnwrap(transport.requests(to: "/api/v1/auth/native/logout").last)
        XCTAssertEqual(logout.json?["refresh_token"] as? String, "r1")
        XCTAssertEqual(logout.json?["device_token"] as? String, "apns-1")
        let stillPending = await store.hasPendingLogout
        XCTAssertFalse(stillPending)
    }

    func testSignOutOnlineSendsLogoutImmediately() async throws {
        let transport = StubTransport { _ in StubResponse(status: 204) }
        let (_, store) = await make(transport)
        try await store.adopt(NativeSession(accessToken: "a", refreshToken: "r1", user: anna))
        await store.signOut()
        XCTAssertEqual(transport.requests(to: "/api/v1/auth/native/logout").count, 1)
        let pending = await store.hasPendingLogout
        XCTAssertFalse(pending)
    }

    /// Сессия другого пользователя не заменяется без подтверждения — даже до restore().
    func testAdoptRefusesSilentAccountSwitch() async throws {
        let secure = InMemorySecureStore()
        let marker = MemoryInstallMarker()
        let (_, first) = await make(StubTransport { _ in .success("{}") }, secure: secure, marker: marker)
        try await first.adopt(NativeSession(accessToken: "a", refreshToken: "r", user: anna))

        // Холодный запуск: restore() ещё не вызывался.
        let (_, coldStart) = await make(StubTransport { _ in .success("{}") }, secure: secure, marker: marker)
        let stored = await coldStart.hasStoredSession()
        XCTAssertTrue(stored)
        let attacker = SessionUser(id: 666, email: "x@example.com", role: "client")
        do {
            try await coldStart.adopt(NativeSession(accessToken: "b", refreshToken: "r2", user: attacker))
            XCTFail("сессия заменена молча")
        } catch {
            XCTAssertEqual(error as? AccountSwitchNotConfirmed, AccountSwitchNotConfirmed())
        }
        let kept = try JSONDecoder().decode(NativeSession.self, from: XCTUnwrap(secure.read(SessionStore.sessionKey)))
        XCTAssertEqual(kept.user.id, 7)

        // Тот же человек вошёл заново — можно; подтверждённая смена — тоже.
        try await coldStart.adopt(NativeSession(accessToken: "c", refreshToken: "r3", user: anna))
        try await coldStart.adopt(NativeSession(accessToken: "d", refreshToken: "r4", user: attacker), replacingAccount: true)
        let user = await coldStart.user
        XCTAssertEqual(user?.id, 666)
    }

    func testNoStoredSessionAfterReinstall() async throws {
        let secure = InMemorySecureStore()
        try secure.write(try JSONEncoder().encode(NativeSession(accessToken: "a", refreshToken: "r", user: anna)),
                         for: SessionStore.sessionKey)
        let (_, store) = await make(StubTransport { _ in .success("{}") }, secure: secure, marker: MemoryInstallMarker(marked: false))
        let stored = await store.hasStoredSession()
        XCTAssertFalse(stored)
    }

    // ios-session-storage: атрибуты записи.
    func testKeychainPolicyAttributes() {
        let policy = KeychainPolicy(service: "team.burcev.app.dev.session", accessGroup: "3GWRDGA8B7.team.burcev.app.dev.shared")
        let attributes = policy.attributes(for: SessionStore.sessionKey)
        XCTAssertEqual(attributes.accessibility, .afterFirstUnlockThisDeviceOnly)
        XCTAssertEqual(attributes.accessGroup, "3GWRDGA8B7.team.burcev.app.dev.shared")
        XCTAssertFalse(attributes.synchronizable)
    }

    /// Токены — только в SecureStore: ни в UserDefaults, ни в файлах.
    func testTokensAreNotWrittenToUserDefaults() async throws {
        let suite = "session-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let marker = UserDefaultsInstallMarker(defaults: defaults)
        marker.mark()
        let api = APIClient(baseURL: base, clientHeader: "x", transport: StubTransport { _ in .success("{}") })
        let store = SessionStore(api: api, secure: InMemorySecureStore(), installMarker: marker)
        try await store.adopt(NativeSession(accessToken: "secret-access", refreshToken: "secret-refresh", user: anna))
        let dump = "\(defaults.dictionaryRepresentation())"
        XCTAssertFalse(dump.contains("secret-access"))
        XCTAssertFalse(dump.contains("secret-refresh"))
        defaults.removePersistentDomain(forName: suite)
    }
}
