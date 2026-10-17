import API
import Foundation

/// Данные аккаунта на устройстве, кроме Keychain: кэш экранов, очередь
/// изменений, снимок дня, виджеты. Выход вызывает каждый.
public protocol AccountDataEraser: Sendable {
    func eraseAccountData() async
}

/// Отметка «приложение уже запускалось после установки».
///
/// Keychain переживает удаление приложения, а `UserDefaults` — нет: отметки
/// нет — значит, это первый запуск новой установки, и записи Keychain
/// остались от прежней.
public protocol InstallMarker: Sendable {
    func isMarked() -> Bool
    func mark()
}

public final class UserDefaultsInstallMarker: InstallMarker, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key: String

    public init(defaults: UserDefaults = .standard, key: String = "session.installed") {
        self.defaults = defaults
        self.key = key
    }

    public func isMarked() -> Bool { defaults.bool(forKey: key) }
    public func mark() { defaults.set(true, forKey: key) }
}

/// Почему сессии больше нет — для текста на экране входа.
public enum SessionEndReason: Sendable, Equatable {
    /// Сервер закончил сессию: отозвана, истекла, сменён пароль.
    case ended
    /// Человек вышел сам.
    case signedOut
}

/// Сессия на устройстве: токены в Keychain, одно обновление на все ожидающие
/// запросы, выход с очисткой всего, что связано с аккаунтом.
///
/// Два параллельных обновления одним refresh-токеном сервер считает
/// повторным использованием и отзывает все сессии пользователя, поэтому
/// обновление здесь одно на всех.
public actor SessionStore: AccessTokenProvider {
    static let sessionKey = "session"
    static let pendingLogoutKey = "pending_logout"

    private let api: APIClient
    private let secure: SecureStore
    private let installMarker: InstallMarker
    private let erasers: [AccountDataEraser]
    private let deviceToken: @Sendable () async -> String?

    private var session: NativeSession?
    private var refreshing: Task<String, Error>?
    private var listeners: [UUID: AsyncStream<SessionEndReason>.Continuation] = [:]

    public init(api: APIClient, secure: SecureStore, installMarker: InstallMarker,
                erasers: [AccountDataEraser] = [], deviceToken: @escaping @Sendable () async -> String? = { nil }) {
        self.api = api
        self.secure = secure
        self.installMarker = installMarker
        self.erasers = erasers
        self.deviceToken = deviceToken
    }

    /// Подключает себя к клиенту API как источник токенов.
    public func attach() async {
        await api.setTokenProvider(self)
    }

    /// Поднимает сессию при запуске. Первый запуск после установки стирает
    /// записи Keychain прежней установки.
    @discardableResult
    public func restore() -> SessionUser? {
        if !installMarker.isMarked() {
            try? secure.deleteAll()
            installMarker.mark()
            session = nil
            return nil
        }
        guard let data = try? secure.read(Self.sessionKey),
              let stored = try? JSONDecoder().decode(NativeSession.self, from: data) else {
            session = nil
            return nil
        }
        session = stored
        return stored.user
    }

    public var user: SessionUser? { session?.user }

    /// Сессия после входа: в Keychain до того, как кто-то её получит.
    public func adopt(_ newSession: NativeSession) throws {
        try persist(newSession)
        session = newSession
    }

    /// Обновляет пользователя (например, ответом `/auth/me`), не трогая токены.
    public func updateUser(_ user: SessionUser) {
        guard var current = session else { return }
        current.user = user
        try? persist(current)
        session = current
    }

    /// События конца сессии — экран входа показывает причину.
    public func endings() -> AsyncStream<SessionEndReason> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<SessionEndReason>.makeStream()
        listeners[id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeListener(id) }
        }
        return stream
    }

    private func removeListener(_ id: UUID) {
        listeners[id] = nil
    }

    // MARK: AccessTokenProvider

    public func currentAccessToken() async -> String? {
        session?.accessToken
    }

    public func renewAccessToken(rejected: String?) async throws -> String {
        if let current = session?.accessToken, current != rejected {
            // Пока этот запрос ждал, токен уже обновил другой.
            return current
        }
        if let refreshing {
            return try await refreshing.value
        }
        guard let refreshToken = session?.refreshToken else { throw APIError.sessionEnded }
        let task = Task { try await self.performRefresh(refreshToken) }
        refreshing = task
        defer { refreshing = nil }
        return try await task.value
    }

    public func sessionWasEnded() async {
        await end(.ended)
    }

    private func performRefresh(_ refreshToken: String) async throws -> String {
        let endpoint = try Endpoint.post("/api/v1/auth/native/refresh", body: ["refresh_token": refreshToken], requiresAuth: false)
        let raw = try await api.sendRaw(endpoint)
        if raw.status == 401 || raw.status == 400 {
            // Refresh отвергнут: отозван, истёк или уже использован.
            await end(.ended)
            throw APIError.sessionEnded
        }
        let response = try decodeSession(raw)
        guard let current = session else { throw APIError.sessionEnded }
        // Сервер ротирует refresh-токен: прежний недействителен с этой минуты,
        // поэтому новый — в Keychain до того, как access-токен кому-то отдан.
        let renewed = NativeSession(accessToken: response.accessToken, refreshToken: response.refreshToken,
                                    user: current.user)
        try persist(renewed)
        session = renewed
        return renewed.accessToken
    }

    private func decodeSession(_ raw: RawResponse) throws -> NativeSession {
        struct Body: Decodable, Sendable {
            let accessToken: String
            let refreshToken: String
            enum CodingKeys: String, CodingKey {
                case accessToken = "access_token"
                case refreshToken = "refresh_token"
            }
        }
        let body: Body = try decodeEnvelope(raw)
        return NativeSession(accessToken: body.accessToken, refreshToken: body.refreshToken,
                             user: session?.user ?? SessionUser(id: 0, email: "", role: ""))
    }

    private func decodeEnvelope<T: Decodable & Sendable>(_ raw: RawResponse) throws -> T {
        guard (200..<300).contains(raw.status) else {
            throw APIError.server(status: raw.status, code: nil, params: [:])
        }
        do {
            return try JSONDecoder().decode(DataWrapper<T>.self, from: raw.data).data
        } catch {
            throw APIError.decoding("native/refresh")
        }
    }

    // MARK: Выход

    /// Выход: данные аккаунта стираются сразу, вызов `native/logout` —
    /// запись «ожидающий выход» в Keychain, которая уходит, когда есть сеть.
    public func signOut() async {
        if let session {
            let pending = PendingLogout(refreshToken: session.refreshToken, deviceToken: await deviceToken())
            if let data = try? JSONEncoder().encode(pending) {
                try? secure.write(data, for: Self.pendingLogoutKey)
            }
        }
        await end(.signedOut)
        await flushPendingLogout()
    }

    /// Досылает ожидающий выход. Без сети — оставляет до следующего раза.
    public func flushPendingLogout() async {
        guard let data = try? secure.read(Self.pendingLogoutKey),
              let pending = try? JSONDecoder().decode(PendingLogout.self, from: data),
              let endpoint = try? Endpoint.post("/api/v1/auth/native/logout", body: pending, requiresAuth: false) else {
            return
        }
        do {
            let raw = try await api.sendRaw(endpoint)
            // 5xx — повторить позже; любой иной ответ сервер уже дал по существу.
            if raw.status < 500 {
                try? secure.delete(Self.pendingLogoutKey)
            }
        } catch {
            // Нет сети — запись остаётся.
        }
    }

    public var hasPendingLogout: Bool {
        (try? secure.read(Self.pendingLogoutKey)) != nil
    }

    private func end(_ reason: SessionEndReason) async {
        let hadSession = session != nil
        session = nil
        refreshing = nil
        try? secure.delete(Self.sessionKey)
        for eraser in erasers {
            await eraser.eraseAccountData()
        }
        guard hadSession else { return }
        for listener in listeners.values {
            listener.yield(reason)
        }
    }

    private func persist(_ session: NativeSession) throws {
        try secure.write(try JSONEncoder().encode(session), for: Self.sessionKey)
    }
}

private struct DataWrapper<T: Decodable>: Decodable {
    let data: T
}

/// «Ожидающий выход»: только refresh-токен и токен устройства.
struct PendingLogout: Codable, Sendable {
    let refreshToken: String
    let deviceToken: String?

    enum CodingKeys: String, CodingKey {
        case refreshToken = "refresh_token"
        case deviceToken = "device_token"
    }
}
