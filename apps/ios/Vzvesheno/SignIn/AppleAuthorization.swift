import API
import AuthenticationServices
import Session
import SwiftUI
import UIKit

/// Sign in with Apple с nonce сервера (`apple-sign-in`).
///
/// Nonce выдаёт `POST /auth/native/apple/nonce` и гасит первым входом, поэтому
/// его нужно получить до листа Apple. `SignInWithAppleButton` показывает лист
/// сам по касанию и ждать сеть не умеет, так что лист открывает
/// `ASAuthorizationController` — после того как nonce пришёл. Без сети лист не
/// открывается вовсе: человек не проходит Face ID ради отказа.
struct AppleCredential: Sendable {
    let identityToken: String
    let authorizationCode: String
    let givenName: String?
    let familyName: String?
}

enum AppleSignInFailure: Error, Equatable {
    /// Человек закрыл лист Apple — не ошибка, сообщения нет.
    case canceled
    /// Apple вернула ответ без identity token или кода.
    case missingCredential
    /// Отказ Apple на листе.
    case failed
}

@MainActor
final class AppleAuthorization: NSObject {
    private var continuation: CheckedContinuation<AppleCredential, Error>?

    /// Лист Apple с `SHA-256(nonce)` в запросе; серверу потом — `nonce.raw`.
    static func request(nonce: AppleNonce, scopes: [ASAuthorization.Scope]) async throws -> AppleCredential {
        // Контроллер держит делегата слабо: объект живёт, пока ждём ответа.
        let authorization = AppleAuthorization()
        return try await authorization.perform(nonce: nonce, scopes: scopes)
    }

    private func perform(nonce: AppleNonce, scopes: [ASAuthorization.Scope]) async throws -> AppleCredential {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = scopes
        request.nonce = nonce.hashed
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<AppleCredential, Error>) {
        continuation?.resume(with: result)
        continuation = nil
    }

    /// Текст ошибки начала входа: без сети nonce не получить.
    static func startFailureMessage(_ error: Error, messages: ErrorMessages) -> String {
        if (error as? APIError) == .network {
            return "Нет подключения к интернету. Вход через Apple начинается на нашем сервере — подключитесь и попробуйте ещё раз."
        }
        return messages.message(for: error)
    }
}

extension AppleAuthorization: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(controller: ASAuthorizationController,
                                             didCompleteWithAuthorization authorization: ASAuthorization) {
        // Строки достаются здесь: дальше уходит только Sendable-значение.
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential
        let token = credential?.identityToken.flatMap { String(data: $0, encoding: .utf8) }
        let code = credential?.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let given = credential?.fullName?.givenName
        let family = credential?.fullName?.familyName
        MainActor.assumeIsolated {
            guard let token, let code else { return finish(.failure(AppleSignInFailure.missingCredential)) }
            finish(.success(AppleCredential(identityToken: token, authorizationCode: code,
                                            givenName: given, familyName: family)))
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        MainActor.assumeIsolated {
            finish(.failure(canceled ? AppleSignInFailure.canceled : AppleSignInFailure.failed))
        }
    }
}

extension AppleAuthorization: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let windows = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
            return windows.first(where: \.isKeyWindow) ?? windows.first ?? ASPresentationAnchor()
        }
    }
}

/// Кнопка Apple, которая не открывает лист сама: касание — `action`
/// (сначала nonce сервера, потом `AppleAuthorization`). Вид — системная
/// `SignInWithAppleButton`, как требует HIG.
struct AppleSignInButton: View {
    let label: SignInWithAppleButton.Label
    let title: String
    let action: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: action) {
            // Системная кнопка не должна ловить касание (открыла бы лист сама),
            // но и подпись без области касания оставила бы Button глухой:
            // касание принимает прозрачная подложка поверх.
            SignInWithAppleButton(label, onRequest: { _ in }, onCompletion: { _ in })
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .overlay { Rectangle().fill(Color.clear).contentShape(Rectangle()) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(title))
    }
}
