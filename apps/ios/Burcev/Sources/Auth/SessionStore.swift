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

    private(set) var state: State = .restoring {
        didSet {
            if case .signedIn = state {
                socket.start()
                if case .signedIn = oldValue {} else { Task { await PushRegistrar.shared.enable() } }
            } else {
                socket.stop()
            }
        }
    }
    /// Живое соединение для чата — пока есть сессия и приложение на экране.
    let socket: ChatSocket
    /// Открыта ссылка сброса пароля из письма.
    var resetToken: String?
    /// Ссылка из письма не сработала — показать почему.
    var linkError: String?
    /// Статья, открытая тапом по уведомлению.
    var openArticleID: String?
    let api: APIClient

    private let keychain: Keychain
    private static let refreshKey = "refresh_token"

    init(api: APIClient = SessionStore.defaultClient(), keychain: Keychain = Keychain()) {
        self.api = api
        self.keychain = keychain
        self.socket = ChatSocket(api: api)
    }

    nonisolated static func defaultClient() -> APIClient {
        #if DEBUG
        if Demo.isActive { return APIClient(transport: DemoTransport()) }
        #endif
        return APIClient()
    }

    var user: SessionUser? {
        if case let .signedIn(user) = state { return user }
        return nil
    }

    /// При запуске: есть сохранённая сессия — обменять её на токен.
    func restore() async {
        if let role = Demo.role {
            let id: Int64 = role == .coordinator ? 2 : 1
            state = .signedIn(SessionUser(id: id, email: "demo@burcev.team",
                                          name: role == .coordinator ? "Мария" : "Анна", role: role))
            return
        }
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
            Endpoint<LoginResult>.post("/api/v1/auth/login",
                  body: LoginRequest(email: email, password: password, remember_me: true),
                  requiresAuth: false))
        if let refreshToken {
            keychain.write(refreshToken, for: Self.refreshKey)
        }
        await api.setAccessToken(result.token)
        state = .signedIn(result.user)
    }

    /// Ссылки из писем (Universal Links): вход и сброс пароля.
    func handle(_ url: URL) async {
        let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first { $0.name == "token" }?.value
        guard let token, !token.isEmpty else { return }
        switch url.path {
        case "/auth/link/consume":
            do {
                try await consumeMagicLink(token: token)
            } catch {
                linkError = "Ссылка устарела или уже использована. Запросите новую на экране входа."
            }
        case "/reset-password":
            resetToken = token
        default:
            break
        }
    }

    func register(email: String, password: String, marketing: Bool) async throws {
        await installRefresher()
        let (result, refreshToken) = try await api.sendIssuingSession(
            Endpoint<LoginResult>.post("/api/v1/auth/register",
                                       body: RegisterRequest(email: email, password: password, consents: Self.consents(marketing)),
                                       requiresAuth: false))
        if let refreshToken {
            keychain.write(refreshToken, for: Self.refreshKey)
        }
        await api.setAccessToken(result.token)
        state = .signedIn(result.user)
    }

    /// Письмо со ссылкой на вход. Сервер отвечает одинаково, есть аккаунт или
    /// нет, — по ответу нельзя узнать, зарегистрирован ли адрес.
    func requestMagicLink(email: String, marketing: Bool) async throws {
        _ = try await api.send(Endpoint<Empty>.post("/api/v1/auth/magic-link/request",
                                                    body: MagicLinkRequest(email: email, consents: Self.consents(marketing)),
                                                    requiresAuth: false))
    }

    /// Ссылка из письма открыла приложение. Сервер выдаёт сессию только
    /// в `Set-Cookie`, без access-токена, — его даёт следующий обмен.
    func consumeMagicLink(token: String) async throws {
        await installRefresher()
        struct Consumed: Decodable, Sendable { let user: SessionUser }
        let (_, refreshToken) = try await api.sendIssuingSession(
            Endpoint<Consumed>.post("/api/v1/auth/magic-link/consume", body: TokenRequest(token: token), requiresAuth: false))
        guard let refreshToken else { throw APIError.unauthorized }
        keychain.write(refreshToken, for: Self.refreshKey)
        guard let result = try await refresh() else { throw APIError.unauthorized }
        state = .signedIn(result.user)
    }

    func forgotPassword(email: String) async throws {
        _ = try await api.send(Endpoint<Empty>.post("/api/v1/auth/forgot-password", body: EmailRequest(email: email), requiresAuth: false))
    }

    func resetPassword(token: String, password: String) async throws {
        _ = try await api.send(Endpoint<Empty>.post("/api/v1/auth/reset-password",
                                                    body: ResetPasswordRequest(token: token, password: password), requiresAuth: false))
    }

    func verifyEmail(code: String) async throws {
        _ = try await api.send(Endpoint<Empty>.post("/api/v1/auth/verify-email", body: CodeRequest(code: code)))
        update { $0.email_verified = true }
    }

    func resendVerification() async throws {
        _ = try await api.send(Endpoint<Empty>.post("/api/v1/auth/resend-verification", body: [String: String]()))
    }

    func completeOnboarding() async throws {
        _ = try await api.send(Endpoint<Empty>.put("/api/v1/users/onboarding/complete", body: [String: String]()))
        update { $0.onboarding_completed = true }
    }

    private func update(_ change: (inout SessionUser) -> Void) {
        guard case var .signedIn(user) = state else { return }
        change(&user)
        state = .signedIn(user)
    }

    private static func consents(_ marketing: Bool) -> Consents {
        Consents(terms_of_service: true, privacy_policy: true, data_processing: true, marketing: marketing)
    }

    /// Смена пароля завершает все остальные сессии, а этой выдаёт новую пару
    /// токенов — единственный ответ сервера, где refresh-токен есть в теле.
    func changePassword(current: String, new: String) async throws {
        struct Tokens: Decodable, Sendable {
            let token: String
            let refresh_token: String?
        }
        let tokens = try await api.send(Endpoint<Tokens>.post(
            "/api/v1/auth/change-password",
            body: ChangePasswordRequest(current_password: current, new_password: new)))
        if let refresh = tokens.refresh_token {
            keychain.write(refresh, for: Self.refreshKey)
        }
        await api.setAccessToken(tokens.token)
    }

    func signOut() async {
        await PushRegistrar.shared.disable(using: api)
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
