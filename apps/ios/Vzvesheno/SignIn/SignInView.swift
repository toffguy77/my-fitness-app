import API
import AuthenticationServices
import DesignSystem
import Navigation
import Session
import SwiftUI

/// Экран входа (`ios-auth-flows`, макет SignIn.png): Apple, Яндекс и VK из
/// `GET /auth/providers`, ссылка на почту и вход с паролем.
struct SignInView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession

    @State private var email = ""
    @State private var working = false
    @State private var errorText: String?
    @State private var providers: [String] = []
    @State private var appleNonce = AppleNonce.random()
    @State private var path: [SignInRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            SignInContent(
                providers: providers,
                sessionMessage: model.sessionMessage,
                email: $email,
                errorText: errorText,
                working: working,
                onAppleRequest: { request in
                    appleNonce = AppleNonce.random()
                    request.requestedScopes = [.fullName, .email]
                    // В запрос к Apple — SHA-256 строчным hex; серверу — исходное.
                    request.nonce = appleNonce.hashed
                },
                onAppleCompletion: { result in Task { await finishApple(result) } },
                onProvider: { provider in Task { await signIn(with: provider) } },
                onMagicLink: { path.append(.magicLink) },
                onPassword: { path.append(.password) }
            )
            .task { await loadProviders() }
            .navigationDestination(for: SignInRoute.self) { route in
                switch route {
                case .magicLink: MagicLinkView(email: email)
                case .password: PasswordSignInView(initialEmail: email, path: $path)
                case .register: RegisterView()
                case .forgotPassword: ForgotPasswordView(initialEmail: email)
                }
            }
        }
    }

    static func providerTitle(_ provider: String) -> String {
        switch provider {
        case "yandex": return "Яндекс ID"
        case "vk": return "VK ID"
        case "apple": return "Вход с Apple"
        default: return provider
        }
    }

    private func loadProviders() async {
        let known = ["apple", "yandex", "vk"]
        providers = ((try? await model.auth.providers()) ?? []).filter(known.contains)
    }

    private func finishApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case let .success(authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8),
                  let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) else {
                errorText = "Apple не передала данные для входа. Попробуйте ещё раз."
                return
            }
            working = true
            defer { working = false }
            do {
                let outcome = try await model.auth.apple(identityToken: token, authorizationCode: code, nonce: appleNonce,
                                                         givenName: credential.fullName?.givenName,
                                                         familyName: credential.fullName?.familyName)
                try await model.complete(outcome)
            } catch {
                errorText = model.messages.message(for: error)
            }
        case let .failure(error):
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            errorText = "Не получилось войти через Apple. Попробуйте ещё раз."
        }
    }

    /// Яндекс и VK — в ASWebAuthenticationSession с возвратом на https нашего
    /// домена: его система отдаёт только приложению с подтверждённым доменом.
    private func signIn(with provider: String) async {
        guard let url = model.providerStartURL(provider), let host = model.environment.apiBaseURL.host else { return }
        working = true
        errorText = nil
        defer { working = false }
        do {
            let callback = try await webAuthenticationSession.authenticate(
                using: url,
                callback: .https(host: host, path: "/auth/native-complete"),
                preferredBrowserSession: .ephemeral,
                additionalHeaderFields: [:]
            )
            guard case let .auth(.providerComplete(code, reason)) = Router.parse(callback) else {
                errorText = AppModel.providerFailureMessage(nil)
                return
            }
            guard let code else {
                errorText = AppModel.providerFailureMessage(reason)
                return
            }
            try await model.finishProviderSignIn(code: code)
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}

enum SignInRoute: Hashable {
    case magicLink, password, register, forgotPassword
}

/// Вид экрана входа без модели — его же снимает снапшот-тест.
struct SignInContent: View {
    let providers: [String]
    let sessionMessage: String?
    @Binding var email: String
    let errorText: String?
    let working: Bool
    var onAppleRequest: (ASAuthorizationAppleIDRequest) -> Void = { _ in }
    var onAppleCompletion: (Result<ASAuthorization, Error>) -> Void = { _ in }
    var onProvider: (String) -> Void = { _ in }
    var onMagicLink: () -> Void = {}
    var onPassword: () -> Void = {}
    @Environment(\.colorScheme) private var colorScheme

    private var webProviders: [String] { providers.filter { $0 != "apple" } }

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                // Отступы — как на макете SignIn.png: шаг 14 pt, знак 88 pt.
                VStack(spacing: 14) {
                    BrandMark()
                        .frame(width: 88, height: 88)
                    VStack(spacing: DS.Space.s1) {
                        Text(verbatim: "Взвешено")
                            .dsText(DS.Typography.display)
                            .foregroundStyle(DS.Color.fgDefault)
                            .accessibilityAddTraits(.isHeader)
                        Text("Питание и вес вместе с куратором")
                            .dsText(DS.Typography.callout)
                            .foregroundStyle(DS.Color.fgMuted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.bottom, 18)

                    if let sessionMessage {
                        Text(sessionMessage)
                            .dsText(DS.Typography.callout)
                            .foregroundStyle(DS.Color.statusInfoFg)
                            .padding(DS.Space.s3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: DS.Radius.s).fill(DS.Color.statusInfoSoft))
                            .accessibilityIdentifier("signIn.sessionEnded")
                    }

                    VStack(spacing: DS.Space.s3) {
                        if providers.contains("apple") {
                            SignInWithAppleButton(.signIn, onRequest: onAppleRequest, onCompletion: onAppleCompletion)
                                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                                .frame(height: DS.Size.control)
                                .clipShape(Capsule())
                                .disabled(working)
                                .accessibilityIdentifier("signIn.apple")
                        }
                        if !webProviders.isEmpty {
                            HStack(spacing: DS.Space.s3) {
                                ForEach(webProviders, id: \.self) { provider in
                                    Button(SignInView.providerTitle(provider)) { onProvider(provider) }
                                        .buttonStyle(DSButtonStyle(.secondary))
                                        .disabled(working)
                                        .accessibilityIdentifier("signIn.provider.\(provider)")
                                }
                            }
                        }
                    }

                    HStack(spacing: 10) {
                        Rectangle().fill(DS.Color.lineDefault).frame(height: 1).accessibilityHidden(true)
                        Text("или по почте")
                            .dsText(DS.Typography.caption)
                            .foregroundStyle(DS.Color.fgMuted)
                            .fixedSize()
                        Rectangle().fill(DS.Color.lineDefault).frame(height: 1).accessibilityHidden(true)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        DSField(title: "Электронная почта", text: $email, placeholder: "name@example.ru", contentType: .username,
                                keyboard: .emailAddress)
                            .accessibilityIdentifier("signIn.email")
                        ErrorText(text: errorText)
                        Button("Получить ссылку для входа", action: onMagicLink)
                            .buttonStyle(DSButtonStyle(.primary))
                            .disabled(working || !EmailInput.isPlausible(email))
                            .accessibilityIdentifier("signIn.magicLink")
                        Button(action: onPassword) {
                            Text("Войти с паролем")
                                .dsText(DS.Typography.headline)
                                .foregroundStyle(DS.Color.primaryDefault)
                                .frame(maxWidth: .infinity, minHeight: DS.Size.touch)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("signIn.password")
                    }

                    Spacer(minLength: DS.Space.s8)
                    Text("Ссылка придёт письмом и откроет приложение.")
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, DS.Space.s6)
                .padding(.top, 42)
                .padding(.bottom, 34)
                .frame(minHeight: proxy.size.height, alignment: .top)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(DS.Color.bgCanvas)
        .accessibilityIdentifier("screen.signIn")
    }
}

/// Знак «Взвешено» — значок приложения без подложки: дуга шкалы, стрелка и
/// точка (сетка значка 1024, как на макете SignIn.png).
struct BrandMark: View {
    var body: some View {
        GeometryReader { proxy in
            let unit = min(proxy.size.width, proxy.size.height) / 1024
            let center = CGPoint(x: 512 * unit, y: 668 * unit)
            let radius = 318 * unit
            ZStack {
                ArcPath(center: center, radius: radius, startDegrees: 180, endDegrees: 360)
                    .stroke(DS.Color.track, style: StrokeStyle(lineWidth: 82 * unit, lineCap: .round))
                ArcPath(center: center, radius: radius, startDegrees: 180, endDegrees: 270)
                    .stroke(DS.Color.primaryDefault, style: StrokeStyle(lineWidth: 82 * unit, lineCap: .round))
                RoundedRectangle(cornerRadius: 17 * unit)
                    .fill(DS.Color.fgDefault)
                    .frame(width: 34 * unit, height: 240 * unit)
                    .position(x: 512 * unit, y: 548 * unit)
                Circle().fill(DS.Color.fgDefault)
                    .frame(width: 100 * unit, height: 100 * unit)
                    .position(center)
                Circle().fill(DS.Color.primaryDefault)
                    .frame(width: 40 * unit, height: 40 * unit)
                    .position(x: 512 * unit, y: 236 * unit)
            }
        }
        .accessibilityHidden(true)
    }
}

private struct ArcPath: Shape {
    let center: CGPoint
    let radius: CGFloat
    let startDegrees: Double
    let endDegrees: Double

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addArc(center: center, radius: radius, startAngle: .degrees(startDegrees), endAngle: .degrees(endDegrees), clockwise: false)
        return path
    }
}

enum EmailInput {
    /// Похоже на адрес: что-то@что-то.что-то. Точную проверку делает сервер.
    static func isPlausible(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard let atSign = trimmed.firstIndex(of: "@") else { return false }
        let domain = trimmed[trimmed.index(after: atSign)...]
        return atSign > trimmed.startIndex && domain.contains(".") && !domain.hasSuffix(".")
    }
}
