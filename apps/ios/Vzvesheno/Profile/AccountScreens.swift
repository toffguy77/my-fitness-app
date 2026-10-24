import API
import Client
import DesignSystem
import Session
import SwiftUI
import UIKit

// MARK: Telegram

/// Привязка через бота: ссылка (одноразовая, 15 минут) открывает Telegram.
struct TelegramScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var link: TelegramLink?
    @State private var error: String?

    var body: some View {
        SettingsForm(error: error) {
            Text(link?.linked == true ? "Telegram привязан: \(link?.summary ?? "")" : "Telegram не привязан")
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgDefault)
                .accessibilityIdentifier("telegram.status")
            Text("В Telegram приходят уведомления и ответы куратора — даже когда приложение закрыто.")
                .dsText(DS.Typography.callout)
                .foregroundStyle(DS.Color.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
            if link?.linked == true {
                Button("Отвязать", role: .destructive) { Task { await unlink() } }
                    .buttonStyle(DSButtonStyle(.secondary))
                    .accessibilityIdentifier("telegram.unlink")
            } else {
                Button("Привязать Telegram") { Task { await linkTelegram() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .accessibilityIdentifier("telegram.link")
            }
        }
        .task { await load() }
        // Вернулись из Telegram — привязка могла состояться.
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await load() } } }
    }

    private func load() async {
        link = try? await AccountService(api: model.api).telegram()
    }

    private func linkTelegram() async {
        do {
            if let url = try await AccountService(api: model.api).telegramLinkURL() { openURL(url) }
        } catch {
            self.error = model.messages.message(for: error)
        }
    }

    private func unlink() async {
        do {
            try await AccountService(api: model.api).unlinkTelegram()
            await load()
        } catch {
            self.error = model.messages.message(for: error)
        }
    }
}

// MARK: Пароль

/// Смена пароля; у аккаунта без пароля — ссылка на почту.
struct PasswordScreen: View {
    @Environment(AppModel.self) private var model
    @State private var hasPassword: Bool?
    @State private var current = ""
    @State private var new = ""
    @State private var result: String?
    @State private var error: String?
    @State private var working = false

