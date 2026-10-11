import SwiftUI

/// Вход и регистрация — те же пути, что на сайте: по ссылке из письма (по
/// умолчанию, пароль не нужен), по паролю, регистрация с паролем.
struct LoginView: View {
    @Environment(SessionStore.self) private var session

    enum Mode: String, CaseIterable, Identifiable {
        case link = "По ссылке", password = "С паролем", register = "Регистрация"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .link
    @State private var email = ""
    @State private var password = ""
    @State private var agreed = false
    @State private var marketing = false
    @State private var isSubmitting = false
    @State private var errorText: String?
    @State private var linkSentTo: String?
    @State private var showForgot = false
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("BURCEV").font(.largeTitle.weight(.bold))
                        Text("Питание и работа с куратором").foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                    .listRowBackground(Color.clear)
                }

                Section {
                    Picker("Способ", selection: $mode) {
                        ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                if let linkSentTo, mode == .link {
                    Section {
                        Label("Письмо отправлено на \(linkSentTo)", systemImage: "envelope.badge")
                            .font(.headline)
                        Text("Откройте ссылку из письма на этом iPhone — приложение войдёт само. Ссылка действует 15 минут.")
                            .foregroundStyle(.secondary)
                        Button("Отправить ещё раз") { submit() }
                    }
                } else {
                    Section {
                        TextField("Электронная почта", text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focused, equals: .email)
                            .submitLabel(mode == .link ? .send : .next)
                            .onSubmit { if mode == .link { submit() } else { focused = .password } }
                        if mode != .link {
                            SecureField("Пароль", text: $password)
                                .textContentType(mode == .register ? .newPassword : .password)
                                .focused($focused, equals: .password)
                                .submitLabel(.go)
                                .onSubmit(submit)
                        }
                    } footer: {
                        if mode == .register {
                            Text("Не короче 8 символов: заглавная и строчная буква, цифра и знак.")
                        } else if mode == .password {
                            Button("Забыли пароль?") { showForgot = true }.font(.footnote)
                        }
                    }

                    if mode != .password {
                        Section {
                            Toggle(isOn: $agreed) {
                                Text("Принимаю [условия](https://burcev.team/legal/terms) и [политику конфиденциальности](https://burcev.team/legal/privacy), согласен на обработку данных, включая сведения о здоровье")
                                    .font(.footnote)
                            }
                            Toggle(isOn: $marketing) {
                                Text("Получать новости и советы на почту").font(.footnote)
                            }
                        }
                    }
                }

                if let errorText {
                    Section {
                        Text(errorText).foregroundStyle(.red).accessibilityIdentifier("login.error")
                    }
                }

                if linkSentTo == nil || mode != .link {
                    Section {
                        Button(action: submit) {
                            HStack {
                                Spacer()
                                if isSubmitting { ProgressView() } else { Text(buttonTitle).fontWeight(.semibold) }
                                Spacer()
                            }
                        }
                        .disabled(!canSubmit)
                        .accessibilityIdentifier("login.submit")
                    }
                }
            }
            .navigationTitle(mode == .register ? "Регистрация" : "Вход")
            .navigationBarTitleDisplayMode(.inline)
            .onChange(of: mode) { _, _ in errorText = nil }
            .sheet(isPresented: $showForgot) { ForgotPasswordView(email: email) }
        }
    }

    private var buttonTitle: String {
        switch mode {
        case .link: return "Получить ссылку для входа"
        case .password: return "Войти"
        case .register: return "Зарегистрироваться"
        }
    }

    private var canSubmit: Bool {
        guard !isSubmitting, email.contains("@") else { return false }
        switch mode {
        case .link: return agreed
        case .password: return !password.isEmpty
        case .register: return agreed && password.count >= 8
        }
    }

    private func submit() {
        guard canSubmit || (mode == .link && linkSentTo != nil) else { return }
        let address = email.trimmingCharacters(in: .whitespaces)
        isSubmitting = true
        errorText = nil
        Task {
            defer { isSubmitting = false }
            do {
                switch mode {
                case .link:
                    try await session.requestMagicLink(email: address, marketing: marketing)
                    linkSentTo = address
                case .password:
                    try await session.signIn(email: address, password: password)
                case .register:
                    try await session.register(email: address, password: password, marketing: marketing)
                }
            } catch APIError.server(status: 401, _, _), APIError.unauthorized {
                errorText = "Неверная почта или пароль. Если вы входили по ссылке из письма, пароля у аккаунта нет — выберите «По ссылке»."
            } catch APIError.server(status: 409, _, _) {
                errorText = "Этот адрес уже зарегистрирован. Войдите по ссылке или с паролем."
            } catch APIError.server(status: 429, _, _) {
                errorText = "Слишком много попыток. Подождите несколько минут."
            } catch APIError.server(status: 503, _, _) where mode == .link {
                errorText = "Отправка писем сейчас недоступна. Войдите с паролем."
            } catch {
                errorText = error.userMessage
            }
        }
    }
}

