import API
import Foundation

/// Кто вошёл — из ответа входа (`user`) или `GET /auth/me`.
public struct SessionUser: Codable, Sendable, Equatable {
    public let id: Int64
    public let email: String
    public var name: String?
    public let role: String
    public var emailVerified: Bool?
    public var onboardingCompleted: Bool?

    public init(id: Int64, email: String, name: String? = nil, role: String,
                emailVerified: Bool? = nil, onboardingCompleted: Bool? = nil) {
        self.id = id
        self.email = email
        self.name = name
        self.role = role
        self.emailVerified = emailVerified
        self.onboardingCompleted = onboardingCompleted
    }

    enum CodingKeys: String, CodingKey {
        case id, email, name, role
        case emailVerified = "email_verified"
        case onboardingCompleted = "onboarding_completed"
    }
}

/// Пара токенов приложения и пользователь (`NativeSessionResponse` сервера).
public struct NativeSession: Codable, Sendable, Equatable {
    public let accessToken: String
    public let refreshToken: String
    public var user: SessionUser

    public init(accessToken: String, refreshToken: String, user: SessionUser) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.user = user
    }

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case user
    }
}

/// Вход через провайдера, который надо продолжить.
public struct PendingSignIn: Sendable, Equatable {
    public enum Step: String, Sendable {
        /// Новый человек: аккаунт появится только после согласий.
        case needsConsents = "needs_consents"
        /// Провайдер не отдал почту.
        case needsEmail = "needs_email"
        /// Адрес принадлежит существующему аккаунту — подтвердить паролем.
        case needsLinkConfirmation = "needs_link_confirmation"
    }

    public let step: Step
    public let pendingToken: String
    public let provider: String?
    public let email: String?
}

/// Итог шага входа.
public enum SignInOutcome: Sendable, Equatable {
    case signedIn(NativeSession, created: Bool)
    case pending(PendingSignIn)
}

/// Согласия при регистрации и для нового аккаунта через провайдера.
public struct Consents: Codable, Sendable, Equatable {
    public var termsOfService: Bool
    public var privacyPolicy: Bool
    public var dataProcessing: Bool
    public var marketing: Bool

    public init(termsOfService: Bool = false, privacyPolicy: Bool = false, dataProcessing: Bool = false, marketing: Bool = false) {
        self.termsOfService = termsOfService
        self.privacyPolicy = privacyPolicy
        self.dataProcessing = dataProcessing
        self.marketing = marketing
    }

    /// Обязательные три — условия, политика, обработка данных (включая здоровье).
    public var requiredGiven: Bool { termsOfService && privacyPolicy && dataProcessing }

    enum CodingKeys: String, CodingKey {
        case termsOfService = "terms_of_service"
        case privacyPolicy = "privacy_policy"
        case dataProcessing = "data_processing"
        case marketing
    }
}

/// Ответ любого нативного входа: либо сессия, либо `{status, pending_token}`.
struct NativeSignInResponse: Decodable, Sendable {
    let status: String?
    let accessToken: String?
    let refreshToken: String?
    let user: SessionUser?
    let pendingToken: String?
    let provider: String?
    let email: String?
    let created: Bool?

    enum CodingKeys: String, CodingKey {
        case status, user, provider, email, created
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case pendingToken = "pending_token"
    }

    func outcome() throws -> SignInOutcome {
        if let accessToken, let refreshToken, let user, !accessToken.isEmpty, !refreshToken.isEmpty {
            let created = self.created ?? (status == "registered")
            return .signedIn(NativeSession(accessToken: accessToken, refreshToken: refreshToken, user: user), created: created)
        }
        guard let status, let step = PendingSignIn.Step(rawValue: status), let pendingToken else {
            throw APIError.decoding("ни сессии, ни продолжения входа")
        }
        return .pending(PendingSignIn(step: step, pendingToken: pendingToken, provider: provider, email: email))
    }
}

/// Нативные эндпоинты входа (`/api/v1/auth/native/*`, `ios-native-session`).
public struct NativeAuthAPI: Sendable {
    let api: APIClient
    let deviceName: String

    public init(api: APIClient, deviceName: String) {
        self.api = api
        self.deviceName = deviceName
    }

    public func login(email: String, password: String) async throws -> SignInOutcome {
        try await signIn("/api/v1/auth/native/login",
                         ["email": .string(email), "password": .string(password), "device_name": .string(deviceName)])
    }

