import Foundation
import Observation

/// Сессия пользователя: кто вошёл и как обновлять его токен.
///
/// Access-токен живёт 15 минут и хранится только в памяти клиента API.
/// Refresh-токен — в Keychain: по нему приложение после перезапуска
/// восстанавливает сессию без повторного входа.
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable {
        case restoring
        case signedOut
        case signedIn(SessionUser)
    }

    private(set) var state: State = .restoring
    let api: APIClient

    private let keychain: Keychain
    private static let refreshKey = "refresh_token"

    init(api: APIClient = APIClient(), keychain: Keychain = Keychain()) {
        self.api = api
        self.keychain = keychain
    }

    var user: SessionUser? {
        if case let .signedIn(user) = state { return user }
        return nil
    }

    /// При запуске: есть сохранённая сессия — обменять её на токен.
    func restore() async {
        await installRefresher()
        guard keychain.read(Self.refreshKey) != nil else {
            state = .signedOut
            return
        }
        do {
            let result = try await refresh()
            if let result {
                state = .signedIn(result.user)
            } else {
                state = .signedOut
            }
        } catch APIError.unauthorized {
            // Сервер сессию не принял — она отозвана или истекла.
            endSession()
        } catch {
            // Нет сети или сбой сервера: показываем вход, но сохранённую
            // сессию не стираем — она могла бы и подняться.
            state = .signedOut
        }
    }

    func signIn(email: String, password: String) async throws {
        await installRefresher()
        let (result, refreshToken) = try await api.sendIssuingSession(
            .post("/api/v1/auth/login",
                  body: LoginRequest(email: email, password: password, remember_me: true),
                  requiresAuth: false))
        if let refreshToken {
            keychain.write(refreshToken, for: Self.refreshKey)
        }
        await api.setAccessToken(result.token)
        state = .signedIn(result.user)
    }

    func signOut() async {
        if let token = keychain.read(Self.refreshKey) {
            // Отзыв на сервере — по возможности; выход на устройстве — всегда.
            _ = try? await api.send(Endpoint<Empty>.post(
                "/api/v1/auth/logout", body: RefreshRequest(refresh_token: token), requiresAuth: false))
        }
        endSession()
    }

    /// Сессию закрыл сервер (refresh отвергнут) или удалён аккаунт.
    func endSession() {
        keychain.delete(Self.refreshKey)
        Task { await api.setAccessToken(nil) }
        state = .signedOut
    }

    private func installRefresher() async {
        await api.setRefresher { [weak self] in
            guard let self else { return nil }
            do {
                return try await self.refresh()?.token
            } catch APIError.unauthorized {
                await self.endSession()
                return nil
            }
        }
    }

    /// Обменивает refresh-токен из Keychain на новую пару. Сервер ротирует
    /// токен: прежний после этого недействителен, поэтому новый сохраняется
    /// до того, как результат кому-то отдан.
    private func refresh() async throws -> LoginResult? {
        guard let stored = keychain.read(Self.refreshKey) else { return nil }
        let result: LoginResult
        let rotated: String?
        do {
            (result, rotated) = try await api.sendIssuingSession(
                Endpoint<LoginResult>.post("/api/v1/auth/refresh",
                                           body: RefreshRequest(refresh_token: stored),
                                           requiresAuth: false))
        } catch APIError.server(status: 401, _, _) {
            // Refresh-токен отвергнут: отозван, истёк или уже использован.
            throw APIError.unauthorized
        }
        if let rotated {
            keychain.write(rotated, for: Self.refreshKey)
        }
        await api.setAccessToken(result.token)
        return result
    }
}
