import Client
import DesignSystem
import SwiftUI

/// Что экран «Сегодня» просит у владельца — переходы и изменения.
struct TodayActions {
    var selectDay: (String) -> Void = { _ in }
    var openNotifications: () -> Void = {}
    var openChat: () -> Void = {}
    var openProfile: () -> Void = {}
    var addGlass: () -> Void = {}
    var editSteps: () -> Void = {}
    var editWeight: () -> Void = {}
    var editWorkout: () -> Void = {}
    var toggleTask: (TaskRow) -> Void = { _ in }
    var takeWeekPhoto: () -> Void = {}
    var pickWeekPhoto: () -> Void = {}
    var sendWeeklyReport: () -> Void = {}
    var fillProfile: () -> Void = {}
    var openHealthSettings: () -> Void = {}
}

/// Экран «Сегодня» без модели (макеты Today.png, TodayDark.png).
///
/// Порядок блоков — по частоте действия (`ios-client-app/design.md`):
/// питание, куратор, шаги/вода/вес/тренировка, задачи, первая неделя, фото
/// и отчёт, планка, неделя по калориям, прогресс.
struct TodayContent: View {
    let state: TodayScreenState
    let avatarInitial: String
    var offline = false
    var healthHint = false
    /// Задача из пуша или уведомления — подсвечена.
    var highlightedTask: String?
    var actions = TodayActions()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            TodayHeader(subtitle: state.subtitle, title: state.title, unread: state.unreadCount, avatarInitial: avatarInitial,
                        actions: actions)
            WeekStripView(days: state.weekStrip, onSelect: actions.selectDay)
            if offline || state.snapshot?.fromCache == true {
                OfflineBanner()
                    .accessibilityIdentifier("banner.offline")
            }
            if healthHint {
                HealthAccessHintCard()
            }
            if let nutrition = state.nutrition {
                NutritionTodayCard(summary: nutrition, onFillProfile: actions.fillProfile, onLogWeight: actions.editWeight)
            } else {
                TodaySkeleton()
            }
            if state.snapshot != nil {
                CuratorRow(summary: state.curator, onOpen: actions.openChat)
                dayCards
                blocks
            }
        }
        .padding(.horizontal, DS.Space.screenX)
        .padding(.bottom, DS.Space.s6)
    }

    private var dayCards: some View {
        Grid(horizontalSpacing: DS.Space.s3, verticalSpacing: DS.Space.s3) {
            GridRow {
                if let steps = state.steps { StepsTile(card: steps, onEdit: actions.editSteps) }
                if let water = state.water {
                    WaterTile(card: water, onAdd: actions.addGlass)
                } else if let weight = state.weight {
                    WeightTile(card: weight, onEdit: actions.editWeight)
                }
            }
            GridRow {
                if state.water != nil, let weight = state.weight { WeightTile(card: weight, onEdit: actions.editWeight) }
                if let workout = state.workout { WorkoutTile(card: workout, onEdit: actions.editWorkout) }
            }
        }
    }

    @ViewBuilder
    private var blocks: some View {
        let shown = state.visibility
        if shown.tasks {
            TasksCard(rows: state.tasks, highlighted: highlightedTask, onToggle: actions.toggleTask)
        }
        if shown.firstWeek {
            FirstWeekCard(items: state.firstWeek)
        }
        if shown.photoReminder {
            WeekPhotoCard(onCamera: actions.takeWeekPhoto, onLibrary: actions.pickWeekPhoto)
        }
        if shown.weeklyReport {
            Button("Отправить недельный отчёт", action: actions.sendWeeklyReport)
                .buttonStyle(DSButtonStyle(.secondary))
                .accessibilityIdentifier("today.weeklyReport")
        }
        if shown.plank, let plan = state.snapshot?.plan {
            PlankCard(plan: plan)
        }
        if shown.weekCalories {
            WeekCaloriesCard(bars: state.calorieBars)
        }
        if shown.progress, let progress = state.progressSummary {
            ProgressCard(weightChange: progress.weightChange, adherence: progress.adherence)
        }
    }
}

// MARK: Шапка и неделя

struct TodayHeader: View {
    let subtitle: String
    let title: String
    let unread: Int
    let avatarInitial: String
    let actions: TodayActions

