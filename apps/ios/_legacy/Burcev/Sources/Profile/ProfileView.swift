import SwiftUI

/// «Ещё»: всё, что на сайте живёт в меню пользователя и в настройках.
struct ProfileView: View {
    @Environment(SessionStore.self) private var session

    @State private var profile: ProfileResponse.Profile?
    @State private var deletion: DeletionStatus?
    @State private var showDeletion = false
    @State private var confirmSignOut = false
    @State private var healthEnabled = HealthService.isEnabled

    private var isClient: Bool { session.user?.role != .coordinator }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        AccountView(profile: profile) { Task { await load() } }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.fill").font(.largeTitle).foregroundStyle(Color.accentColor)
                            VStack(alignment: .leading) {
                                Text(profile?.name ?? session.user?.name ?? "Профиль").font(.headline)
                                Text(profile?.email ?? session.user?.email ?? "").font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section {
                    NavigationLink { NotificationsView() } label: { Label("Уведомления", systemImage: "bell") }
                    NavigationLink { FeedView() } label: { Label("Статьи", systemImage: "doc.richtext") }
                }

                if isClient {
                    Section("Питание и тело") {
                        NavigationLink { BodySettingsView() } label: { Label("Тело и цели", systemImage: "figure") }
                        NavigationLink { RestrictionsView() } label: { Label("Ограничения в питании", systemImage: "leaf") }
                    }
                }

                Section("Настройки") {
                    if HealthService.isAvailable {
                        Toggle(isOn: Binding(get: { healthEnabled }, set: { on in Task { await setHealth(on) } })) {
                            Label("Apple Здоровье", systemImage: "heart.text.square")
                        }
                        .accessibilityIdentifier("profile.health")
                    }
                    NavigationLink { NotificationSettingsView() } label: { Label("Доставка уведомлений", systemImage: "bell.badge") }
                    NavigationLink { TelegramView() } label: { Label("Telegram", systemImage: "paperplane") }
                    NavigationLink { ExportView() } label: { Label("Выгрузка данных", systemImage: "square.and.arrow.down") }
                }

                if let deletion, deletion.requested {
                    Section {
                        Text("Аккаунт будет удалён\(scheduled(deletion)). Чтобы отменить удаление, войдите на сайте burcev.team.")
                            .foregroundStyle(.orange)
                    }
                }

                Section {
                    Button("Выйти", role: .destructive) { confirmSignOut = true }
                        .accessibilityIdentifier("profile.signOut")
                }

                Section {
                    Button("Удалить аккаунт", role: .destructive) { showDeletion = true }
                        .disabled(deletion?.requested == true)
                        .accessibilityIdentifier("profile.delete")
                } footer: {
                    Text("Данные удаляются через 30 дней после запроса. До этого удаление можно отменить.\nВерсия \(AppConfig.clientHeader)")
                }
            }
            .navigationTitle("Ещё")
            .task { await load() }
            .refreshable { await load() }
            .confirmationDialog("Выйти из аккаунта?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Выйти", role: .destructive) { Task { await session.signOut() } }
            }
            .sheet(isPresented: $showDeletion) {
                DeleteAccountView()
            }
        }
    }

    private func setHealth(_ on: Bool) async {
        if on {
            // Отказ в разрешениях iOS приложению не сообщает — включаем
            // в любом случае: без разрешений чтение просто пустое.
            try? await HealthService.shared.requestAuthorization()
        }
        HealthService.isEnabled = on
        healthEnabled = on
        // Сайт показывает этот флаг в настройках — держим его в согласии.
        _ = try? await session.api.send(Endpoint<Empty>.put("/api/v1/users/settings", body: HealthFlagRequest(apple_health_enabled: on)))
    }

    private func scheduled(_ status: DeletionStatus) -> String {
        guard let raw = status.scheduled_for, let date = APIDates.timestamp(raw) else { return "" }
        return " \(date.formatted(date: .long, time: .omitted))"
    }

    private func load() async {
        async let profile = try? session.api.send(Endpoint<ProfileResponse>.get("/api/v1/users/profile"))
        async let deletion = try? session.api.send(Endpoint<DeletionStatus>.get("/api/v1/users/me/deletion"))
        self.profile = await profile?.profile
        self.deletion = await deletion
    }
}

/// Удаление аккаунта внутри приложения — требование App Store (5.1.1(v)).
///
/// Подтверждение — паролем, если он есть, иначе кодом из письма: аккаунт,
/// заведённый через Яндекс или ссылку, пароля не имеет.
struct DeleteAccountView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var hasPassword: Bool?
    @State private var password = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Профиль, дневник, переписка и фотографии будут удалены через 30 дней. До этого удаление можно отменить на сайте.")
                }
                switch hasPassword {
                case .none:
                    Section { ProgressView() }
                case .some(true):
                    Section("Подтвердите паролем") {
                        SecureField("Пароль", text: $password)
                            .textContentType(.password)
                    }
                case .some(false):
                    Section("Подтвердите кодом из письма") {
                        if codeSent {
                            TextField("Код", text: $code)
                                .keyboardType(.numberPad)
                                .textContentType(.oneTimeCode)
                        } else {
                            Button("Прислать код") { Task { await sendCode() } }
                                .disabled(working)
                        }
                    }
                }
                if let errorText {
                    Section { Text(errorText).foregroundStyle(.red) }
                }
                Section {
                    Button(role: .destructive) {
                        Task { await delete() }
                    } label: {
                        HStack {
                            Spacer()
                            if working { ProgressView() } else { Text("Удалить аккаунт").fontWeight(.semibold) }
                            Spacer()
                        }
                    }
                    .disabled(!canDelete)
                }
            }
            .navigationTitle("Удаление аккаунта")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
            }
            .task { await loadMe() }
        }
    }

    private var canDelete: Bool {
        guard !working, let hasPassword else { return false }
        return hasPassword ? !password.isEmpty : !code.isEmpty
    }

    private func loadMe() async {
        do {
            hasPassword = try await session.api.send(Endpoint<MeResponse>.get("/api/v1/auth/me")).user.has_password
        } catch {
            errorText = error.userMessage
        }
    }

    private func sendCode() async {
        working = true
        defer { working = false }
        do {
            _ = try await session.api.send(Endpoint<CodeSent>.post("/api/v1/users/me/deletion/code", body: [String: String]()))
            codeSent = true
            errorText = nil
        } catch {
            errorText = error.userMessage
        }
    }

    private func delete() async {
        working = true
        defer { working = false }
        do {
            _ = try await session.api.send(Endpoint<DeletionStatus>.post(
                "/api/v1/users/me/deletion",
                body: DeletionRequest(current_password: password, code: code)))
            // Сервер отозвал все сессии — на устройстве она тоже кончается.
            dismiss()
            session.endSession()
        } catch APIError.server(status: 401, _, _), APIError.unauthorized {
            errorText = hasPassword == true ? "Неверный пароль." : "Неверный код."
        } catch {
            errorText = error.userMessage
        }
    }
}
