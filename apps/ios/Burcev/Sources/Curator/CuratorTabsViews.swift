import SwiftUI

// MARK: - Сводка над списком клиентов

struct CuratorHubSection: View {
    let analytics: CuratorAnalytics?
    let attention: [AttentionItem]
    let open: (Int64) -> Void

    var body: some View {
        if let analytics {
            Section {
                HStack {
                    stat("\(analytics.attention_clients)", "внимания", analytics.attention_clients > 0 ? .orange : .secondary)
                    stat("\(Int(analytics.avg_kbzhu_percent.rounded()))%", "КБЖУ", .secondary)
                    stat("\(analytics.total_unread)", "непрочит.", analytics.total_unread > 0 ? .accentColor : .secondary)
                    stat("\(analytics.overdue_tasks)", "просроч.", analytics.overdue_tasks > 0 ? .red : .secondary)
                }
            }
        }
        if !attention.isEmpty {
            Section("Требуют внимания") {
                ForEach(groups, id: \.0) { clientID, items in
                    Button { open(clientID) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(items[0].client_name).font(.headline).foregroundStyle(.primary)
                            ForEach(items) { item in
                                HStack(alignment: .firstTextBaseline) {
                                    Text(item.reasonTitle).font(.caption.weight(.semibold))
                                        .foregroundStyle(item.priority <= 2 ? .red : (item.priority == 3 ? .orange : .blue))
                                    Text(item.detail).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// Как на сайте: по клиенту, клиенты — по самому срочному поводу.
    private var groups: [(Int64, [AttentionItem])] {
        Dictionary(grouping: attention, by: \.client_id)
            .map { ($0.key, $0.value.sorted { $0.priority < $1.priority }) }
            .sorted { ($0.1.first?.priority ?? 9) < ($1.1.first?.priority ?? 9) }
    }

    private func stat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack {
            Text(value).font(.title3.weight(.bold)).foregroundStyle(color).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Задачи клиента

struct ClientTasksView: View {
    @Environment(SessionStore.self) private var session
    let clientID: Int64

    @State private var filter = "active"
    @State private var tasks: [CuratorTask] = []
    @State private var editing: CuratorTask?
    @State private var creating = false
    @State private var errorText: String?

    var body: some View {
        List {
            Picker("Статус", selection: $filter) {
                Text("Активные").tag("active")
                Text("Выполненные").tag("completed")
            }
            .pickerStyle(.segmented)
            if let errorText { Text(errorText).foregroundStyle(.red) }
            if tasks.isEmpty { Text("Задач нет.").foregroundStyle(.secondary) }
            ForEach(tasks) { task in
                Button { editing = task } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(task.title).foregroundStyle(.primary)
                            Spacer()
                            Text(statusTitle(task.status)).font(.caption)
                                .foregroundStyle(task.status == "overdue" ? .red : (task.status == "completed" ? .green : .secondary))
                        }
                        Text("до \(dayTitle(task.deadline))\(task.recurrence == "once" ? "" : " · \(recurrenceTitle(task))")")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .swipeActions {
                    Button("Удалить", role: .destructive) { Task { await delete(task) } }
                    if task.status != "completed" {
                        Button("Выполнена") { Task { await complete(task) } }.tint(.green)
                    }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button("Задача", systemImage: "plus") { creating = true } }
        }
        .task(id: filter) { await load() }
        .sheet(isPresented: $creating) { TaskForm(clientID: clientID, task: nil) { Task { await load() } } }
        .sheet(item: $editing) { task in TaskForm(clientID: clientID, task: task) { Task { await load() } } }
    }

    private func statusTitle(_ status: String) -> String {
        switch status {
        case "completed": return "выполнена"
        case "overdue": return "просрочена"
        default: return "активна"
        }
    }

    private func recurrenceTitle(_ task: CuratorTask) -> String {
        if task.recurrence == "daily" { return "каждый день" }
        let names = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"]
        return "по " + (task.recurrence_days ?? []).map { names[$0 % 7] }.joined(separator: ", ")
    }

    private func load() async {
        do {
            tasks = try await session.api.send(Endpoint<[CuratorTask]>.get(
                "/api/v1/curator/clients/\(clientID)/tasks", query: [URLQueryItem(name: "status", value: filter)]))
            errorText = nil
        } catch is CancellationError {
            return
        } catch {
            errorText = error.userMessage
        }
    }

    private func delete(_ task: CuratorTask) async {
        _ = try? await session.api.send(Endpoint<Empty>.delete("/api/v1/curator/clients/\(clientID)/tasks/\(task.id)"))
        await load()
    }

    private func complete(_ task: CuratorTask) async {
        _ = try? await session.api.send(Endpoint<CuratorTask>.put(
            "/api/v1/curator/clients/\(clientID)/tasks/\(task.id)", body: CuratorTaskUpdate(status: "completed")))
        await load()
    }
}

struct TaskForm: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let clientID: Int64
    let task: CuratorTask?
    let onSaved: () -> Void

    @State private var title = ""
    @State private var type = "habit"
    @State private var details = ""
    @State private var deadline = Date().addingTimeInterval(86_400 * 7)
    @State private var recurrence = "once"
    @State private var days: Set<Int> = []
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Что сделать", text: $title)
                if task == nil {
                    Picker("Вид", selection: $type) {
                        Text("Питание").tag("nutrition")
                        Text("Тренировка").tag("workout")
                        Text("Привычка").tag("habit")
                        Text("Замер").tag("measurement")
                    }
                }
                TextField("Подробности", text: $details, axis: .vertical).lineLimit(2...5)
                DatePicker("Срок", selection: $deadline, displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "ru_RU"))
                if task == nil {
                    Picker("Повтор", selection: $recurrence) {
                        Text("Один раз").tag("once")
                        Text("Каждый день").tag("daily")
                        Text("По дням недели").tag("weekly")
                    }
                    if recurrence == "weekly" {
                        HStack {
                            ForEach([1, 2, 3, 4, 5, 6, 0], id: \.self) { day in
                                let names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
                                Button(names[day]) {
                                    if days.contains(day) { days.remove(day) } else { days.insert(day) }
                                }
                                .buttonStyle(.bordered)
                                .tint(days.contains(day) ? .accentColor : .secondary)
                            }
                        }
                        .font(.caption)
                    }
                }
                if let errorText { Text(errorText).foregroundStyle(.red) }
            }
            .navigationTitle(task == nil ? "Новая задача" : "Задача")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { Task { await save() } }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || (recurrence == "weekly" && days.isEmpty))
                }
            }
            .onAppear {
                guard let task else { return }
                title = task.title
                details = task.description ?? ""
                deadline = APIDates.parseDay(task.deadline) ?? deadline
            }
        }
    }

    private func save() async {
        let path = "/api/v1/curator/clients/\(clientID)/tasks"
        let description = details.isEmpty ? nil : details
        do {
            if let task {
                _ = try await session.api.send(Endpoint<CuratorTask>.put("\(path)/\(task.id)", body: CuratorTaskUpdate(
                    title: title, description: description, deadline: APIDates.day(deadline))))
            } else {
                _ = try await session.api.send(Endpoint<CuratorTask>.post(path, body: CuratorTaskRequest(
                    title: title, type: type, description: description, deadline: APIDates.day(deadline),
                    recurrence: recurrence, recurrence_days: recurrence == "weekly" ? days.sorted() : nil)))
            }
            onSaved()
            dismiss()
        } catch {
            errorText = error.userMessage
        }
    }
}

// MARK: - План питания клиента

struct ClientPlanView: View {
    @Environment(SessionStore.self) private var session
    let clientID: Int64

