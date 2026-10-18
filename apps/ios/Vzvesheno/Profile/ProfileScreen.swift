import Client
import DesignSystem
import Navigation
import SwiftUI

/// Разделы профиля и настроек (`ios-client-settings`) — `Destination.settings(section:)`.
enum SettingsSection: String, CaseIterable {
    case nameAndPhoto = "name"
    case bodyGoals = "body-goals"
    case locale
    case notifications
    case telegram
    case password
    case signInMethods = "sign-in"
    case export
    case deleteAccount = "delete"

    var title: String {
        switch self {
        case .nameAndPhoto: return "Имя и фото"
        case .bodyGoals: return "Тело и цели"
        case .locale: return "Язык, единицы, часовой пояс"
        case .notifications: return "Уведомления"
        case .telegram: return "Telegram"
        case .password: return "Пароль"
        case .signInMethods: return "Способы входа"
        case .export: return "Выгрузить мои данные"
        case .deleteAccount: return "Удалить аккаунт"
        }
    }
}

/// Что показывают строки профиля справа.
struct ProfileSummary: Equatable {
    var name: String?
    var email: String
    var body: String?
    var health: String?
    var healthConnected = false
    var notifications = "пуш, почта, тихое время"
    var telegram: String?
    var password: String?
    var signInMethods: String?
}

/// «Профиль» — аватар в шапке «Сегодня» (макет Profile.png). Вкладки «Ещё»
/// нет: всё, что в ней было, — здесь.
struct ProfileScreen: View {
    @Environment(AppModel.self) private var model
    @State private var summary: ProfileSummary?
    @State private var confirmingSignOut = false

    var body: some View {
        @Bindable var model = model
        ScrollView {
            ProfileContent(summary: summary ?? fallback, avatarInitial: model.avatarInitial, appearance: $model.appearance,
                           onSignOut: { confirmingSignOut = true }, onCatalogue: { model.showCatalogue = true })
            #if DEBUG
            UITestProfileDiagnostics()
            #endif
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle("Профиль")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen.profile")
        .task { await load() }
        .alert("Выйти из аккаунта?", isPresented: $confirmingSignOut) {
            Button("Отмена", role: .cancel) {}
            Button("Выйти", role: .destructive) { Task { await model.signOut() } }
        } message: {
            Text("Данные аккаунта на этом iPhone будут стёрты, уведомления на него приходить перестанут.")
        }
    }

    private var fallback: ProfileSummary {
        ProfileSummary(name: model.profileName, email: model.user?.email ?? "")
    }

    private func load() async {
        var next = summary ?? fallback
        if let profile = try? await ProfileService(api: model.api).profile() {
            next.name = profile.name
            next.email = profile.email
            next.body = Self.bodySummary(current: model.today?.snapshot?.day.weight, target: profile.settings.targetWeight)
        }
        next.healthConnected = model.healthConnected
        next.health = model.healthConnected ? "шаги, вес, тренировки" : "не подключено"
        let account = AccountService(api: model.api)
        if let telegram = try? await account.telegram() { next.telegram = telegram.summary }
        if let linked = try? await account.linkedProviders() {
            next.password = linked.hasPassword ? "изменить" : "задать"
            next.signInMethods = linked.summary
        }
        summary = next
    }

    /// «78,4 → 74 кг».
    static func bodySummary(current: Double?, target: Double?) -> String? {
        switch (current, target) {
        case let (current?, target?): return "\(NumberText.oneDecimal(current)) → \(NumberText.oneDecimal(target)) кг"
        case let (nil, target?): return "цель \(NumberText.oneDecimal(target)) кг"
        case let (current?, nil): return "\(NumberText.oneDecimal(current)) кг"
        default: return nil
        }
    }
}

struct ProfileContent: View {
    let summary: ProfileSummary
    let avatarInitial: String
    @Binding var appearance: Appearance
    var onSignOut: () -> Void = {}
    var onCatalogue: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            header
            group(nil) {
                row(.nameAndPhoto)
                row(.bodyGoals, value: summary.body)
                row(.locale, last: true)
            }
            group("Связи") {
                NavigationLink(value: Destination.health) {
                    ProfileRow(title: String(localized: "health.title"), value: summary.health,
                               valueColor: summary.healthConnected ? DS.Color.statusSuccessFg : DS.Color.fgMuted)
                }
                .accessibilityIdentifier("profile.health")
                divider
                row(.notifications, value: summary.notifications)
                row(.telegram, value: summary.telegram, last: true)
            }
            group("Вход") {
                row(.password, value: summary.password)
                row(.signInMethods, value: summary.signInMethods)
                AppearanceRow(appearance: $appearance)
            }
            group("Данные") {
                row(.export)
                NavigationLink(value: Destination.settings(section: SettingsSection.deleteAccount.rawValue)) {
                    ProfileRow(title: SettingsSection.deleteAccount.title, titleColor: DS.Color.statusDangerFg, chevron: false)
                }
                .accessibilityIdentifier("profile.\(SettingsSection.deleteAccount.rawValue)")
            }
            Button(action: onSignOut) {
                Text("Выйти")
                    .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .body).weight(.medium))
                    .foregroundStyle(DS.Color.statusDangerFg)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
                    .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
            }
            .padding(.top, DS.Space.s2)
            .accessibilityIdentifier("profile.signOut")
            #if DEV_BUILD
            Button(action: onCatalogue) {
                Text("Компоненты")
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.fgMuted)
                    .frame(maxWidth: .infinity, minHeight: DS.Size.touch)
            }
            .accessibilityIdentifier("profile.catalogue")
            #endif
        }
        .buttonStyle(.plain)
        .padding(.horizontal, DS.Space.screenX)
        .padding(.vertical, DS.Space.s4)
    }

    private var header: some View {
        HStack(spacing: DS.Space.s4) {
            Text(verbatim: avatarInitial)
                .font(.custom(DS.FontFamily.serif, size: 28, relativeTo: .title).weight(.semibold))
                .foregroundStyle(DS.Color.fgDefault)
                .frame(width: 60, height: 60)
                .background(Circle().fill(DS.Color.bgSubtle))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                if let name = summary.name, !name.isEmpty {
                    Text(name).dsText(DS.Typography.title2).foregroundStyle(DS.Color.fgDefault)
                }
                Text(Self.masked(summary.email)).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
            }
        }
        .padding(.bottom, DS.Space.s2)
        .accessibilityElement(children: .combine)
    }

    /// «d***@yandex.ru» — почта не светится целиком на скриншотах.
    static func masked(_ email: String) -> String {
        guard let at = email.firstIndex(of: "@"), let first = email.first else { return email }
        return "\(first)***\(email[at...])"
    }

    private var divider: some View {
        Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
    }

    private func row(_ section: SettingsSection, value: String? = nil, last: Bool = false) -> some View {
        VStack(spacing: 0) {
            NavigationLink(value: Destination.settings(section: section.rawValue)) {
                ProfileRow(title: section.title, value: value)
            }
            .accessibilityIdentifier("profile.\(section.rawValue)")
            if !last { divider }
        }
    }

    private func group<Content: View>(_ title: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            if let title {
                Text(title)
                    .dsText(DS.Typography.overline)
                    .foregroundStyle(DS.Color.fgMuted)
                    .padding(.leading, DS.Space.s4)
                    .padding(.top, DS.Space.s2)
                    .accessibilityAddTraits(.isHeader)
            }
            VStack(spacing: 0) { content() }
                .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
                .clipShape(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
        }
    }
}

