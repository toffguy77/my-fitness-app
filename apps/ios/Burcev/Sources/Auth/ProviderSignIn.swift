import AuthenticationServices
import CryptoKit
import SwiftUI

/// Вход через Яндекс или VK — как на сайте, но сессия возвращается в
/// приложение одноразовым кодом (см. apps/api/internal/modules/auth/oauth_app.go).
///
/// Секрет создаётся на каждый вход и не покидает телефон до обмена; серверу в
/// начале уходит только его хэш. Код, перехваченный по дороге из браузера,
/// без секрета ничего не даёт.
struct ProviderButtons: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession

    @State private var providers: [String] = []
    @State private var working: String?
    @State private var errorText: String?

    var body: some View {
        if !providers.isEmpty {
            Section {
                ForEach(providers, id: \.self) { provider in
                    Button {
                        Task { await signIn(provider) }
                    } label: {
                        HStack {
                            Spacer()
                            if working == provider { ProgressView() } else { Text("Войти через \(title(provider))") }
                            Spacer()
                        }
                    }
                    .disabled(working != nil)
                }
                if let errorText {
                    Text(errorText).foregroundStyle(.red).font(.footnote)
                }
            }
        }
        Color.clear.frame(height: 0)
            .listRowBackground(Color.clear)
            .task { await loadProviders() }
    }

    private func title(_ provider: String) -> String {
        switch provider {
        case "yandex": return "Яндекс"
        case "vk": return "VK ID"
        default: return provider
        }
    }

    private func loadProviders() async {
        struct Providers: Decodable, Sendable { let providers: [String] }
        let known = ["yandex", "vk"]
        let list = (try? await session.api.send(Endpoint<Providers>(method: .get, path: "/api/v1/auth/providers", requiresAuth: false)))?.providers ?? []
        providers = list.filter(known.contains)
    }

    private func signIn(_ provider: String) async {
        working = provider
        errorText = nil
        defer { working = nil }

        let verifier = Self.randomVerifier()
        var components = URLComponents(url: AppConfig.apiBaseURL.appendingPathComponent("api/v1/auth/oauth/\(provider)"),
                                       resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "app_challenge", value: Self.challenge(for: verifier))]
        do {
            let callback = try await webAuthenticationSession.authenticate(
                using: components.url!, callbackURLScheme: "burcev", preferredBrowserSession: .ephemeral)
            let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
            if let code = items.first(where: { $0.name == "code" })?.value {
                try await session.exchangeProviderCode(code, verifier: verifier)
            } else {
                errorText = message(for: items.first(where: { $0.name == "error" })?.value)
            }
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return
        } catch {
            errorText = error.userMessage
        }
    }

    private func message(for reason: String?) -> String {
        switch reason {
        case "cancelled": return "Вход отменён."
        case "link_required":
            return "Эта почта уже зарегистрирована. Войдите по ссылке из письма — привязать \(working.map(title) ?? "сервис") можно потом на сайте."
        case "email_required":
            return "Сервис не сообщил почту. Войдите по ссылке из письма или зарегистрируйтесь."
        case "unavailable": return "Вход через этот сервис сейчас недоступен."
        default: return "Не получилось войти. Попробуйте ещё раз или войдите по ссылке."
        }
    }

    static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded
    }

    static func challenge(for verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded
    }
}

extension Data {
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