    @State private var plans: [CuratorPlan] = []
    @State private var editing: CuratorPlan?
    @State private var creating = false
    @State private var errorText: String?

    var body: some View {
        List {
            if let errorText { Text(errorText).foregroundStyle(.red) }
            if let active = plans.first(where: \.is_active) {
                Section("Текущий план") {
                    planRow(active)
                    Button("Изменить") { editing = active }
                    Button("Удалить", role: .destructive) { Task { await delete(active) } }
                }
            } else {
                Section {
                    Text("Активного плана нет — норма считается по профилю клиента.").foregroundStyle(.secondary)
                    Button("Задать план") { creating = true }
                }
            }
            let history = plans.filter { !$0.is_active }
            if !history.isEmpty {
                Section("История") { ForEach(history) { planRow($0) } }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button("План", systemImage: "plus") { creating = true } }
        }
        .task { await load() }
        .sheet(isPresented: $creating) { PlanForm(clientID: clientID, plan: nil) { Task { await load() } } }
        .sheet(item: $editing) { plan in PlanForm(clientID: clientID, plan: plan) { Task { await load() } } }
    }

    private func planRow(_ plan: CuratorPlan) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(Int(plan.calories)) ккал · Б \(Int(plan.protein)) · Ж \(Int(plan.fat)) · У \(Int(plan.carbs))")
                .font(.headline).monospacedDigit()
            Text("\(dayTitle(plan.start_date)) — \(dayTitle(plan.end_date))").font(.caption).foregroundStyle(.secondary)
            if let comment = plan.comment, !comment.isEmpty { Text(comment).font(.footnote) }
        }
    }

    private func load() async {
        do {
            plans = try await session.api.send(Endpoint<[CuratorPlan]>.get("/api/v1/curator/clients/\(clientID)/weekly-plans"))
            errorText = nil
        } catch is CancellationError {
            return
        } catch {
            errorText = error.userMessage
        }
    }

    private func delete(_ plan: CuratorPlan) async {
        _ = try? await session.api.send(Endpoint<Empty>.delete("/api/v1/curator/clients/\(clientID)/weekly-plan/\(plan.id)"))
        await load()
    }
}