    var body: some View {
        HStack(alignment: .center, spacing: DS.Space.s2) {
            VStack(alignment: .leading, spacing: 0) {
                Text(subtitle)
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
                    .frame(minHeight: 18)
                Text(title)
                    .dsText(DS.Typography.display)
                    .foregroundStyle(DS.Color.fgDefault)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    // Высота строки токена (34/40): своя у Literata выше.
                    .frame(height: 40)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("today.title")
            }
            Spacer(minLength: DS.Space.s2)
            HeaderButton(label: unread > 0 ? "Уведомления, \(unread) новых" : "Уведомления", action: actions.openNotifications) {
                Image(systemName: "bell")
            }
            .overlay(alignment: .topTrailing) {
                if unread > 0 {
                    Text(verbatim: unread > 99 ? "99+" : "\(unread)")
                        .font(.custom(DS.FontFamily.sans, size: 10, relativeTo: .caption2).weight(.semibold))
                        .foregroundStyle(DS.Color.primaryFg)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Capsule().fill(DS.Color.primaryDefault))
                        .offset(x: -6, y: 6)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityIdentifier("header.notifications")
            // Переписка с куратором — значок в шапке, а не вкладка (решение владельца).
            HeaderButton(label: "Чат с куратором", action: actions.openChat) {
                Image(systemName: "bubble.left")
            }
            .accessibilityIdentifier("header.chat")
            Button(action: actions.openProfile) {
                Text(verbatim: avatarInitial)
                    .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .subheadline).weight(.semibold))
                    .foregroundStyle(DS.Color.fgDefault)
                    .frame(width: DS.Size.touch, height: DS.Size.touch)
                    .background(Circle().fill(DS.Color.bgSubtle))
                    .overlay(Circle().strokeBorder(DS.Color.lineDefault))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Профиль")
            .accessibilityIdentifier("header.profile")
        }
    }
}

private struct HeaderButton<Icon: View>: View {
    let label: String
    let action: () -> Void
    @ViewBuilder let icon: Icon

    var body: some View {
        Button(action: action) {
            icon
                .font(.system(.title3))
                .foregroundStyle(DS.Color.fgDefault)
                .frame(width: DS.Size.touch, height: DS.Size.touch)
                .background(Circle().fill(DS.Color.bgSurface))
                .overlay(Circle().strokeBorder(DS.Color.lineDefault))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct WeekStripView: View {
    let days: [WeekStripDay]
    let onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: DS.Space.s1) {
            ForEach(days) { day in
                Button { onSelect(day.day) } label: {
                    VStack(spacing: DS.Space.s1) {
                        // Вес 500 — как у токена micro (на макете 400): тонкие 11 pt
                        // аудит доступности считает неконтрастными.
                        Text(day.weekday)
                            .font(.custom(DS.FontFamily.sans, size: 11, relativeTo: .footnote).weight(.medium))
                            .foregroundStyle(DS.Color.fgMuted)
                        Text(day.number)
                            .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .subheadline).weight(.semibold))
                            .foregroundStyle(DS.Color.fgDefault)
                        HStack(spacing: 2) {
                            dot(day.nutrition)
                            dot(day.weight)
                            dot(day.activity)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background {
                        if day.isSelected {
                            RoundedRectangle(cornerRadius: 12, style: .continuous).fill(DS.Color.bgSurface)
                                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(DS.Color.lineDefault))
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // Будущий день не выбирается, но и не гаснет: на макете он обычный.
                .allowsHitTesting(!day.isFuture)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(day.accessibilityLabel)
                .accessibilityAddTraits(day.isSelected ? .isSelected : [])
                .accessibilityIdentifier("week.\(day.day)")
            }
        }
    }

    private func dot(_ filled: Bool) -> some View {
        Circle().fill(filled ? DS.Color.primaryDefault : DS.Color.track).frame(width: 6, height: 6)
    }
}

/// Пока первый ответ не пришёл — заглушки карточек, без нулей.
struct TodaySkeleton: View {
    var body: some View {
        VStack(spacing: DS.Space.s3) {
            RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSubtle).frame(height: 220)
            HStack(spacing: DS.Space.s3) {
                RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSubtle).frame(height: 120)
                RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSubtle).frame(height: 120)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Загружаем день")
        .accessibilityIdentifier("today.loading")
    }
}
