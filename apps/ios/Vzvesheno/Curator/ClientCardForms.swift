import Client
import Curator
import DesignSystem
import SwiftUI

/// Лист формы карточки: план, задача, отзыв. «Готово» — в панели навигации;
/// ошибка сервера оставляет лист открытым с введённым.
struct CardSheetView: View {
    let sheet: CardSheet
    let card: ClientCardModel
    let dismiss: () -> Void

    var body: some View {
        switch sheet {
        case let .plan(plan):
            PlanForm(card: card, plan: plan, dismiss: dismiss)
        case let .task(task):
            TaskForm(card: card, task: task, dismiss: dismiss)
        case let .feedback(report):
            FeedbackForm(card: card, report: report, dismiss: dismiss)
        }
    }
}

/// Оболочка листа: «Отмена», заголовок, «Готово».
private struct FormSheet<Content: View>: View {
    let title: String
    let canSave: Bool
    var saveTitle = "Готово"
    let saving: Bool
    let error: String?
    let onCancel: () -> Void
    let onSave: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        NavigationStack {
            Form {
                content
                if let error {
                    Section {
                        Text(error).dsText(DS.Typography.callout).foregroundStyle(DS.Color.statusDangerFg)
                            .accessibilityIdentifier("form.error")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(DS.Color.bgCanvas)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена", action: onCancel).accessibilityIdentifier("form.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button(saveTitle, action: onSave)
                            .disabled(!canSave)
                            .accessibilityIdentifier("form.save")
                    }
                }
            }
        }
    }
}

/// Поле числа: «Калории» … «2 240».
struct NumberField: View {
    let title: String
    @Binding var text: String
    var color = DS.Color.fgDefault
    var identifier: String

    var body: some View {
        HStack {
            Text(title).foregroundStyle(color)
            TextField("0", text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .accessibilityLabel(title)
                .accessibilityIdentifier(identifier)
        }
        .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .body))
    }
}

private struct PlanForm: View {
    let card: ClientCardModel
    let plan: ClientPlan?
    let dismiss: () -> Void
    @State private var draft: PlanDraft
    @State private var saving = false
    @State private var error: String?

    init(card: ClientCardModel, plan: ClientPlan?, dismiss: @escaping () -> Void) {
        self.card = card
        self.plan = plan
        self.dismiss = dismiss
        _draft = State(initialValue: plan.map(PlanDraft.init(plan:)) ?? .new(today: card.today, calendar: card.calendar))
    }

    var body: some View {
        FormSheet(title: plan == nil ? "Новый план" : "План недели", canSave: draft.isValid, saving: saving, error: error,
                  onCancel: dismiss, onSave: save) {
            Section("КБЖУ в день") {
                NumberField(title: "Калории", text: $draft.calories, identifier: "plan.calories")
                NumberField(title: "Белки, г", text: $draft.protein, color: DS.Color.macroProteinFg, identifier: "plan.protein")
                NumberField(title: "Жиры, г", text: $draft.fat, color: DS.Color.macroFatFg, identifier: "plan.fat")
                NumberField(title: "Углеводы, г", text: $draft.carbs, color: DS.Color.macroCarbsFg, identifier: "plan.carbs")
            }
            Section {
                DatePicker("Начало", selection: date(\.startDate), displayedComponents: .date)
                    .disabled(!draft.datesEditable)
                    .accessibilityIdentifier("plan.start")
                DatePicker("Конец", selection: date(\.endDate), displayedComponents: .date)
                    .disabled(!draft.datesEditable)
                    .accessibilityIdentifier("plan.end")
            } footer: {
                if !draft.datesEditable { Text("Даты действующего плана не меняются — создайте новый план.") }
            }
            Section("Комментарий") {
                TextField("Например: держим белок", text: $draft.comment, axis: .vertical)
                    .lineLimit(2...5)
                    .accessibilityIdentifier("plan.comment")
            }
        }
    }

    private func date(_ key: WritableKeyPath<PlanDraft, String>) -> Binding<Date> {
        Binding(get: { card.calendar.date(draft[keyPath: key]) ?? Date() },
                set: { draft[keyPath: key] = card.calendar.key($0) })
    }

    private func save() {
        saving = true
        Task {
            error = await card.save(draft, editing: plan?.id)
            saving = false
            if error == nil { dismiss() }
        }
    }
}

private struct TaskForm: View {
    let card: ClientCardModel
    let task: ClientTask?
    let dismiss: () -> Void
    @State private var draft: TaskDraft
    @State private var saving = false
    @State private var error: String?

    init(card: ClientCardModel, task: ClientTask?, dismiss: @escaping () -> Void) {
        self.card = card
        self.task = task
        self.dismiss = dismiss
        _draft = State(initialValue: task.map(TaskDraft.init(task:)) ?? TaskDraft(deadline: card.calendar.adding(days: 7, to: card.today)))
    }