struct PlanForm: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let clientID: Int64
    let plan: CuratorPlan?
    let onSaved: () -> Void

    @State private var calories: Double?
    @State private var protein: Double?
    @State private var fat: Double?
    @State private var carbs: Double?
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(86_400 * 6)
    @State private var comment = ""
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("На день") {
                    field("Калории", $calories)
                    field("Белки, г", $protein)
                    field("Жиры, г", $fat)
                    field("Углеводы, г", $carbs)
                }
                if plan == nil {
                    Section("Период") {
                        DatePicker("С", selection: $start, displayedComponents: .date)
                        DatePicker("По", selection: $end, in: start..., displayedComponents: .date)
                    }
                    .environment(\.locale, Locale(identifier: "ru_RU"))
                }
                TextField("Комментарий для клиента", text: $comment, axis: .vertical).lineLimit(2...4)
                if let errorText { Text(errorText).foregroundStyle(.red) }
            }
            .navigationTitle(plan == nil ? "Новый план" : "План")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    // Сервер не принимает ноль ни в одном из четырёх полей.
                    Button("Сохранить") { Task { await save() } }
                        .disabled([calories, protein, fat, carbs].contains { ($0 ?? 0) <= 0 })
                }
            }
            .onAppear {
                if let plan {
                    calories = plan.calories; protein = plan.protein; fat = plan.fat; carbs = plan.carbs
                    comment = plan.comment ?? ""
                } else {
                    // Как на сайте: по умолчанию — текущая неделя с понедельника.
                    var calendar = Calendar(identifier: .iso8601)
                    calendar.timeZone = .current
                    if let monday = calendar.dateInterval(of: .weekOfYear, for: Date())?.start {
                        start = monday
                        end = monday.addingTimeInterval(86_400 * 6)
                    }
                }
            }
        }
    }

    private func field(_ title: String, _ value: Binding<Double?>) -> some View {
        TextField(title, value: value, format: .number.precision(.fractionLength(0...1))).keyboardType(.decimalPad)
    }

    private func save() async {
        let comment = comment.isEmpty ? nil : comment
        do {
            if let plan {
                _ = try await session.api.send(Endpoint<CuratorPlan>.put(
                    "/api/v1/curator/clients/\(clientID)/weekly-plan/\(plan.id)",
                    body: CuratorPlanUpdate(calories: calories ?? 0, protein: protein ?? 0, fat: fat ?? 0, carbs: carbs ?? 0, comment: comment)))
            } else {
                _ = try await session.api.send(Endpoint<CuratorPlan>.post(
                    "/api/v1/curator/clients/\(clientID)/weekly-plan",
                    body: CuratorPlanRequest(calories: calories ?? 0, protein: protein ?? 0, fat: fat ?? 0, carbs: carbs ?? 0,
                                             start_date: APIDates.day(start), end_date: APIDates.day(end), comment: comment)))
            }
            onSaved()
            dismiss()
        } catch {
            errorText = error.userMessage
        }
    }
}

