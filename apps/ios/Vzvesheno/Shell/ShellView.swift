import Client
import Curator
import DesignSystem
import Navigation
import SwiftUI

/// Оболочка роли: таббар вкладок роли и стек навигации в каждой.
///
/// Клиент: «Сегодня», «Дневник», «Меню», «Статьи»; уведомления, переписка
/// с куратором и профиль — кнопки шапки «Сегодня». Куратор: «Клиенты»,
/// «Чаты», «Заявки», «Обращения». Суперадмин: «Заявки», «Обращения».
struct ShellView: View {
    @Environment(AppModel.self) private var model
    let shell: Shell
    let offline: Bool

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.selectedTab) {
            ForEach(shell.tabs, id: \.self) { tab in
                NavigationStack(path: Binding(get: { model.paths[tab] ?? [] }, set: { model.paths[tab] = $0 })) {
                    TabRoot(tab: tab, shell: shell, offline: offline)
                        // iOS 18: «Записать еду» — плавающая панель над таббаром.
                        // На корне вкладки, внутри стека: снаружи NavigationStack
                        // вставка не доходит до прокрутки, и панель закрывала
                        // низ экрана (и «Отменить» удаления).
                        .floatingFoodLogAccessory(visible: shell == .client && model.showsFoodAccessory(on: tab)) { method in
                            model.openFoodLog(method)
                        }
                        .navigationDestination(for: Destination.self) { destination in
                            DestinationView(destination: destination)
                        }
                }
                .tabItem { Label(tab.title, systemImage: tab.systemImage) }
                .badge(badge(tab))
                .tag(Optional(tab))
                .accessibilityIdentifier("tab.\(tab.rawValue)")
            }
        }
        // iOS 26: системный аксессуар таббара с Liquid Glass.
        .foodLogBottomAccessory(enabled: shell == .client && model.showsFoodAccessory(on: model.selectedTab ?? .today)) { method in
            model.openFoodLog(method)
        }
        // Пояс устройства отличается от профиля больше суток — один раз спросить.
        .alert(timeZoneQuestion, isPresented: Binding(get: { model.timeZoneOffer != nil }, set: { if !$0 { model.timeZoneOffer = nil } })) {
            Button("Сменить") { Task { await model.answerTimeZoneOffer(change: true) } }
            Button("Оставить", role: .cancel) { Task { await model.answerTimeZoneOffer(change: false) } }
        }
        .sheet(item: $model.foodLog) { request in
            AddFoodSheet(request: request)
                .presentationDragIndicator(.visible)
                .presentationBackground(DS.Color.bgCanvas)
        }
        .accessibilityIdentifier("shell.\(shellName)")
        #if DEV_BUILD
        .sheet(isPresented: $model.showCatalogue) {
            NavigationStack {
                CatalogueView()
                    .safeAreaInset(edge: .bottom) {
                        Button("Закрыть") { model.showCatalogue = false }
                            .buttonStyle(DSButtonStyle(.secondary))
                            .padding(.horizontal, DS.Space.screenX)
                            .padding(.vertical, DS.Space.s2)
                            .background(DS.Color.bgCanvas)
                            .accessibilityIdentifier("catalogue.close")
                    }
            }
        }
        #endif
    }

    /// «Чаты» — непрочитанные, «Обращения» — эскалированные без ответа.
    private func badge(_ tab: AppTab) -> Int {
        switch tab {
        case .chats: return model.curator?.chatsBadge ?? 0
        case .support: return model.curator?.supportBadge ?? 0
        default: return 0
        }
    }

    private var timeZoneQuestion: String {
        "Сменить часовой пояс на \(TimeZoneSuggestion.title(model.timeZoneOffer ?? ""))?"
    }

    private var shellName: String {
        switch shell {
        case .client: return "client"
        case .curator: return "curator"
        case .admin: return "admin"
        case .webOnly: return "webOnly"
        }
    }
}

extension AppTab {
    var title: String {
        switch self {
        case .today: return String(localized: "tab.today")
        case .diary: return String(localized: "tab.diary")
        case .menu: return String(localized: "tab.menu")
        case .articles: return String(localized: "tab.articles")
        case .clients: return String(localized: "tab.clients")
        case .chats: return String(localized: "tab.chats")
        case .leads: return String(localized: "tab.leads")
        case .support: return String(localized: "tab.support")
        }
    }

    var systemImage: String {
        switch self {
        case .today: return "gauge.with.dots.needle.33percent"
        case .diary: return "fork.knife"
        case .menu: return "menucard"
        case .articles: return "doc.text"
        case .clients: return "person.2"
        case .chats: return "bubble.left.and.bubble.right"
        case .leads: return "tray"
        case .support: return "lifepreserver"
        }
    }

    /// Чем станет вкладка в следующих изменениях.
    var upcoming: String {
        switch self {
        case .today: return "Дашборд дня: питание, вода, шаги, вес и задачи от куратора."
        case .diary: return "Дневник питания: приёмы пищи, запись поиском, штрихкодом и по фото."
        case .menu: return "План питания на неделю и список покупок."
        case .articles: return "Лента статей о питании, тренировках и здоровье."
        case .clients: return "Сводка по клиентам и те, кому нужно внимание."
        case .chats: return "Переписки с клиентами."
        case .leads: return "Очередь заявок."
        case .support: return "Очередь обращений в поддержку."
        }
    }
}