    var body: some View {
        FormSheet(title: task == nil ? "Новая задача" : "Задача", canSave: draft.isValid, saving: saving, error: error,
                  onCancel: dismiss, onSave: save) {
            Section {
                TextField("Название", text: $draft.title).accessibilityIdentifier("task.title")
                Picker("Тип", selection: $draft.kind) {
                    ForEach(TaskKind.allCases) { Text($0.title).tag($0) }
                }
                .disabled(draft.editing)
                DatePicker("Дедлайн", selection: deadline, displayedComponents: .date)
                    .accessibilityIdentifier("task.deadline")
                TextField("Описание", text: $draft.description, axis: .vertical)
                    .lineLimit(2...5)
                    .accessibilityIdentifier("task.description")
            }
            Section {
                Picker("Повторение", selection: $draft.recurrence) {
                    ForEach(TaskRecurrence.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .disabled(draft.editing)
                .accessibilityIdentifier("task.recurrence")
                if draft.recurrence == .weekly {
                    HStack(spacing: DS.Space.s1) {
                        ForEach(TaskDraft.weekdays, id: \.value) { day in
                            let on = draft.days.contains(day.value)
                            Button {
                                if on { draft.days.remove(day.value) } else { draft.days.insert(day.value) }
                            } label: {
                                Text(day.title)
                                    .dsText(DS.Typography.callout)
                                    .foregroundStyle(on ? DS.Color.primaryFg : DS.Color.fgDefault)
                                    .frame(maxWidth: .infinity, minHeight: 36)
                                    .background(Capsule().fill(on ? DS.Color.primaryDefault : DS.Color.bgSubtle))
                            }
                            .buttonStyle(.plain)
                            .disabled(draft.editing)
                            .accessibilityAddTraits(on ? .isSelected : [])
                            .accessibilityIdentifier("task.day.\(day.value)")
                        }
                    }
                }
            } footer: {
                if let problem = draft.problem, draft.recurrence == .weekly, draft.days.isEmpty {
                    Text(problem).accessibilityIdentifier("task.problem")
                }
            }
        }
    }

    private var deadline: Binding<Date> {
        Binding(get: { card.calendar.date(draft.deadline) ?? Date() }, set: { draft.deadline = card.calendar.key($0) })
    }

    private func save() {
        saving = true
        Task {
            error = await card.save(draft, editing: task?.id)
            saving = false
            if error == nil { dismiss() }
        }
    }
}

private struct FeedbackForm: View {
    let card: ClientCardModel
    let report: WeeklyReport
    let dismiss: () -> Void
    @State private var draft: FeedbackDraft
    @State private var saving = false
    @State private var error: String?

    init(card: ClientCardModel, report: WeeklyReport, dismiss: @escaping () -> Void) {
        self.card = card
        self.report = report
        self.dismiss = dismiss
        _draft = State(initialValue: report.feedback.map(FeedbackDraft.init) ?? FeedbackDraft())
    }

    var body: some View {
        FormSheet(title: "Отзыв · \(report.periodTitle)", canSave: draft.isValid, saveTitle: "Отправить", saving: saving, error: error,
                  onCancel: dismiss, onSave: save) {
            rating("Питание", $draft.nutrition, $draft.nutritionComment, id: "nutrition")
            rating("Активность", $draft.activity, $draft.activityComment, id: "activity")
            rating("Вода", $draft.water, $draft.waterComment, id: "water")
            Section {
                Toggle("Фото загружено", isOn: $draft.photoUploaded).accessibilityIdentifier("feedback.photo")
            }
            Section {
                TextField("Как прошла неделя", text: $draft.summary, axis: .vertical)
                    .lineLimit(2...6)
                    .accessibilityIdentifier("feedback.summary")
            } header: {
                Text("Итог")
            } footer: {
                if let hint = draft.summaryHint {
                    Text(hint).foregroundStyle(DS.Color.statusDangerFg).accessibilityIdentifier("feedback.summaryHint")
                }
            }
            Section("Рекомендации") {
                TextField("Что сделать на следующей неделе", text: $draft.recommendations, axis: .vertical)
                    .lineLimit(2...6)
                    .accessibilityIdentifier("feedback.recommendations")
            }
        }
    }

    private func rating(_ title: String, _ value: Binding<FeedbackRating?>, _ comment: Binding<String>, id: String) -> some View {
        Section(title) {
            Picker(title, selection: value) {
                Text("Без оценки").tag(FeedbackRating?.none)
                ForEach(FeedbackRating.allCases) { Text($0.title).tag(FeedbackRating?.some($0)) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("feedback.\(id)")
            TextField("Комментарий", text: comment, axis: .vertical)
                .lineLimit(1...4)
        }
    }

    private func save() {
        saving = true
        Task {
            error = await card.submit(draft, reportID: report.id)
            saving = false
            if error == nil { dismiss() }
        }
    }
}