// MARK: - Недельные отчёты

struct ClientReportsView: View {
    @Environment(SessionStore.self) private var session
    let clientID: Int64

    @State private var reports: [CuratorReport] = []
    @State private var reviewing: CuratorReport?
    @State private var errorText: String?

    var body: some View {
        List {
            if let errorText { Text(errorText).foregroundStyle(.red) }
            if reports.isEmpty { Text("Отчётов пока нет.").foregroundStyle(.secondary) }
            ForEach(reports) { report in
                Section {
                    if let s = report.summary {
                        LabeledContent("Дней с питанием", value: "\(s.days_with_nutrition ?? 0)")
                        LabeledContent("Дней со взвешиванием", value: "\(s.days_with_weight ?? 0)")
                        if let kcal = s.average_calories { LabeledContent("Средние калории", value: "\(Int(kcal))") }
                        if let w = s.average_weight { LabeledContent("Средний вес", value: "\(w.formatted(.number.precision(.fractionLength(1)))) кг") }
                        if let steps = s.total_steps { LabeledContent("Шагов за неделю", value: steps.formatted()) }
                    }
                    if let feedback = report.curator_feedback {
                        Text(feedback.summary).font(.footnote)
                    } else {
                        Button("Дать отзыв") { reviewing = report }
                    }
                } header: {
                    HStack {
                        Text("\(dayTitle(report.week_start)) — \(dayTitle(report.week_end))")
                        Spacer()
                        Text(report.has_feedback ? "Отзыв дан" : "Ждёт отзыва")
                            .foregroundStyle(report.has_feedback ? .green : .orange)
                    }
                }
            }
        }
        .task { await load() }
        .sheet(item: $reviewing) { report in
            FeedbackForm(clientID: clientID, report: report) { Task { await load() } }
        }
    }

    private func load() async {
        do {
            reports = try await session.api.send(Endpoint<[CuratorReport]>.get("/api/v1/curator/clients/\(clientID)/weekly-reports"))
            errorText = nil
        } catch is CancellationError {
            return
        } catch {
            errorText = error.userMessage
        }
    }
}

