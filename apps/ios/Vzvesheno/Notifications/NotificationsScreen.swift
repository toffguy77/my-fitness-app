import Client
import DesignSystem
import Navigation
import SwiftUI

/// Экран уведомлений (`ios-notifications-center`): колокольчик «Сегодня».
struct NotificationsScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if let notifications = model.notifications {
                NotificationsContent(
                    tab: notifications.tab,
                    counts: notifications.counts,
                    items: notifications.visible,
                    hasMore: notifications.hasMore[notifications.tab] == true,
                    onTab: { tab in Task { await notifications.select(tab) } },
                    onAppear: { notifications.appeared($0) },
                    onDisappear: { notifications.disappeared($0.id) },
                    onOpen: { open($0) },
                    onMore: { Task { await notifications.loadMore() } },
                    onReadAll: { Task { await notifications.markAllRead() } })
            } else {
                LoadingView()
            }
        }
        .navigationTitle("Уведомления")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen.notifications")
        .task {
            if model.notifications == nil {
                let notifications = NotificationsModel(api: model.api)
                notifications.onCountsChanged = { [weak model] counts in
                    model?.today?.applyUnread(counts)
                    Task { await model?.refreshBadge() }
                }
                model.notifications = notifications
            }
            await model.notifications?.load()
        }
        #if DEBUG
        .overlay(alignment: .bottom) { UITestRequestCounter() }
        #endif
    }

    /// Нажатие ведёт по `target`; `notifications` — остаться здесь.
    private func open(_ notification: AppNotification) {
        guard let link = notification.link else { return }
        model.open(link)
    }
}

struct NotificationsContent: View {
    let tab: NotificationsModel.Tab
    let counts: UnreadCounts
    let items: [AppNotification]
    var hasMore = false
    var onTab: (NotificationsModel.Tab) -> Void = { _ in }
    var onAppear: (AppNotification) -> Void = { _ in }
    var onDisappear: (AppNotification) -> Void = { _ in }
    var onOpen: (AppNotification) -> Void = { _ in }
    var onMore: () -> Void = {}
    var onReadAll: () -> Void = {}

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                HStack(spacing: DS.Space.s2) {
                    ForEach(NotificationsModel.Tab.allCases, id: \.self) { item in
                        let count = item == .main ? counts.main : counts.content
                        Button { onTab(item) } label: {
                            Text(count > 0 ? "\(item.title) · \(count)" : item.title)
                                // Как чипы «Статей»: аудит находил недостаточный контраст
                                // у полужирного 15 pt на bgSubtle.
                                .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .callout))
                                .foregroundStyle(item == tab ? DS.Color.fgInverse : DS.Color.fgDefault)
                                .padding(.horizontal, DS.Space.s4)
                                .frame(minHeight: DS.Size.touch)
                                .background(Capsule().fill(item == tab ? DS.Color.fgDefault : DS.Color.bgSubtle))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(item == tab ? .isSelected : [])
                        .accessibilityIdentifier("notifications.tab.\(item.rawValue)")
                    }
                }
                // «Прочитать все» — в содержимом, а не в панели навигации: кнопки
                // панели не растут с Dynamic Type.
                let unread = tab == .main ? counts.main : counts.content
                Button(action: onReadAll) {
                    Text("Прочитать все")
                        .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout).weight(.medium))
                        .foregroundStyle(unread == 0 ? DS.Color.fgMuted : DS.Color.primaryDefault)
                        .frame(minHeight: DS.Size.touch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(unread == 0)
                .accessibilityIdentifier("notifications.readAll")
                if items.isEmpty {
                    Text("Пока ничего нового.")
                        .dsText(DS.Typography.body)
                        .foregroundStyle(DS.Color.fgMuted)
                        .padding(.top, DS.Space.s4)
                }
                ForEach(items) { item in
                    Button { onOpen(item) } label: { NotificationRow(item: item) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("notification.\(item.id)")
                        // «На экране» — видимость в прокрутке, а не onAppear:
                        // стопка не ленивая, и onAppear сработал бы у всех сразу.
                        .onScrollVisibilityChange(threshold: 0.5) { visible in
                            if visible {
                                onAppear(item)
                                if item.id == items.last?.id, hasMore { onMore() }
                            } else {
                                onDisappear(item)
                            }
                        }
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s4)
        }
        .background(DS.Color.bgCanvas)
    }
}

private struct NotificationRow: View {
    let item: AppNotification

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        HStack(alignment: .top, spacing: DS.Space.s3) {
            Circle().fill(item.isRead ? Color.clear : DS.Color.primaryDefault)
                .frame(width: 8, height: 8)
                .padding(.top, 7)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: DS.Space.s1) {
                Text(item.title).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                if !item.content.isEmpty {
                    Text(item.content)
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(DayText.dayMonth(String(item.createdAt.prefix(10))))
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgSubtle)
            }
            Spacer(minLength: 0)
        }
        .padding(DS.Space.s4)
        .background(shape.fill(DS.Color.bgSurface))
        .overlay(shape.strokeBorder(DS.Color.lineDefault))
        .accessibilityElement(children: .combine)
        .accessibilityValue(item.isRead ? "" : "Новое")
    }
}

// MARK: Отзыв на недельный отчёт

/// «Отзыв куратора» (`target.kind = weekly_feedback`): оценки, итог, рекомендации.
struct WeeklyFeedbackScreen: View {
    @Environment(AppModel.self) private var model
    let reportID: String
    @State private var feedback: WeeklyFeedbackModel?

    var body: some View {
        ScrollView {
            if let value = feedback?.feedback {
                WeeklyFeedbackContent(feedback: value)
            } else if let error = feedback?.error {
                Text(error).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted).padding(DS.Space.screenX)
            } else {
                DSSpinner("Загружаем отзыв").frame(maxWidth: .infinity).padding(.top, DS.Space.s8)
            }
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle("Отзыв куратора")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen.weeklyFeedback")
        .task {
            let loaded = WeeklyFeedbackModel(api: model.api, reportID: reportID)
            feedback = loaded
            await loaded.load()
        }
    }
}

struct WeeklyFeedbackContent: View {
    let feedback: WeeklyFeedback

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            ForEach(feedback.ratings, id: \.title) { item in
                DSCard {
                    VStack(alignment: .leading, spacing: DS.Space.s1) {
                        Text(item.title).dsText(DS.Typography.overline).foregroundStyle(DS.Color.fgMuted)
                        Text(item.rating.title).dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                        if let comment = item.rating.comment, !comment.isEmpty {
                            Text(comment).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityElement(children: .combine)
            }
            section("Итог недели", feedback.summary)
            section("Рекомендации", feedback.recommendations)
        }
        .padding(.horizontal, DS.Space.screenX)
        .padding(.vertical, DS.Space.s4)
    }

    @ViewBuilder
    private func section(_ title: String, _ text: String?) -> some View {
        if let text, !text.isEmpty {
            VStack(alignment: .leading, spacing: DS.Space.s1) {
                Text(title).dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault).accessibilityAddTraits(.isHeader)
                Text(text).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
