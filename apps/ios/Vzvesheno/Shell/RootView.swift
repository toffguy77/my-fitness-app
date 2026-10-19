import DesignSystem
import Navigation
import SwiftUI

/// Корень: экран по состоянию запуска. Пока роль неизвестна — загрузка без
/// таббара; устаревшая версия — блокирующий экран.
struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            switch model.launch {
            case .loading:
                LoadingView()
            case .signedOut:
                SignInFlow()
            case .updateRequired:
                UpdateRequiredView()
            case .pendingDeletion:
                PendingDeletionView()
            case .verifyEmail:
                VerifyEmailView()
            case .onboarding:
                OnboardingFlow()
            case let .shell(shell, offline):
                switch shell {
                case .webOnly:
                    WebOnlyView()
                default:
                    ShellView(shell: shell, offline: offline)
                }
            }
        }
        .alert("Войти в другой аккаунт?", isPresented: Binding(
            get: { model.authLinkAwaitingConfirmation != nil }, set: { if !$0 { model.cancelSwitchingAccount() } })) {
            Button("Отмена", role: .cancel) { model.cancelSwitchingAccount() }
            Button("Войти", role: .destructive) { Task { await model.confirmSwitchingAccount() } }
        } message: {
            Text("Текущий сеанс завершится.")
        }
        .alert("Не получилось войти по ссылке", isPresented: Binding(
            get: { model.linkError != nil }, set: { if !$0 { model.linkError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.linkError ?? "")
        }
        .alert("Не сохранилось", isPresented: Binding(
            get: { model.outboxNotice != nil }, set: { if !$0 { model.outboxNotice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.outboxNotice ?? "")
        }
    }
}

struct LoadingView: View {
    var body: some View {
        DSSpinner("Загружаем профиль")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(DS.Color.bgCanvas)
            .accessibilityIdentifier("launch.loading")
    }
}

/// «Обновите приложение»: версия ниже `ios.min_supported_version`.
struct UpdateRequiredView: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: DS.Space.s5) {
            Spacer()
            Image(systemName: "arrow.down.app")
                .font(.largeTitle)
                .foregroundStyle(DS.Color.primaryDefault)
                .accessibilityHidden(true)
            Text("Обновите приложение")
                .dsText(DS.Typography.title1)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text("Эта версия «Взвешено» больше не поддерживается. Установите новую из App Store — данные сохранятся.")
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgMuted)
                .multilineTextAlignment(.center)
            Spacer()
            Button("Открыть App Store") {
                if let url = URL(string: "itms-apps://apps.apple.com/ru/search?term=%D0%92%D0%B7%D0%B2%D0%B5%D1%88%D0%B5%D0%BD%D0%BE") {
                    openURL(url)
                }
            }
            .buttonStyle(DSButtonStyle(.primary))
        }
        .foregroundStyle(DS.Color.fgDefault)
        .padding(DS.Space.screenX)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DS.Color.bgCanvas)
        .accessibilityIdentifier("update.required")
    }
}

/// Роль, которой приложение не знает: интерфейс — в вебе.
struct WebOnlyView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: DS.Space.s5) {
            Spacer()
            Text("Этот раздел доступен в веб-версии")
                .dsText(DS.Typography.title2)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text("Для вашей роли в приложении пока нет экранов. Работайте на сайте.")
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgMuted)
                .multilineTextAlignment(.center)
            Link("Открыть \(model.environment.siteURL.host ?? "сайт")", destination: model.environment.siteURL)
                .buttonStyle(DSButtonStyle(.primary))
            Spacer()
            Button("Выйти") { Task { await model.signOut() } }
                .buttonStyle(DSButtonStyle(.secondary))
        }
        .foregroundStyle(DS.Color.fgDefault)
        .padding(DS.Space.screenX)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DS.Color.bgCanvas)
        .accessibilityIdentifier("shell.webOnly")
    }
}