    public func register(email: String, password: String, consents: Consents) async throws -> SignInOutcome {
        try await signIn("/api/v1/auth/native/register",
                         ["email": .string(email), "password": .string(password),
                          "consents": .consents(consents), "device_name": .string(deviceName)])
    }

    /// Письмо со ссылкой. Ответ одинаков для известных и новых адресов.
    public func requestMagicLink(email: String, consents: Consents?) async throws {
        var body: [String: Body] = ["email": .string(email)]
        if let consents { body["consents"] = .consents(consents) }
        let _: EmptyResponse = try await api.send(try .post("/api/v1/auth/native/magic-link/request", body: body, requiresAuth: false))
    }

    public func consumeMagicLink(token: String) async throws -> SignInOutcome {
        try await signIn("/api/v1/auth/native/magic-link/consume",
                         ["token": .string(token), "device_name": .string(deviceName)])
    }

    /// Sign in with Apple: `nonce` — исходное значение, не хэш.
    public func apple(identityToken: String, authorizationCode: String, nonce: AppleNonce,
                      givenName: String?, familyName: String?) async throws -> SignInOutcome {
        var body: [String: Body] = [
            "identity_token": .string(identityToken),
            "authorization_code": .string(authorizationCode),
            "nonce": .string(nonce.raw),
            "device_name": .string(deviceName),
        ]
        if givenName != nil || familyName != nil {
            body["full_name"] = .name(given: givenName, family: familyName)
        }
        return try await signIn("/api/v1/auth/native/apple", body)
    }

    /// Адрес начала входа через провайдера в `ASWebAuthenticationSession`.
    public func providerStartURL(provider: String, pkce: PKCEPair) -> URL? {
        var components = URLComponents(url: api.baseURL, resolvingAgainstBaseURL: false)
        components?.path = "/api/v1/auth/oauth/\(provider)"
        components?.queryItems = [
            URLQueryItem(name: "client", value: "ios"),
            URLQueryItem(name: "app_challenge", value: pkce.challenge),
        ]
        return components?.url
    }

    /// Обмен кода из universal link `/auth/native-complete?code=…`.
    public func exchange(code: String, pkce: PKCEPair) async throws -> SignInOutcome {
        try await signIn("/api/v1/auth/native/oauth/exchange",
                         ["code": .string(code), "code_verifier": .string(pkce.verifier), "device_name": .string(deviceName)])
    }

    public func provideEmail(_ email: String, pending: PendingSignIn) async throws -> SignInOutcome {
        try await signIn("/api/v1/auth/native/oauth/email",
                         ["pending_token": .string(pending.pendingToken), "email": .string(email)])
    }

    public func confirmLink(password: String, pending: PendingSignIn) async throws -> SignInOutcome {
        try await signIn("/api/v1/auth/native/oauth/link",
                         ["pending_token": .string(pending.pendingToken), "password": .string(password),
                          "device_name": .string(deviceName)])
    }

    public func giveConsents(_ consents: Consents, pending: PendingSignIn) async throws -> SignInOutcome {
        try await signIn("/api/v1/auth/native/consents",
                         ["pending_token": .string(pending.pendingToken), "consents": .consents(consents),
                          "device_name": .string(deviceName)])
    }

    /// Публичный список провайдеров этого стенда.
    public func providers() async throws -> [String] {
        struct Providers: Decodable, Sendable { let providers: [String] }
        let list: Providers = try await api.send(.get("/api/v1/auth/providers", requiresAuth: false))
        return list.providers
    }

    private func signIn(_ path: String, _ body: [String: Body]) async throws -> SignInOutcome {
        let response: NativeSignInResponse = try await api.send(try .post(path, body: body, requiresAuth: false))
        return try response.outcome()
    }

    /// Тело запроса: строки, согласия и имя от Apple.
    enum Body: Encodable, Sendable {
        case string(String)
        case consents(Consents)
        case name(given: String?, family: String?)

        func encode(to encoder: Encoder) throws {
            switch self {
            case let .string(value):
                var container = encoder.singleValueContainer()
                try container.encode(value)
            case let .consents(value):
                try value.encode(to: encoder)
            case let .name(given, family):
                var container = encoder.container(keyedBy: NameKeys.self)
                try container.encodeIfPresent(given, forKey: .givenName)
                try container.encodeIfPresent(family, forKey: .familyName)
            }
        }

        enum NameKeys: String, CodingKey {
            case givenName = "given_name"
            case familyName = "family_name"
        }
    }
}