struct FeedbackForm: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let clientID: Int64
    let report: CuratorReport
    let onSaved: () -> Void

    @State private var feedback = CuratorFeedback(summary: "")
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                category("Питание", \.nutrition)
                category("Активность", \.activity)
                category("Вода", \.water)
                Toggle("Фото прогресса загружено", isOn: Binding(get: { feedback.photo_uploaded ?? false }, set: { feedback.photo_uploaded = $0 }))
                Section("Итог (обязательно)") {
                    TextField("Главное за неделю", text: $feedback.summary, axis: .vertical).lineLimit(3...6)
                }
                Section("Рекомендации") {
                    TextField("На следующую неделю", text: Binding(get: { feedback.recommendations ?? "" }, set: { feedback.recommendations = $0 }),
                              axis: .vertical).lineLimit(2...6)
                }
                if let errorText { Text(errorText).foregroundStyle(.red) }
            }
            .navigationTitle("Отзыв на неделю")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Отправить") { Task { await save() } }
                        .disabled(feedback.summary.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func category(_ title: String, _ key: WritableKeyPath<CuratorFeedback, FeedbackCategory?>) -> some View {
        Section(title) {
            Picker("Оценка", selection: Binding(
                get: { feedback[keyPath: key]?.rating ?? "" },
                set: { rating in feedback[keyPath: key] = rating.isEmpty ? nil : FeedbackCategory(rating: rating, comment: feedback[keyPath: key]?.comment) })) {
                Text("—").tag("")
                Text("Отлично").tag("excellent")
                Text("Хорошо").tag("good")
                Text("Есть над чем работать").tag("needs_improvement")
            }
            if feedback[keyPath: key] != nil {
                TextField("Комментарий", text: Binding(
                    get: { feedback[keyPath: key]?.comment ?? "" },
                    set: { feedback[keyPath: key]?.comment = $0 }))
            }
        }
    }

    private func save() async {
        do {
            _ = try await session.api.send(Endpoint<Empty>.put(
                "/api/v1/curator/clients/\(clientID)/weekly-reports/\(report.id)/feedback", body: feedback))
            onSaved()
            dismiss()
        } catch {
            errorText = error.userMessage
        }
    }
}

// MARK: - Заявки и поддержка

struct LeadsAndSupportView: View {
    enum Tab: String, CaseIterable, Identifiable {
        case leads = "Заявки", support = "Поддержка"
        var id: String { rawValue }
    }
    @State private var tab: Tab = .leads

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Раздел", selection: $tab) { ForEach(Tab.allCases) { Text($0.rawValue).tag($0) } }
                    .pickerStyle(.segmented).padding([.horizontal, .top])
                switch tab {
                case .leads: LeadsView()
                case .support: SupportQueueView()
                }
            }
            .navigationTitle(tab.rawValue)
        }
    }
}

struct LeadsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openURL) private var openURL
    @State private var leads: [Lead] = []
    @State private var includeHandled = false
    @State private var errorText: String?

    var body: some View {
        List {
            Toggle("Показывать обработанные", isOn: $includeHandled)
            if let errorText { Text(errorText).foregroundStyle(.red) }
            if leads.isEmpty { Text("Новых заявок нет.").foregroundStyle(.secondary) }
            ForEach(leads) { lead in
                VStack(alignment: .leading, spacing: 4) {
                    Text(lead.name.map { "\($0) · \(lead.email)" } ?? lead.email).font(.headline)
                    if let step = lead.last_step { Text("Остановился на: \(step)").font(.caption).foregroundStyle(.secondary) }
                    if let p = lead.parameters {
                        Text([p.goal, p.height_cm.map { "\(Int($0)) см" }, p.weight_kg.map { "\(Int($0)) кг" },
                              lead.result?.calories.map { "\(Int($0)) ккал" }].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption)
                    }
                    if let days = lead.age_days { Text("ждёт \(days) дн.").font(.caption2).foregroundStyle(.secondary) }
                    HStack {
                        if lead.contact_allowed == true, let url = mailto(lead.email) {
                            Button("Написать") { openURL(url) }.buttonStyle(.bordered)
                        }
                        if lead.handled_at == nil {
                            Button("Обработана") { Task { await handle(lead) } }.buttonStyle(.borderedProminent)
                        } else {
                            Text("Обработана").font(.caption).foregroundStyle(.green)
                        }
                    }
                }
            }
        }
        .task(id: includeHandled) { await load() }
        .refreshable { await load() }
    }

    /// Адрес в заявке вводит посетитель сайта. Строка вида `a@b.c?body=…`
    /// подставила бы в письмо куратора чужой текст или получателей — поэтому
    /// только один простой адрес, и ссылка собирается из частей.
    private func mailto(_ email: String) -> URL? {
        guard email.wholeMatch(of: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/) != nil else { return nil }
        var parts = URLComponents()
        parts.scheme = "mailto"
        parts.path = email
        return parts.url
    }

    private func load() async {
        do {
            var q = [URLQueryItem(name: "limit", value: "50")]
            if includeHandled { q.append(URLQueryItem(name: "include_handled", value: "true")) }
            leads = try await session.api.send(Endpoint<Page<Lead>>.get("/api/v1/curator/leads", query: q)).items
            errorText = nil
        } catch is CancellationError {
            return
        } catch {
            errorText = error.userMessage
        }
    }

    private func handle(_ lead: Lead) async {
        _ = try? await session.api.send(Endpoint<Empty>.post("/api/v1/curator/leads/\(lead.id)/handled", body: [String: String]()))
        await load()
    }
}