    var body: some View {
        SettingsForm(result: result, error: error) {
            switch hasPassword {
            case .some(true):
                DSField(title: "Текущий пароль", text: $current, secure: true, contentType: .password)
                    .accessibilityIdentifier("password.current")
                DSField(title: "Новый пароль", text: $new, secure: true, contentType: .newPassword)
                    .accessibilityIdentifier("password.new")
                PasswordRulesView(password: new)
                Button("Сменить пароль") { Task { await change() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(current.isEmpty || !PasswordPolicy.isValid(new) || working)
                    .accessibilityIdentifier("password.save")
            case .some(false):
                Text("У аккаунта нет пароля — вы входите через Apple, Яндекс, VK или по ссылке из письма. "
                     + "Пришлём ссылку, по которой его можно задать.")
                    .dsText(DS.Typography.body)
                    .foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Отправить ссылку") { Task { await sendLink() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(working)
                    .accessibilityIdentifier("password.sendLink")
            case .none:
                DSSpinner()
            }
        }
        .task { hasPassword = (try? await AccountService(api: model.api).linkedProviders())?.hasPassword ?? true }
    }

    private func change() async {
        working = true
        defer { working = false }
        do {
            let session = try await AccountService(api: model.api).changePassword(current: current, new: new,
                                                                                   deviceName: AppEnvironment.deviceName)
            // Прочие сессии сервер завершил; новая пара — в Keychain.
            try await model.session.adopt(session)
            current = ""
            new = ""
            result = "Пароль изменён"
            error = nil
        } catch APIError.server(401, _, _) {
            error = "Текущий пароль введён неверно."
        } catch {
            self.error = model.messages.message(for: error)
        }
    }

    private func sendLink() async {
        working = true
        defer { working = false }
        do {
            try await AccountService(api: model.api).sendPasswordLink(email: model.user?.email ?? "")
            result = "Ссылка отправлена на почту"
        } catch {
            self.error = model.messages.message(for: error)
        }
    }
}

// MARK: Способы входа

/// Привязанные провайдеры; последний способ без пароля сервер не отвяжет.
/// Привязать здесь можно Apple (`native/apple/link`); Яндекс и VK — в вебе:
/// у входа через них из приложения нет режима привязки (`ios-client-settings`).
struct SignInMethodsScreen: View {
    @Environment(AppModel.self) private var model
    @State private var linked: LinkedProviders?
    @State private var available: [String] = []
    @State private var working = false
    @State private var error: String?
    @State private var result: String?

    var body: some View {
        SettingsForm(error: error) {
            if let linked {
                if linked.linked.isEmpty {
                    Text("Вход по почте и паролю.").dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted)
                }
                ForEach(linked.linked, id: \.provider) { provider in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(provider.title).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
                            if let email = provider.email {
                                Text(email).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                            }
                        }
                        Spacer()
                        Button("Отвязать") { Task { await unlink(provider.provider) } }
                            .buttonStyle(DSButtonStyle(.ghost, size: .small))
                            .accessibilityIdentifier("signIn.unlink.\(provider.provider)")
                    }
                    .accessibilityElement(children: .contain)
                }
                Text(linked.hasPassword ? "Пароль задан." : "Пароля нет: последний способ входа отвязать нельзя.")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
                if available.contains("apple"), !linked.linked.contains(where: { $0.provider == "apple" }) {
                    AppleSignInButton(label: .continue, title: "Продолжить с Apple") { Task { await linkApple() } }
                    .frame(height: DS.Size.control)
                    .clipShape(Capsule())
                    .disabled(working)
                    .accessibilityIdentifier("signIn.link.apple")
                }
                if let result {
                    Text(result).dsText(DS.Typography.callout).foregroundStyle(DS.Color.statusSuccessFg)
                        .accessibilityIdentifier("signIn.link.result")
                }
                let webOnly = available.filter { !AccountService.linkableInApp($0) }
                    .filter { name in !linked.linked.contains(where: { $0.provider == name }) }
                if !webOnly.isEmpty {
                    Text("Яндекс ID и VK ID привязываются в веб-версии: настройки профиля, раздел «Вход через сервисы».")
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("signIn.link.webOnly")
                }
            } else {
                DSSpinner()
            }
        }
        .task { await load() }
    }

    private func load() async {
        linked = try? await AccountService(api: model.api).linkedProviders()
        available = (try? await model.auth.providers()) ?? []
    }

    /// Nonce сервера, затем лист Apple, затем `native/apple/link`.
    private func linkApple() async {
        guard !working else { return }
        working = true
        error = nil
        defer { working = false }
        let account = AccountService(api: model.api)
        let nonce: AppleNonce
        do {
            nonce = try await account.appleNonce()
        } catch {
            self.error = AppleAuthorization.startFailureMessage(error, messages: model.messages)
            return
        }
        do {
            let credential = try await AppleAuthorization.request(nonce: nonce, scopes: [])
            try await account.linkApple(identityToken: credential.identityToken,
                                        authorizationCode: credential.authorizationCode, nonce: nonce)
            result = "Apple привязан: теперь можно входить через Apple."
            await load()
        } catch AppleSignInFailure.canceled {
            return
        } catch AppleSignInFailure.missingCredential {
            self.error = "Apple не передала данные. Попробуйте ещё раз."
        } catch AppleSignInFailure.failed {
            self.error = "Не получилось привязать Apple. Попробуйте ещё раз."
        } catch {
            self.error = model.messages.message(for: error)
        }
    }

    private func unlink(_ provider: String) async {
        do {
            try await AccountService(api: model.api).unlink(provider)
            error = nil
            await load()
        } catch {
            self.error = model.messages.message(for: error)
        }
    }
}

// MARK: Выгрузка данных