struct ProfileRow: View {
    let title: String
    var value: String?
    var titleColor = DS.Color.fgDefault
    var valueColor = DS.Color.fgMuted
    var chevron = true

    var body: some View {
        HStack(spacing: DS.Space.s3) {
            Text(title).dsText(DS.Typography.body).foregroundStyle(titleColor)
            Spacer(minLength: DS.Space.s2)
            if let value {
                Text(value)
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(valueColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.system(.footnote).weight(.semibold))
                    .foregroundStyle(DS.Color.fgSubtle)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, DS.Space.s4)
        .frame(minHeight: 50)
        .contentShape(Rectangle())
    }
}

/// «Оформление»: Авто / Светлая / Тёмная — сразу ко всему приложению.
private struct AppearanceRow: View {
    @Binding var appearance: Appearance

    var body: some View {
        HStack(spacing: DS.Space.s3) {
            Text("Оформление").dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
            Spacer(minLength: DS.Space.s2)
            Picker("Оформление", selection: $appearance) {
                ForEach(Appearance.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .fixedSize()
            .accessibilityIdentifier("profile.appearance")
        }
        .padding(.horizontal, DS.Space.s4)
        .frame(minHeight: 50)
    }
}

#if DEBUG
/// Сценарий UI-теста: что видно только тесту — запросы Здоровья и тема.
struct UITestProfileDiagnostics: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if UITestScenario.current != nil {
            VStack {
                // Сколько раз подделка Здоровья получила системный запрос —
                // по нему тест видит, что «Не сейчас» запроса не делает.
                if let requests = model.uiTestHealthAuthorizationRequests {
                    Text(verbatim: "health.authRequests=\(requests)")
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgMuted)
                        .accessibilityIdentifier("uitest.health.authRequests")
                }
                Text(verbatim: "colorScheme=\(colorScheme == .dark ? "dark" : "light")")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
                    .accessibilityIdentifier("uitest.colorScheme")
            }
        }
    }
}
#endif
