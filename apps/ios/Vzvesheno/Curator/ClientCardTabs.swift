import Client
import Curator
import DesignSystem
import SwiftUI

private func number(_ value: Double) -> String { NumberText.grouped(NumberText.jsRound(value)) }

/// «Ккал 2 240 · Б 120 · Ж 75 · У 250».
private struct MacrosLine: View {
    let macros: Macros

    var body: some View {
        HStack(spacing: 4) {
            Text("\(number(macros.calories)) ккал").font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body).weight(.semibold))
                .foregroundStyle(DS.Color.fgDefault)
            Text("· Б \(number(macros.protein))").foregroundStyle(DS.Color.macroProteinFg)
            Text("· Ж \(number(macros.fat))").foregroundStyle(DS.Color.macroFatFg)
            Text("· У \(number(macros.carbs))").foregroundStyle(DS.Color.macroCarbsFg)
        }
        .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout))
        .monospacedDigit()
        .accessibilityElement(children: .combine)
    }
}

private func period(_ start: String, _ end: String) -> String { "\(DayText.dayMonth(start)) – \(DayText.dayMonth(end))" }

/// «План»: активный, история, создание, правка, удаление.
struct ClientPlanTab: View {
    let plans: [ClientPlan]
    let actions: ClientCardActions

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            if let active = plans.first(where: \.isActive) {
                CuratorCard(padding: DS.Space.s5) {
                    VStack(alignment: .leading, spacing: DS.Space.s3) {
                        HStack {
                            Text("Активный план").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                            Spacer()
                            CuratorBadge(text: period(active.startDate, active.endDate), tone: .info)
                        }
                        MacrosLine(macros: active.macros)
                        if let comment = active.comment, !comment.isEmpty {
                            Text(comment).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        HStack(spacing: DS.Space.s3) {
                            Button("Изменить") { actions.editPlan(active) }
                                .buttonStyle(DSButtonStyle(.secondary, size: .small))
                                .accessibilityIdentifier("plan.edit")
                            Button("Удалить") { actions.deletePlan(active) }
                                .buttonStyle(DSButtonStyle(.ghost, size: .small))
                                .accessibilityIdentifier("plan.delete")
                        }
                    }
                }
                .accessibilityIdentifier("plan.active")
            } else {
                Text("Активного плана нет — клиент видит нормы автоматического расчёта.")
                    .dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button("Новый план") { actions.newPlan() }
                .buttonStyle(DSButtonStyle(.primary, size: .medium))
                .accessibilityIdentifier("plan.new")
            let history = plans.filter { !$0.isActive }
            if !history.isEmpty {
                Text("История").dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault).padding(.top, DS.Space.s2)
                ForEach(history) { plan in
                    CuratorCard {
                        VStack(alignment: .leading, spacing: DS.Space.s1) {
                            Text(period(plan.startDate, plan.endDate)).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                            MacrosLine(macros: plan.macros)
                        }
                    }
                }
            }
        }
    }
}

/// «Задачи»: фильтр и список; нажатие — правка.
struct ClientTasksTab: View {
    let tasks: [ClientTask]
    @Binding var filter: TaskFilter
    let actions: ClientCardActions

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            SegmentBar(items: TaskFilter.allCases, selection: $filter, title: \.title, identifier: \.rawValue)
            Button("Новая задача") { actions.newTask() }
                .buttonStyle(DSButtonStyle(.primary, size: .medium))
                .accessibilityIdentifier("task.new")
            if tasks.isEmpty {
                Text("Задач нет").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
            }
            ForEach(tasks) { task in
                Button { actions.editTask(task) } label: {
                    CuratorCard {
                        VStack(alignment: .leading, spacing: DS.Space.s1) {
                            Text(task.title).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                                .multilineTextAlignment(.leading)
                            Text(caption(task)).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                            if let description = task.description, !description.isEmpty {
                                Text(description).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                                    .multilineTextAlignment(.leading)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("task.\(task.id)")
            }
        }
    }

    private func caption(_ task: ClientTask) -> String {
        let kind = task.kind?.title ?? task.type
        let recurrence = TaskRecurrence(rawValue: task.recurrence)?.title ?? task.recurrence
        return "\(kind) · до \(DayText.dayMonth(task.deadline)) · \(recurrence.lowercased())"
    }
}

/// «Отчёты»: статус отзыва и «Дать обратную связь».
struct ClientReportsTab: View {
    let reports: [WeeklyReport]
    let actions: ClientCardActions

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            if reports.isEmpty {
                Text("Клиент ещё не отправлял недельных отчётов").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
            }
            ForEach(reports) { report in
                CuratorCard(padding: DS.Space.s5) {
                    VStack(alignment: .leading, spacing: DS.Space.s3) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(report.periodTitle).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                            Spacer()
                            CuratorBadge(text: report.statusTitle, tone: report.hasFeedback ? .info : .warning)
                        }
                        if let summary = report.feedback?.summary, !summary.isEmpty {
                            Text(summary).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Button(report.hasFeedback ? "Изменить отзыв" : "Дать обратную связь") { actions.feedback(report) }
                            .buttonStyle(DSButtonStyle(report.hasFeedback ? .secondary : .primary, size: .small))
                            .accessibilityIdentifier("report.feedback.\(report.id)")
                    }
                }
                .accessibilityIdentifier("report.\(report.id)")
            }
        }
    }
}