struct SupportQueueView: View {
    @Environment(SessionStore.self) private var session
    @State private var items: [SupportConversation] = []
    @State private var errorText: String?

    var body: some View {
        List {
            if let errorText { Text(errorText).foregroundStyle(.red) }
            if items.isEmpty && errorText == nil { Text("Обращений нет.").foregroundStyle(.secondary) }
            ForEach(items) { conversation in
                NavigationLink {
                    SupportThreadView(id: conversation.id)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(conversation.title)
                            Spacer()
                            Text(conversation.status == "escalated" ? "ждёт человека" : conversation.status == "closed" ? "закрыто" : "открыто")
                                .font(.caption).foregroundStyle(conversation.status == "escalated" ? .orange : .secondary)
                        }
                        if let reason = conversation.escalation_reason { Text(reason).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            items = try await session.api.send(Endpoint<Page<SupportConversation>>.get(
                "/api/v1/curator/support/conversations", query: [URLQueryItem(name: "limit", value: "50")])).items
            errorText = nil
        } catch APIError.server(status: 503, _, _) {
            errorText = "Бот поддержки не настроен."
        } catch is CancellationError {
            return
        } catch {
            errorText = error.userMessage
        }
    }
}

struct SupportThreadView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let id: String
    @State private var thread: SupportThread?
    @State private var reply = ""
    @State private var errorText: String?

    var body: some View {
        List {
            if let thread {
                ForEach(thread.messages) { m in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.author == "user" ? "Клиент" : m.author == "bot" ? "Бот" : "Оператор").font(.caption.weight(.semibold))
                        Text(m.text)
                    }
                }
                Section {
                    TextField("Ответ в Telegram", text: $reply, axis: .vertical).lineLimit(2...6)
                    Button("Отправить") { Task { await send() } }.disabled(reply.isEmpty)
                    Button("Закрыть обращение", role: .destructive) { Task { await close() } }
                }
            } else {
                ProgressView()
            }
            if let errorText { Text(errorText).foregroundStyle(.red) }
        }
        .navigationTitle(thread?.conversation.title ?? "Обращение")
        .task { await load() }
    }

    private func load() async {
        thread = try? await session.api.send(Endpoint<SupportThread>.get("/api/v1/curator/support/conversations/\(id)"))
    }

    private func send() async {
        do {
            _ = try await session.api.send(Endpoint<Empty>.post("/api/v1/curator/support/conversations/\(id)/reply", body: ReplyRequest(text: reply)))
            reply = ""
            await load()
        } catch {
            errorText = error.userMessage
        }
    }

    private func close() async {
        _ = try? await session.api.send(Endpoint<Empty>.post("/api/v1/curator/support/conversations/\(id)/close", body: [String: String]()))
        dismiss()
    }
}

/// «2026-10-11» или «2026-10-11T00:00:00Z» → «11 окт.».
func dayTitle(_ raw: String) -> String {
    guard let date = APIDates.parseDay(raw) else { return String(raw.prefix(10)) }
    return date.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "ru_RU")))
}