struct ForgotPasswordView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State var email: String
    @State private var sent = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                if sent {
                    Text("Если такой аккаунт есть, письмо со ссылкой уже в пути. Откройте её на этом iPhone — приложение предложит новый пароль.")
                } else {
                    Section {
                        TextField("Электронная почта", text: $email)
                            .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    } footer: {
                        Text("Пришлём ссылку, по которой можно задать новый пароль. Она действует час.")
                    }
                    Button("Отправить ссылку") {
                        Task {
                            do {
                                try await session.forgotPassword(email: email.trimmingCharacters(in: .whitespaces))
                                sent = true
                            } catch {
                                errorText = error.userMessage
                            }
                        }
                    }
                    .disabled(!email.contains("@"))
                }
                if let errorText { Text(errorText).foregroundStyle(.red) }
            }
            .navigationTitle("Восстановление")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { dismiss() } } }
        }
    }
}

/// Открыта ссылка «сбросить пароль» из письма.
struct ResetPasswordView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let token: String
    @State private var password = ""
    @State private var done = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                if done {
                    Text("Пароль изменён. Войдите с новым паролем.")
                    Button("Ко входу") { dismiss() }
                } else {
                    Section {
                        SecureField("Новый пароль", text: $password).textContentType(.newPassword)
                    } footer: {
                        Text("Не короче 8 символов: заглавная и строчная буква, цифра и знак.")
                    }
                    Button("Сохранить пароль") {
                        Task {
                            do {
                                try await session.resetPassword(token: token, password: password)
                                done = true
                            } catch APIError.server(status: 400, _, _) {
                                errorText = "Ссылка устарела или уже использована. Запросите новую."
                            } catch {
                                errorText = error.userMessage
                            }
                        }
                    }
                    .disabled(password.count < 8)
                }
                if let errorText { Text(errorText).foregroundStyle(.red) }
            }
            .navigationTitle("Новый пароль")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { dismiss() } } }
        }
    }
}

/// После регистрации с паролем: почту подтверждает код из письма.
struct VerifyEmailView: View {
    @Environment(SessionStore.self) private var session
    @State private var code = ""
    @State private var message: String?
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Код из письма", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .font(.title2.monospacedDigit())
                } footer: {
                    Text("Мы отправили 6 цифр на \(session.user?.email ?? "вашу почту"). Код действует 10 минут.")
                }
                Button("Подтвердить") {
                    Task {
                        do {
                            try await session.verifyEmail(code: code)
                        } catch APIError.server(status: 429, _, _) {
                            errorText = "Слишком много попыток. Запросите новый код."
                        } catch {
                            errorText = "Код неверный или устарел."
                        }
                    }
                }
                .disabled(code.count < 6)
                Button("Прислать код ещё раз") {
                    Task {
                        do {
                            try await session.resendVerification()
                            message = "Новый код отправлен."
                            errorText = nil
                        } catch {
                            errorText = error.userMessage
                        }
                    }
                }
                if let message { Text(message).foregroundStyle(.green) }
                if let errorText { Text(errorText).foregroundStyle(.red) }
                Button("Выйти", role: .destructive) { Task { await session.signOut() } }
            }
            .navigationTitle("Подтвердите почту")
        }
    }
}

/// Первая настройка после регистрации: тело и цели — по ним считается норма.
struct OnboardingView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        NavigationStack {
            BodySettingsView()
                .safeAreaInset(edge: .bottom) {
                    HStack {
                        Button("Пропустить") { finish() }
                        Spacer()
                        Button("Готово") { finish() }.buttonStyle(.borderedProminent)
                    }
                    .padding()
                    .background(.bar)
                }
                .navigationTitle("Расскажите о себе")
        }
    }

    private func finish() {
        Task { try? await session.completeOnboarding() }
    }
}
