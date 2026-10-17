import DesignSystem
import Navigation
import SwiftUI

/// Оболочка роли: таббар вкладок роли и стек навигации в каждой.
///
/// Клиент: «Сегодня», «Дневник», «Меню», «Ещё»; переписка с куратором —
/// значок в шапке рядом с профилем. Куратор: «Клиенты», «Чаты», «Заявки»,
/// «Обращения». Суперадмин: «Заявки», «Обращения».
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
                        .navigationDestination(for: Destination.self) { destination in
                            DestinationView(destination: destination)
                        }
                }
                .tabItem { Label(tab.title, systemImage: tab.systemImage) }
                .tag(Optional(tab))
                .accessibilityIdentifier("tab.\(tab.rawValue)")
            }
        }
        .accessibilityIdentifier("shell.\(shellName)")
        #if DEV_BUILD
        .sheet(isPresented: $model.showCatalogue) {
            NavigationStack {
                CatalogueView()
                    .toolbar {
                        Button("Готово") { model.showCatalogue = false }
                    }
            }
        }
        #endif
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

extension Tab {
    var title: String {
        switch self {
        case .today: return String(localized: "tab.today")
        case .diary: return String(localized: "tab.diary")
        case .menu: return String(localized: "tab.menu")
        case .more: return String(localized: "tab.more")
        case .clients: return String(localized: "tab.clients")
        case .chats: return String(localized: "tab.chats")
        case .leads: return String(localized: "tab.leads")
        case .support: return String(localized: "tab.support")
        }
    }

    var systemImage: String {
        switch self {
        case .today: return "sun.max"
        case .diary: return "fork.knife"
        case .menu: return "menucard"
        case .more: return "ellipsis.circle"
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
        case .more: return "Статьи, профиль и настройки."
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
    let tab: Tab
    let shell: Shell
    let offline: Bool

    var body: some View {
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
                if tab == .more {
                    MoreLinks()
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
            if shell == .client && tab == .today {
                // Переписка с куратором — значок в шапке, а не вкладка.
                Button {
                    model.open(.chat)
                } label: {
                    Image(systemName: "bubble.left.and.text.bubble.right")
                }
                .accessibilityLabel("Чат с куратором")
                .accessibilityIdentifier("header.chat")
            }
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

private struct MoreLinks: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            #if DEV_BUILD
            Button { model.showCatalogue = true } label: {
                row("Компоненты", "paintpalette")
            }
            .accessibilityIdentifier("more.catalogue")
            Divider().overlay(DS.Color.lineDefault)
            #endif
            Button { Task { await model.signOut() } } label: {
                row("Выйти", "rectangle.portrait.and.arrow.right")
            }
            .accessibilityIdentifier("more.signOut")
        }
        .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
        .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
    }

    private func row(_ title: String, _ icon: String) -> some View {
        HStack(spacing: DS.Space.s3) {
            Image(systemName: icon).foregroundStyle(DS.Color.fgMuted).accessibilityHidden(true)
            Text(title).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(DS.Color.fgSubtle).accessibilityHidden(true)
        }
        .padding(.horizontal, DS.Space.s4)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}

/// Экран пути навигации. Пока — заглушка с названием.
private struct DestinationView: View {
    let destination: Destination

    var body: some View {
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
        case .notifications: return "Уведомления"
        case .weeklyFeedback: return "Отзыв куратора"
        case .plan: return "План"
        case .export: return "Выгрузка данных"
        case .client: return "Клиент"
        case .conversation: return "Переписка"
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
        case .notifications: return "notifications"
        case .weeklyFeedback: return "weeklyFeedback"
        case .plan: return "plan"
        case .export: return "export"
        case .client: return "client"
        case .conversation: return "conversation"
        case .supportConversation: return "supportConversation"
        case .lead: return "lead"
        }
    }
}
