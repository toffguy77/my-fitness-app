import SwiftUI

struct LoginView: View {
    @Environment(SessionStore.self) private var session

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var errorText: String?
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("BURCEV")
                            .font(.largeTitle.weight(.bold))
                        Text("Питание и работа с куратором")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                    .listRowBackground(Color.clear)
                }

                Section {
                    TextField("Электронная почта", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focused, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focused = .password }
                    SecureField("Пароль", text: $password)
                        .textContentType(.password)
                        .focused($focused, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                }

                if let errorText {
                    Section {
                        Text(errorText)
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("login.error")
                    }
                }

                Section {
                    Button(action: submit) {
                        HStack {
                            Spacer()
                            if isSubmitting {
                                ProgressView()
                            } else {
                                Text("Войти").fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(!canSubmit)
                    .accessibilityIdentifier("login.submit")
                } footer: {
                    Text("Регистрация и восстановление пароля пока доступны на сайте burcev.team.")
                }
            }
            .navigationTitle("Вход")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var canSubmit: Bool {
        !isSubmitting && email.contains("@") && !password.isEmpty
    }

    private func submit() {
        guard canSubmit else { return }
        isSubmitting = true
        errorText = nil
        Task {
            defer { isSubmitting = false }
            do {
                try await session.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
            } catch APIError.server(status: 401, _, _), APIError.unauthorized {
                errorText = "Неверная почта или пароль."
            } catch APIError.server(status: 429, _, _) {
                errorText = "Слишком много попыток. Подождите несколько минут."
            } catch {
                errorText = error.localizedDescription
            }
        }
    }
}