/// «Выгрузить мои данные»: раз в сутки, архив живёт 24 часа; готовый файл —
/// в share sheet с «Сохранить в Файлы».
struct ExportScreen: View {
    @Environment(AppModel.self) private var model
    @State private var export: ExportModel?
    @State private var file: URL?

    var body: some View {
        SettingsForm(error: export?.message) {
            Text("Архив со всеми вашими данными: профиль, дневник, замеры, переписка. Готовим его несколько минут; "
                 + "ссылка действует сутки.")
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
            if let latest = export?.latest {
                Text(latest.statusTitle)
                    .dsText(DS.Typography.headline)
                    .foregroundStyle(DS.Color.fgDefault)
                    .accessibilityIdentifier("export.status")
                if latest.isReady {
                    Button("Скачать") { Task { file = await export?.download() } }
                        .buttonStyle(DSButtonStyle(.primary))
                        .accessibilityIdentifier("export.download")
                }
            }
            Button("Выгрузить мои данные") { Task { await export?.request() } }
                .buttonStyle(DSButtonStyle(.secondary))
                .disabled(export?.working ?? true)
                .accessibilityIdentifier("export.request")
        }
        .task {
            let loaded = ExportModel(api: model.api, files: model.files)
            export = loaded
            await loaded.load()
        }
        .refreshable { await export?.load() }
        .sheet(item: Binding(get: { file.map(ShareFile.init) }, set: { file = $0?.url })) { item in
            ActivityView(items: [item.url])
                .presentationDetents([.medium, .large])
        }
    }
}

struct ShareFile: Identifiable {
    let url: URL
    var id: URL { url }
}

/// Системный share sheet.
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

// MARK: Удаление аккаунта

/// «Удалить аккаунт» (Guideline 5.1.1(v)): слово «УДАЛИТЬ» и пароль, без
/// пароля — код из письма. После `202` — выход и дата удаления на экране входа.
struct DeleteAccountScreen: View {
    @Environment(AppModel.self) private var model
    @State private var deletion: DeletionModel?

    var body: some View {
        SettingsForm(error: deletion?.error) {
            Text("Аккаунт и все данные будут удалены через 30 дней. До этого удаление можно отменить, войдя снова.")
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgDefault)
                .fixedSize(horizontal: false, vertical: true)
            if let deletion {
                form(deletion)
            } else {
                DSSpinner()
            }
        }
        .task {
            let loaded = DeletionModel(api: model.api)
            deletion = loaded
            await loaded.load()
        }
    }

    @ViewBuilder
    private func form(_ deletion: DeletionModel) -> some View {
        @Bindable var deletion = deletion
        DSField(title: "Введите слово \(DeletionModel.confirmationWord)", text: $deletion.word, placeholder: DeletionModel.confirmationWord)
            .textInputAutocapitalization(.characters)
            .accessibilityIdentifier("delete.word")
        switch deletion.hasPassword {
        case .some(true):
            DSField(title: "Пароль", text: $deletion.password, secure: true, contentType: .password)
                .accessibilityIdentifier("delete.password")
        case .some(false):
            Button(deletion.codeSent ? "Прислать код ещё раз" : "Прислать код") { Task { await deletion.sendCode() } }
                .buttonStyle(DSButtonStyle(.secondary))
                .disabled(deletion.working)
                .accessibilityIdentifier("delete.sendCode")
            if deletion.codeSent {
                Text("Код отправлен на \(model.user?.email ?? "почту").")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
                DSField(title: "Код из письма", text: $deletion.code, placeholder: "6 цифр", contentType: .oneTimeCode,
                        keyboard: .numberPad)
                    .accessibilityIdentifier("delete.code")
            }
        case .none:
            DSSpinner()
        }
        Button("Удалить аккаунт") {
            Task {
                if let pending = await deletion.submit() { await model.accountDeletionRequested(pending) }
            }
        }
        .buttonStyle(DSButtonStyle(.danger))
        .disabled(!deletion.canSubmit)
        .accessibilityIdentifier("delete.submit")
    }
}
