import API
import DesignSystem
import Session
import SwiftUI

/// Каркас шага входа: заголовок, пояснение, поля и кнопка.
struct StepScaffold<Content: View>: View {
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

/// Письмо со ссылкой на вход. Сервер принимает запрос только с согласиями:
/// для нового адреса по ним создаётся аккаунт, существующему они не
/// перезаписываются. Ответ одинаков для известных и новых адресов.
struct MagicLinkView: View {
    @Environment(AppModel.self) private var model
    let email: String
    @State private var consents = Consents()
    @State private var sent = false
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        StepScaffold(title: "Вход по ссылке",
                     subtitle: "Пришлём на \(email) письмо со ссылкой — она откроет приложение. Ссылка живёт 15 минут.",
                     identifier: "screen.magicLink") {
            if sent {
                Text("Письмо отправлено. Откройте ссылку на этом iPhone.")
                    .dsText(DS.Typography.body)
                    .accessibilityIdentifier("magicLink.sent")
            } else {
                Text("Если аккаунта ещё нет, он будет создан — для этого нужны согласия:")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
                ConsentsForm(consents: $consents)
                ErrorText(text: errorText)
                Button("Прислать ссылку") { Task { await send() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(working || !consents.requiredGiven)
                    .accessibilityIdentifier("magicLink.send")
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

/// Вход по паролю: почта, пароль, «Забыли пароль?», «Создать аккаунт».
struct PasswordSignInView: View {
    @Environment(AppModel.self) private var model
    @State private var email: String
    @State private var password = ""
    @State private var working = false
    @State private var errorText: String?
    @Binding var path: [SignInRoute]

    init(initialEmail: String, path: Binding<[SignInRoute]>) {
        _email = State(initialValue: initialEmail)
        _path = path
    }

    var body: some View {
        StepScaffold(title: "Вход с паролем", subtitle: "Почта и пароль от аккаунта «Взвешено».", identifier: "screen.passwordSignIn") {
            DSField(title: "Электронная почта", text: $email, contentType: .username, keyboard: .emailAddress)
                .accessibilityIdentifier("password.email")
            DSField(title: "Пароль", text: $password, secure: true, contentType: .password)
                .accessibilityIdentifier("password.password")
            ErrorText(text: errorText)
            Button {
                Task { await signIn() }
            } label: {
                if working { ProgressView().tint(DS.Color.primaryFg) } else { Text("Войти") }
            }
            .buttonStyle(DSButtonStyle(.primary))
            .disabled(working || email.isEmpty || password.isEmpty)
            .accessibilityIdentifier("signIn.submit")
            Button("Забыли пароль?") { path.append(.forgotPassword) }
                .buttonStyle(DSButtonStyle(.ghost))
            Button("Создать аккаунт") { path.append(.register) }
                .buttonStyle(DSButtonStyle(.ghost))
                .accessibilityIdentifier("password.register")
        }
    }

    private func signIn() async {
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
}

/// Письмо со ссылкой сброса пароля (`POST /auth/forgot-password`).
struct ForgotPasswordView: View {
    @Environment(AppModel.self) private var model
    @State private var email: String
    @State private var sent = false
    @State private var working = false
    @State private var errorText: String?

    init(initialEmail: String) {
        _email = State(initialValue: initialEmail)
    }

    var body: some View {
        StepScaffold(title: "Сброс пароля", subtitle: "Пришлём ссылку на новый пароль. Она откроет приложение и живёт час.",
                     identifier: "screen.forgotPassword") {
            if sent {
                Text("Если такой адрес есть, письмо уже в пути.")
                    .dsText(DS.Typography.body)
                    .accessibilityIdentifier("forgot.sent")
            } else {
                DSField(title: "Электронная почта", text: $email, contentType: .username, keyboard: .emailAddress)
                ErrorText(text: errorText)
                Button("Прислать ссылку") { Task { await send() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(working || !EmailInput.isPlausible(email))
            }
        }
    }

    private func send() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            let endpoint = try Endpoint.post("/api/v1/auth/forgot-password",
                                             body: ["email": email.trimmingCharacters(in: .whitespaces)], requiresAuth: false)
            let _: EmptyResponse = try await model.api.send(endpoint)
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
            DSField(title: "Электронная почта", text: $email, contentType: .username, keyboard: .emailAddress)
            DSField(title: "Пароль", text: $password, secure: true, contentType: .newPassword)
            PasswordRulesView(password: password)
            ConsentsForm(consents: $consents)
            ErrorText(text: errorText)
            Button("Создать аккаунт") { Task { await register() } }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(working || email.isEmpty || !PasswordPolicy.isValid(password) || !consents.requiredGiven)
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
                    .accessibilityIdentifier("reset.password")
                PasswordRulesView(password: password)
                ErrorText(text: errorText)
                Button("Сохранить") { Task { await submit() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(working || !PasswordPolicy.isValid(password))
                    .accessibilityIdentifier("reset.save")
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

/// Пункты политики пароля: выполненные — галочкой, остальные — кружком.
struct PasswordRulesView: View {
    let password: String

    var body: some View {
        let unmet = Set(PasswordPolicy.unmet(password))
        VStack(alignment: .leading, spacing: DS.Space.s1) {
            ForEach(PasswordRule.allCases, id: \.self) { rule in
                let met = !unmet.contains(rule)
                HStack(spacing: DS.Space.s2) {
                    Image(systemName: met ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(met ? DS.Color.statusSuccessFg : DS.Color.fgSubtle)
                        .accessibilityHidden(true)
                    Text(rule.title)
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(met ? DS.Color.fgMuted : DS.Color.fgDefault)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(rule.title): \(met ? "выполнено" : "не выполнено")")
                .accessibilityIdentifier("password.rule.\(rule.rawValue).\(met ? "met" : "unmet")")
            }
        }
    }
}

/// «Ссылка устарела»: просроченная, использованная или чужая ссылка из письма.
struct LinkExpiredView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        StepScaffold(title: "Ссылка устарела",
                     subtitle: "Ссылка из письма действует 15 минут и только один раз. Запросите новую — придёт следующим письмом.",
                     identifier: "screen.linkExpired") {
            Button("Получить новую") { model.cancelPendingSignIn() }
                .buttonStyle(DSButtonStyle(.primary))
                .accessibilityIdentifier("linkExpired.again")
        }
    }
}

/// Код из письма: 6 цифр одним полем, проверка после шестой цифры,
/// «Отправить повторно» — через 60 секунд.
struct VerifyEmailView: View {
    @Environment(AppModel.self) private var model
    @State private var code = ""
    @State private var working = false
    @State private var errorText: String?
    @State private var countdown = ResendCountdown(sentAt: Date())
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            StepScaffold(title: "Подтвердите почту",
                         subtitle: "Мы отправили код на \(model.user?.email ?? "вашу почту"). Введите 6 цифр из письма.",
                         identifier: "screen.verifyEmail") {
                TextField("Код из письма", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .focused($focused)
                    .dsText(DS.Typography.numL)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, DS.Space.s4)
                    .frame(minHeight: DS.Size.control)
                    .background(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous).fill(DS.Color.bgSurface))
                    .overlay(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous).strokeBorder(DS.Color.lineDefault))
                    .accessibilityIdentifier("verify.code")
                    .onChange(of: code) { _, value in
                        let clean = VerificationCode.sanitize(value)
                        if clean != value { code = clean }
                        if VerificationCode.isComplete(clean) { Task { await verify(clean) } }
                    }
                if working { DSSpinner("Проверяем код") }
                ErrorText(text: errorText)
                TimelineView(.periodic(from: countdown.sentAt, by: 1)) { context in
                    Button(countdown.title(now: context.date)) { Task { await resend() } }
                        .buttonStyle(DSButtonStyle(.secondary))
                        .disabled(working || !countdown.canResend(now: context.date))
                        .accessibilityIdentifier("verify.resend")
                }
                Button("Выйти") { Task { await model.signOut() } }
                    .buttonStyle(DSButtonStyle(.ghost))
            }
        }
        .onAppear { focused = true }
    }

    private func verify(_ value: String) async {
        guard !working else { return }
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.verifyEmail(code: value)
        } catch {
            errorText = model.messages.message(for: error)
            code = ""
        }
    }

    private func resend() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.resendVerification()
            countdown = ResendCountdown(sentAt: Date())
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}

/// «Аккаунт будет удалён {дата}»: вход уже выполнен, удаление ещё можно отменить.
struct PendingDeletionView: View {
    @Environment(AppModel.self) private var model
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            StepScaffold(title: model.pendingDeletion?.title ?? "Аккаунт будет удалён",
                         subtitle: "Вы запросили удаление аккаунта. До этой даты его можно вернуть — со всеми записями.",
                         identifier: "screen.pendingDeletion") {
                ErrorText(text: errorText)
                Button("Отменить удаление") { Task { await cancel() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(working)
                    .accessibilityIdentifier("deletion.cancel")
                Button("Выйти") { Task { await model.signOut() } }
                    .buttonStyle(DSButtonStyle(.ghost))
                    .disabled(working)
                    .accessibilityIdentifier("deletion.signOut")
            }
        }
    }

    private func cancel() async {
        working = true
        errorText = nil
        defer { working = false }
        do {
            try await model.cancelDeletion()
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}
