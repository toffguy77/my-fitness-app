import API
import AuthenticationServices
import DesignSystem
import Navigation
import Session
import SwiftUI

/// Экран входа: пароль, ссылка на почту, Sign in with Apple, Яндекс и VK.
struct SignInView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession

    @State private var email = ""
    @State private var password = ""
    @State private var working = false
    @State private var errorText: String?
    @State private var providers: [String] = []
    @State private var appleNonce = AppleNonce.random()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DS.Space.s5) {
                    VStack(alignment: .leading, spacing: DS.Space.s2) {
                        Text("Взвешено")
                            .dsText(DS.Typography.display)
                            .accessibilityAddTraits(.isHeader)
                        Text("Питание и куратор — в одном приложении.")
                            .dsText(DS.Typography.body)
                            .foregroundStyle(DS.Color.fgMuted)
                    }
                    if let message = model.sessionMessage {
                        Text(message)
                            .dsText(DS.Typography.callout)
                            .foregroundStyle(DS.Color.statusInfoFg)
                            .padding(DS.Space.s3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: DS.Radius.s).fill(DS.Color.statusInfoSoft))
                            .accessibilityIdentifier("signIn.sessionEnded")
                    }
                    DSField(title: "Почта", text: $email, contentType: .username, keyboard: .emailAddress)
                        .accessibilityIdentifier("signIn.email")
                    DSField(title: "Пароль", text: $password, secure: true, contentType: .password)
                        .accessibilityIdentifier("signIn.password")
                    ErrorText(text: errorText)
                    Button {
                        Task { await signInWithPassword() }
                    } label: {
                        if working { ProgressView().tint(DS.Color.primaryFg) } else { Text("Войти") }
                    }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(working || email.isEmpty || password.isEmpty)
                    .accessibilityIdentifier("signIn.submit")

                    HStack(spacing: DS.Space.s2) {
                        NavigationLink("Войти по ссылке из письма") { MagicLinkView(initialEmail: email) }
                        Spacer()
                        NavigationLink("Создать аккаунт") { RegisterView() }
                    }
                    .dsText(DS.Typography.callout)
                    .fontWeight(.semibold)
                    .foregroundStyle(DS.Color.primaryDefault)

                    Text("или")
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgSubtle)
                        .frame(maxWidth: .infinity)

                    SignInWithAppleButton(.signIn) { request in
                        appleNonce = AppleNonce.random()
                        request.requestedScopes = [.fullName, .email]
                        // В запрос к Apple — SHA-256 строчным hex; серверу — исходное.
                        request.nonce = appleNonce.hashed
                    } onCompletion: { result in
                        Task { await finishApple(result) }
                    }
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .frame(height: DS.Size.control)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("signIn.apple")

                    ForEach(providers, id: \.self) { provider in
                        Button("Войти через \(Self.providerTitle(provider))") {
                            Task { await signIn(with: provider) }
                        }
                        .buttonStyle(DSButtonStyle(.secondary))
                        .disabled(working)
                    }
                }
                .foregroundStyle(DS.Color.fgDefault)
                .padding(.horizontal, DS.Space.screenX)
                .padding(.vertical, DS.Space.s8)
            }
            .background(DS.Color.bgCanvas)
            .accessibilityIdentifier("screen.signIn")
            .task { await loadProviders() }
        }
    }

    static func providerTitle(_ provider: String) -> String {
        switch provider {
        case "yandex": return "Яндекс ID"
        case "vk": return "VK ID"
        default: return provider
        }
    }

    private func loadProviders() async {
        let known = ["yandex", "vk"]
        providers = ((try? await model.auth.providers()) ?? []).filter(known.contains)
    }

    private func signInWithPassword() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.complete(try await model.auth.login(email: email.trimmingCharacters(in: .whitespaces),
                                                                password: password))
        } catch {
            errorText = model.messages.message(for: error)
        }
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