/// Корневой экран вкладки. В этом изменении — заглушка: экраны переносятся
/// следующими изменениями (ios-client-app, ios-curator-app).
private struct TabRoot: View {
    @Environment(AppModel.self) private var model
    let tab: AppTab
    let shell: Shell
    let offline: Bool

    var body: some View {
        switch (shell, tab) {
        case (.client, .today): TodayScreen(offline: offline)
        case (.client, .diary): DiaryScreen(offline: offline)
        case (.client, .menu): MenuScreen(offline: offline)
        case (.client, .articles): ArticlesScreen(offline: offline)
        case (.curator, .clients): HubScreen()
        case (.curator, .chats): ConversationListScreen()
        case (.curator, .leads), (.admin, .leads): LeadsScreen()
        case (.curator, .support), (.admin, .support): SupportQueueScreen()
        default: placeholder
        }
    }

    private var placeholder: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                if offline {
                    OfflineBanner()
                        .accessibilityIdentifier("banner.offline")
                }
                DSCard {
                    VStack(alignment: .leading, spacing: DS.Space.s2) {
                        DSCardTitle(tab.title)
                        Text(tab.upcoming)
                            .dsText(DS.Typography.body)
                            .foregroundStyle(DS.Color.fgMuted)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Раздел появится в следующих версиях приложения.")
                            .dsText(DS.Typography.caption)
                            .foregroundStyle(DS.Color.fgSubtle)
                    }
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s4)
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle(tab.title)
        .toolbar { toolbar }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            if tab == shell.rootTab {
                NavigationLink(value: Destination.notifications) {
                    Image(systemName: "bell")
                }
                .accessibilityLabel("Уведомления")
                ProfileMenu()
            }
        }
    }
}

/// Аватар в шапке: профиль, справочник компонентов (Dev) и выход.
private struct ProfileMenu: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Menu {
            if let email = model.user?.email {
                Text(email)
            }
            #if DEV_BUILD
            Button("Компоненты") { model.showCatalogue = true }
                .accessibilityIdentifier("profile.catalogue")
            #endif
            Button("Выйти", role: .destructive) { Task { await model.signOut() } }
                .accessibilityIdentifier("profile.signOut")
        } label: {
            Image(systemName: "person.crop.circle")
        }
        .accessibilityLabel("Профиль")
        .accessibilityIdentifier("header.profile")
    }
}

/// Экран пути навигации. Пока — заглушка с названием.
private struct DestinationView: View {
    let destination: Destination

    var body: some View {
        switch destination {
        case .profile: ProfileScreen()
        case .health: HealthScreen()
        case .curatorChat: ChatScreen()
        case let .article(slug): ArticleScreen(reference: slug)
        case .notifications: NotificationsScreen()
        case let .weeklyFeedback(reportID): WeeklyFeedbackScreen(reportID: reportID)
        case .export: SettingsSectionView(section: .export)
        case let .settings(section):
            if let section = SettingsSection(rawValue: section) { SettingsSectionView(section: section) } else { placeholder }
        case let .client(id, tab):
            if let clientID = Int64(id) { ClientCardScreen(clientID: clientID, initialTab: ClientCardTab(link: tab)) } else { placeholder }
        case let .conversation(id): CuratorConversationScreen(reference: .conversation(id))
        case let .clientConversation(clientID):
            if let id = Int64(clientID) { CuratorConversationScreen(reference: .client(id)) } else { placeholder }
        case let .supportConversation(id): SupportThreadScreen(conversationID: id)
        case let .lead(id): LeadsScreen(focus: id)
        default: placeholder
        }
    }

    private var placeholder: some View {
        VStack(spacing: DS.Space.s3) {
            Text(title)
                .dsText(DS.Typography.title2)
                .multilineTextAlignment(.center)
            Text("Экран появится в следующих версиях приложения.")
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgMuted)
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(DS.Color.fgDefault)
        .padding(DS.Space.screenX)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DS.Color.bgCanvas)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("destination.\(identifier)")
    }

    private var title: String {
        switch destination {
        case .article: return "Статья"
        case .task: return "Задача"
        case .diaryDay: return "Дневник"
        case .curatorChat: return "Куратор"
        case .profile: return "Профиль"
        case .health: return "Здоровье"
        case .settings: return "Настройки"
        case .notifications: return "Уведомления"
        case .weeklyFeedback: return "Отзыв куратора"
        case .plan: return "План"
        case .export: return "Выгрузка данных"
        case .client: return "Клиент"
        case .conversation, .clientConversation: return "Переписка"
        case .supportConversation: return "Обращение"
        case .lead: return "Заявка"
        }
    }

    private var identifier: String {
        switch destination {
        case .article: return "article"
        case .task: return "task"
        case .diaryDay: return "diaryDay"
        case .curatorChat: return "curatorChat"
        case .profile: return "profile"
        case .health: return "health"
        case .settings: return "settings"
        case .notifications: return "notifications"
        case .weeklyFeedback: return "weeklyFeedback"
        case .plan: return "plan"
        case .export: return "export"
        case .client: return "client"
        case .conversation: return "conversation"
        case .clientConversation: return "clientConversation"
        case .supportConversation: return "supportConversation"
        case .lead: return "lead"
        }
    }
}
