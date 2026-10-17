import API
import DesignSystem
import Session
import SwiftUI

/// Каркас шага входа: заголовок, пояснение, поля и кнопка.
private struct StepScaffold<Content: View>: View {
    let title: String
    let subtitle: String
    let identifier: String
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                Text(title)
                    .dsText(DS.Typography.title1)
                    .accessibilityAddTraits(.isHeader)
                Text(subtitle)
                    .dsText(DS.Typography.body)
                    .foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
                content
            }
            .foregroundStyle(DS.Color.fgDefault)
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s6)
        }
        .background(DS.Color.bgCanvas)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(identifier)
    }
}

/// Письмо со ссылкой на вход. Ответ одинаков для известных и новых адресов.
struct MagicLinkView: View {
    @Environment(AppModel.self) private var model
    @State private var email: String
    @State private var consents = Consents()
    @State private var sent = false
    @State private var working = false
    @State private var errorText: String?

    init(initialEmail: String) {
        _email = State(initialValue: initialEmail)
    }

    var body: some View {
        StepScaffold(title: "Вход по ссылке", subtitle: "Пришлём письмо со ссылкой — она откроет приложение. Ссылка живёт 15 минут.",
                     identifier: "screen.magicLink") {
            if sent {
                Text("Письмо отправлено на \(email). Откройте ссылку на этом iPhone.")
                    .dsText(DS.Typography.body)
                    .accessibilityIdentifier("magicLink.sent")
            } else {
                DSField(title: "Почта", text: $email, contentType: .emailAddress, keyboard: .emailAddress)
                Text("Если аккаунта ещё нет, он будет создан — для этого нужны согласия:")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
                ConsentsForm(consents: $consents)
                ErrorText(text: errorText)
                Button("Прислать ссылку") { Task { await send() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(working || email.isEmpty || !consents.requiredGiven)
            }
        }
    }

    private func send() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.auth.requestMagicLink(email: email.trimmingCharacters(in: .whitespaces), consents: consents)
            sent = true
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}

/// Регистрация с паролем: почта, пароль, согласия.
struct RegisterView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var consents = Consents()
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        StepScaffold(title: "Новый аккаунт",
                     subtitle: "Пароль: от 8 символов, заглавная и строчная буквы, цифра и спецсимвол.",
                     identifier: "screen.register") {
            DSField(title: "Почта", text: $email, contentType: .username, keyboard: .emailAddress)
            DSField(title: "Пароль", text: $password, secure: true, contentType: .newPassword)
            ConsentsForm(consents: $consents)
            ErrorText(text: errorText)
            Button("Создать аккаунт") { Task { await register() } }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(working || email.isEmpty || password.count < 8 || !consents.requiredGiven)
        }
    }

    private func register() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.complete(try await model.auth.register(email: email.trimmingCharacters(in: .whitespaces),
                                                                   password: password, consents: consents))
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}

/// `needs_consents`: аккаунт появится только после согласий.
struct ConsentsView: View {
    @Environment(AppModel.self) private var model
    let pending: PendingSignIn
    @State private var consents = Consents()
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        StepScaffold(title: "Согласия", subtitle: "Аккаунт ещё не создан. Чтобы продолжить, примите условия сервиса.",
                     identifier: "screen.consents") {
            ConsentsForm(consents: $consents)
            ErrorText(text: errorText)
            Button("Продолжить") { Task { await submit() } }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(working || !consents.requiredGiven)
                .accessibilityIdentifier("consents.submit")
            Button("Отмена") { model.cancelPendingSignIn() }
                .buttonStyle(DSButtonStyle(.ghost))
        }
    }

    private func submit() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.complete(try await model.auth.giveConsents(consents, pending: pending))
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}

/// `needs_email`: провайдер не отдал почту.
struct EmailEntryView: View {
    @Environment(AppModel.self) private var model
    let pending: PendingSignIn
    @State private var email = ""
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        StepScaffold(title: "Почта", subtitle: "Сервис входа не сообщил адрес почты. Укажите его — на него придут уведомления.",
                     identifier: "screen.email") {
            DSField(title: "Почта", text: $email, contentType: .emailAddress, keyboard: .emailAddress)
            ErrorText(text: errorText)
            Button("Продолжить") { Task { await submit() } }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(working || email.isEmpty)
            Button("Отмена") { model.cancelPendingSignIn() }
                .buttonStyle(DSButtonStyle(.ghost))
        }
    }

    private func submit() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.complete(try await model.auth.provideEmail(email.trimmingCharacters(in: .whitespaces), pending: pending))
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}

/// `needs_link_confirmation`: адрес уже принадлежит аккаунту — подтвердить паролем.
struct LinkConfirmationView: View {
    @Environment(AppModel.self) private var model
    let pending: PendingSignIn
    @State private var password = ""
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        StepScaffold(title: "Этот адрес уже зарегистрирован",
                     subtitle: "Введите пароль аккаунта \(pending.email ?? "") — вход через сервис привяжется к нему.",
                     identifier: "screen.linkConfirmation") {
            DSField(title: "Пароль", text: $password, secure: true, contentType: .password)
            ErrorText(text: errorText)
            Button("Привязать и войти") { Task { await submit() } }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(working || password.isEmpty)
            Button("Отмена") { model.cancelPendingSignIn() }
                .buttonStyle(DSButtonStyle(.ghost))
        }
    }

    private func submit() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.complete(try await model.auth.confirmLink(password: password, pending: pending))
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}

/// Новый пароль по ссылке из письма.
struct ResetPasswordView: View {
    @Environment(AppModel.self) private var model
    let token: String
    @State private var password = ""
    @State private var done = false
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        StepScaffold(title: "Новый пароль",
                     subtitle: "От 8 символов, заглавная и строчная буквы, цифра и спецсимвол.",
                     identifier: "screen.resetPassword") {
            if done {
                Text("Пароль изменён. Войдите с новым паролем.").dsText(DS.Typography.body)
                Button("Ко входу") { model.cancelPendingSignIn() }
                    .buttonStyle(DSButtonStyle(.primary))
            } else {
                DSField(title: "Пароль", text: $password, secure: true, contentType: .newPassword)
                ErrorText(text: errorText)
                Button("Сохранить") { Task { await submit() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(working || password.count < 8)
                Button("Отмена") { model.cancelPendingSignIn() }
                    .buttonStyle(DSButtonStyle(.ghost))
            }
        }
    }

    private func submit() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            let endpoint = try Endpoint.post("/api/v1/auth/reset-password", body: ["token": token, "password": password],
                                             requiresAuth: false)
            let _: EmptyResponse = try await model.api.send(endpoint)
            done = true
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}
