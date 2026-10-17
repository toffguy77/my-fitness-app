import Client
import DesignSystem
import SwiftUI

struct TodayCardTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .dsText(DS.Typography.title3)
            .foregroundStyle(DS.Color.fgDefault)
            .accessibilityAddTraits(.isHeader)
    }
}

/// «Задачи от куратора»: отметка на месте.
struct TasksCard: View {
    let rows: [TaskRow]
    let onToggle: (TaskRow) -> Void

    var body: some View {
        TodayCard {
            VStack(alignment: .leading, spacing: 10) {
                TodayCardTitle(text: "Задачи от куратора")
                ForEach(rows) { row in
                    Button { if !row.isDone { onToggle(row) } } label: {
                        HStack(spacing: DS.Space.s3) {
                            Image(systemName: row.isDone ? "checkmark.square.fill" : "square")
                                .font(.system(.title2))
                                .foregroundStyle(row.isDone ? DS.Color.primaryDefault : DS.Color.fgSubtle)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(row.title)
                                    .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .subheadline))
                                    .foregroundStyle(DS.Color.fgDefault)
                                    .strikethrough(row.isDone)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(row.subtitle)
                                    .dsText(DS.Typography.caption)
                                    .foregroundStyle(row.isOverdue ? DS.Color.statusDangerFg : DS.Color.fgMuted)
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(minHeight: DS.Size.touch)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(row.isDone ? .isSelected : [])
                    .accessibilityHint(Text(row.isDone ? "" : "Отметить выполненной"))
                    .accessibilityIdentifier("task.\(row.id)")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.tasks")
    }
}

/// «Первая неделя»: чек-лист, пока сервер считает неделю активной.
struct FirstWeekCard: View {
    let items: [FirstWeekItem]

    var body: some View {
        TodayCard {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                TodayCardTitle(text: "Первая неделя")
                ForEach(items) { item in
                    HStack(spacing: DS.Space.s2) {
                        Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(item.done ? DS.Color.statusSuccessFg : DS.Color.fgSubtle)
                            .accessibilityHidden(true)
                        Text(item.title)
                            .dsText(DS.Typography.callout)
                            .foregroundStyle(item.done ? DS.Color.fgMuted : DS.Color.fgDefault)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityValue(Text(item.done ? "сделано" : "не сделано"))
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.firstWeek")
    }
}

/// Напоминание «Фото недели» в субботу и воскресенье.
struct WeekPhotoCard: View {
    let onCamera: () -> Void
    let onLibrary: () -> Void

    var body: some View {
        TodayCard {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                TodayCardTitle(text: "Фото недели")
                Text("Сфотографируйтесь в полный рост — куратор сравнит с прошлой неделей. Фото нужно для недельного отчёта.")
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: DS.Space.s2) {
                    Button(action: onCamera) { Label("Камера", systemImage: "camera") }
                        .buttonStyle(DSButtonStyle(.primary, size: .medium))
                        .accessibilityIdentifier("weekPhoto.camera")
                    Button(action: onLibrary) { Label("Из «Фото»", systemImage: "photo") }
                        .buttonStyle(DSButtonStyle(.secondary, size: .medium))
                        .accessibilityIdentifier("weekPhoto.library")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.weekPhoto")
    }
}

/// «Планка недели»: цели плана куратора.
struct PlankCard: View {
    let plan: WeeklyPlan

    var body: some View {
        TodayCard {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                TodayCardTitle(text: "Планка недели")
                Text(lines.joined(separator: " · "))
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today.plank")
    }

    private var lines: [String] {
        var result = ["\(NumberText.grouped(plan.caloriesGoal)) ккал", "белки \(plan.proteinGoal) г"]
        if let fat = plan.fatGoal { result.append("жиры \(fat) г") }
        if let carbs = plan.carbsGoal { result.append("углеводы \(carbs) г") }
        if let steps = plan.stepsGoal { result.append("\(NumberText.grouped(steps)) шагов") }
        return result
    }
}

/// «Неделя по калориям»: столбец дня относительно нормы.
struct WeekCaloriesCard: View {
    let bars: [CalorieBar]

    var body: some View {
        TodayCard {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                TodayCardTitle(text: "Неделя по калориям")
                HStack(alignment: .bottom, spacing: DS.Space.s2) {
                    ForEach(bars) { bar in
                        VStack(spacing: DS.Space.s1) {
                            GeometryReader { proxy in
                                VStack {
                                    Spacer(minLength: 0)
                                    RoundedRectangle(cornerRadius: DS.Radius.xs)
                                        .fill(bar.isOver ? DS.Color.statusWarning : DS.Color.primaryDefault)
                                        .frame(height: max(4, proxy.size.height * bar.fraction / 1.25))
                                }
                            }
                            .frame(height: 72)
                            Text(bar.label).dsText(DS.Typography.micro).foregroundStyle(DS.Color.fgSubtle)
                        }
                        .accessibilityElement()
                        .accessibilityLabel(label(bar))
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.weekCalories")
    }

    private func label(_ bar: CalorieBar) -> String {
        guard let target = bar.target else { return "\(bar.label): \(NumberText.grouped(bar.actual)) ккал, нормы нет" }
        return "\(bar.label): \(NumberText.grouped(bar.actual)) из \(NumberText.grouped(target)) ккал"
    }
}

/// Прогресс за 4 недели.
struct ProgressCard: View {
    let weightChange: String?
    let adherence: String

    var body: some View {
        TodayCard {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                TodayCardTitle(text: "Прогресс за 4 недели")
                HStack(spacing: DS.Space.s6) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Вес").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        Text(weightChange ?? "—").dsText(DS.Typography.numL).foregroundStyle(DS.Color.fgDefault)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Дней в норме").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        Text(adherence).dsText(DS.Typography.numL).foregroundStyle(DS.Color.fgDefault)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today.progress")
    }
}
