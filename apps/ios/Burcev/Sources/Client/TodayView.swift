import SwiftUI
import Charts
import WidgetKit

/// Главный экран клиента — то же, что дашборд на сайте: куратор и первая
/// неделя, питание к цели, вода, активность, задачи, неделя и прогресс.
struct TodayView: View {
    @Environment(SessionStore.self) private var session

    @State private var date = Date()
    @State private var content: Loadable<Snapshot> = .loading
    @State private var addingWater = false
    @State private var actionError: String?
    @State private var editingWeight = false
    @State private var editingWorkout = false
    @State private var editingSteps = false
    @State private var articles: [Article] = []
    @State private var curatorRequested = false

    struct Snapshot: Sendable {
        var totals: Macros
        var targets: DailyTargets?
        var water: Water?
        var metrics: FullDailyMetrics?
        var health: HealthDay?
        var tasks: [ClientTask] = []
        var week: [HistoryDay] = []
        var progress: Progress?
        var onboarding: OnboardingState?
    }

    /// Что Здоровье знает о дне.
    struct HealthDay: Sendable {
        var steps: Int?
        var activeEnergy: Double?
        var weight: Double?
        var hadWorkout = false
    }

    var body: some View {
        NavigationStack {
            List {
                Section { DayPicker(date: $date) }
                switch content {
                case .loading:
                    Section { HStack { Spacer(); ProgressView(); Spacer() } }
                case let .failed(message):
                    Section { ErrorRetryView(message: message) { Task { await load() } } }
                case let .loaded(snapshot):
                    if let onboarding = snapshot.onboarding, isToday {
                        curatorSection(onboarding)
                    }
                    nutrition(snapshot)
                    water(snapshot.water)
                    activity(snapshot)
                    tasks(snapshot.tasks)
                    week(snapshot.week)
                    if snapshot.onboarding?.active != true, let progress = snapshot.progress {
                        progressSection(progress)
                    }
                    reading
                }
                if let actionError {
                    Section { Text(actionError).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle("Сегодня")
            .toolbar { ToolbarItem(placement: .primaryAction) { NotificationsBell() } }
            .refreshable { await load() }
            .task(id: APIDates.day(date)) { await load() }
            .sheet(isPresented: $editingWeight) {
                WeightSheet(current: content.value?.metrics?.weight ?? content.value?.health?.weight) { kg in
                    await saveMetric(.weight(kg, date: date))
                    await HealthService.shared.saveWeight(kilograms: kg, at: isToday ? Date() : date)
                }
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $editingSteps) {
                StepsSheet(current: content.value.map { max($0.metrics?.steps ?? 0, $0.health?.steps ?? 0) }) { steps in
                    await saveMetric(.steps(steps, date: date))
                }
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $editingWorkout) {
                WorkoutSheet(metrics: content.value?.metrics) { types, minutes in
                    await saveMetric(.workout(types: types, minutes: minutes, date: date))
                }
                .presentationDetents([.large])
            }
        }
    }

    private var isToday: Bool { Calendar.current.isDateInToday(date) }

    // MARK: - Куратор и первая неделя

    @ViewBuilder
    private func curatorSection(_ state: OnboardingState) -> some View {
        Section {
            // Куратор показывается только при активном сопровождении: без него
            // назначенный куратор не отвечает, и карточка вводила бы в заблуждение.
            if let curator = state.curator, state.curator_access?.allowed != false {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Ваш куратор — \(curator.name)", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.headline)
                    if let last = curator.last_message {
                        Text(last.text).lineLimit(2).foregroundStyle(.secondary).font(.subheadline)
                    }
                    if curator.unread_count > 0 {
                        Text("Непрочитанных: \(curator.unread_count) — откройте вкладку «Чат».")
                            .font(.footnote).foregroundStyle(Color.accentColor)
                    }
                }
            } else if let access = state.curator_access, !access.allowed {
                VStack(alignment: .leading, spacing: 8) {
                    Text(access.expired ? "Сопровождение куратора закончилось" : "Куратор пока не подключён")
                        .font(.headline)
                    Text("Куратор видит ваш дневник и помогает держать курс. Оставьте заявку — с вами свяжутся.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Button(curatorRequested ? "Заявка отправлена" : (access.expired ? "Продлить сопровождение" : "Хочу куратора")) {
                        Task { await requestCurator() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(curatorRequested)
                }
            }
            if state.active {
                ForEach(state.steps) { step in
                    Label(step.title, systemImage: step.done ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(step.done ? .secondary : .primary)
                }
            }
        } header: {
            Text(state.active ? "Первая неделя" : "Куратор")
        }
    }

    // MARK: - Питание и вода

    @ViewBuilder
    private func nutrition(_ snapshot: Snapshot) -> some View {
        let target = snapshot.targets?.macros
        Section {
            MacroRow(title: "Калории", value: snapshot.totals.calories, target: target?.calories, unit: "ккал")
            MacroRow(title: "Белки", value: snapshot.totals.protein, target: target?.protein, unit: "г")
            MacroRow(title: "Жиры", value: snapshot.totals.fat, target: target?.fat, unit: "г")
            MacroRow(title: "Углеводы", value: snapshot.totals.carbs, target: target?.carbs, unit: "г")
        } header: {
            Text("Питание")
        } footer: {
            if let message = snapshot.targets?.message, target == nil {
                Text(message)
            } else if snapshot.targets?.isCuratorOverride == true {
                Text("Цели задал куратор.")
            }
        }
    }

    @ViewBuilder
    private func water(_ water: Water?) -> some View {
        if let water {
            Section("Вода") {
                HStack {
                    VStack(alignment: .leading) {
                        Text("\(water.glasses) из \(water.goal) стаканов").monospacedDigit()
                        Text("Стакан — \(water.glass_size) мл").font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        Task { await addWater() }
                    } label: {
                        if addingWater { ProgressView() } else { Label("Стакан", systemImage: "plus.circle.fill") }
                    }
                    .buttonStyle(.bordered)
                    .disabled(addingWater)
                    .accessibilityIdentifier("today.addWater")
                }
                ProgressView(value: min(Double(water.glasses) / Double(max(water.goal, 1)), 1))
            }
        }
    }

    // MARK: - Активность

    @ViewBuilder
    private func activity(_ snapshot: Snapshot) -> some View {
        let metrics = snapshot.metrics
        let health = snapshot.health
        let steps = max(metrics?.steps ?? 0, health?.steps ?? 0)
        let weight = metrics?.weight ?? health?.weight
        Section {
            Button { editingSteps = true } label: {
                LabeledContent("Шаги", value: steps > 0 ? steps.formatted() : "Указать")
            }
            .foregroundStyle(.primary)
            if let energy = health?.activeEnergy, energy > 0 {
                LabeledContent("Активная энергия", value: "\(energy.formatted(.number.precision(.fractionLength(0)))) ккал")
            }
            Button { editingWeight = true } label: {
                LabeledContent("Вес", value: weight.map { "\($0.formatted(.number.precision(.fractionLength(1)))) кг" } ?? "Указать")
            }
            .foregroundStyle(.primary)
            Button { editingWorkout = true } label: {
                LabeledContent("Тренировка", value: workoutSummary(metrics))
            }
            .foregroundStyle(.primary)
        } header: {
            Text("Активность")
        } footer: {
            if health != nil {
                Text("Шаги и вес из Apple Здоровья отправляются в дневник — их видит и куратор.")
            }
        }
    }

    private func workoutSummary(_ metrics: FullDailyMetrics?) -> String {
        guard let metrics, metrics.workout_completed else { return "Отметить" }
        let names = (metrics.workout_types ?? []).map { WorkoutKind(rawValue: $0)?.title ?? $0 }
        let minutes = metrics.workout_duration.map { " · \($0) мин" } ?? ""
        return (names.isEmpty ? "Выполнена" : names.joined(separator: ", ")) + minutes
    }

    // MARK: - Задачи, неделя, прогресс

    @ViewBuilder
    private func tasks(_ tasks: [ClientTask]) -> some View {
        if !tasks.isEmpty {
            Section("Задачи от куратора") {
                ForEach(tasks) { task in
                    let done = task.isDone(on: date)
                    HStack(alignment: .top) {
                        Image(systemName: task.icon).foregroundStyle(Color.accentColor).frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.title).strikethrough(done)
                            if let description = task.description, !description.isEmpty {
                                Text(description).font(.footnote).foregroundStyle(.secondary)
                            }
                            if task.status == "overdue" {
                                Text("Просрочена").font(.caption).foregroundStyle(.red)
                            }
                        }
                        Spacer()
                        Button {
                            Task { await complete(task) }
                        } label: {
                            Image(systemName: done ? "checkmark.circle.fill" : "circle").font(.title2)
                        }
                        .buttonStyle(.borderless)
                        .disabled(done)
                        .accessibilityLabel(done ? "Выполнено" : "Отметить выполненной")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func week(_ days: [HistoryDay]) -> some View {
        if days.contains(where: { $0.actual.calories > 0 }) {
            Section("Неделя") {
                Chart(days) { day in
                    if let d = day.day {
                        BarMark(x: .value("День", d, unit: .day), y: .value("Ккал", day.actual.calories))
                            .foregroundStyle(barColor(day))
                    }
                }
                .chartXAxis { AxisMarks(values: .stride(by: .day)) { _ in AxisValueLabel(format: .dateTime.weekday(.narrow)) } }
                .frame(height: 140)
                Text("Зелёный — в пределах 10% от цели, оранжевый — выше.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func barColor(_ day: HistoryDay) -> Color {
        guard let target = day.target?.calories, target > 0 else { return Color.accentColor.opacity(0.6) }
        let ratio = day.actual.calories / target
        if (0.9...1.1).contains(ratio) { return .green }
        return ratio > 1.1 ? .orange : Color.accentColor
    }

    @ViewBuilder
    private func progressSection(_ progress: Progress) -> some View {
        Section {
            if progress.weight_trend.count >= 2 {
                Chart {
                    ForEach(progress.weight_trend) { point in
                        if let d = point.day {
                            LineMark(x: .value("Дата", d), y: .value("Вес", point.weight))
                            PointMark(x: .value("Дата", d), y: .value("Вес", point.weight))
                        }
                    }
                    if let target = progress.target_weight {
                        RuleMark(y: .value("Цель", target))
                            .lineStyle(StrokeStyle(dash: [4, 4]))
                            .annotation(position: .top, alignment: .leading) {
                                Text("цель \(target.formatted(.number.precision(.fractionLength(1)))) кг").font(.caption2)
                            }
                    }
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .frame(height: 160)
            }
            LabeledContent("Дни с записями питания", value: "\(Int(progress.nutrition_adherence.rounded()))%")
        } header: {
            Text("Прогресс за 4 недели")
        }
    }

    // MARK: - Почитать

    @ViewBuilder
    private var reading: some View {
        if !articles.isEmpty {
            Section("Почитать") {
                ForEach(articles) { article in
                    NavigationLink {
                        ArticleView(articleID: article.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(article.title)
                            Text(article.categoryTitle).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                NavigationLink("Все статьи") { FeedView() }
            }
        }
    }

    // MARK: - Загрузка

    private func load() async {
        let day = APIDates.day(date)
        let api = session.api
        // Чей день грузим: к концу загрузки в приложении может быть уже другой
        // человек, и его виджет не должен получить этот день.
        let loadingFor = session.user?.id
        if content.value == nil { content = .loading }
        actionError = nil
        do {
            async let entries = api.send(Endpoint<EntriesResponse>.get(
                "/api/v1/food-tracker/entries", query: [URLQueryItem(name: "date", value: day)]))
            async let targets = try? api.send(Endpoint<DailyTargets>.get(
                "/api/v1/nutrition-calc/targets", query: [URLQueryItem(name: "date", value: day)]))
            async let water = try? api.send(Endpoint<Water>.get(
                "/api/v1/food-tracker/water", query: [URLQueryItem(name: "date", value: day)]))
            async let metrics = try? api.send(Endpoint<FullDailyMetrics>.get("/api/v1/dashboard/daily/\(day)"))
            async let tasks = try? api.send(Endpoint<TasksResponse>.get("/api/v1/dashboard/tasks"))
            async let week = try? api.send(Endpoint<HistoryResponse>.get(
                "/api/v1/nutrition-calc/history", query: [URLQueryItem(name: "days", value: "7")]))
            async let progress = try? api.send(Endpoint<Progress>.get(
                "/api/v1/dashboard/progress", query: [URLQueryItem(name: "weeks", value: "4")]))
            async let onboarding = try? api.send(Endpoint<OnboardingState>.get("/api/v1/dashboard/onboarding"))
            async let feed = try? api.send(Endpoint<FeedPage>.get(
                "/api/v1/content/feed", query: [URLQueryItem(name: "limit", value: "3")]))

            var snapshot = Snapshot(
                totals: try await entries.dailyTotals,
                targets: await targets,
                water: await water,
                metrics: await metrics,
                tasks: await tasks?.tasks ?? [],
                week: await week?.days ?? [],
                progress: await progress,
                onboarding: await onboarding)
            articles = await feed?.articles ?? []
            snapshot.health = await readHealth()
            content = .loaded(snapshot)
            if isToday, let owner = loadingFor, session.user?.id == owner {
                publishToWidget(snapshot, owner: owner)
            }
            if await syncHealth(snapshot),
               let fresh = try? await api.send(Endpoint<FullDailyMetrics>.get("/api/v1/dashboard/daily/\(day)")) {
                snapshot.metrics = fresh
                content = .loaded(snapshot)
            }
        } catch is CancellationError {
            return
        } catch {
            content = .failed(error.userMessage)
        }
    }

    /// Сводка дня — виджету на домашнем экране.
    private func publishToWidget(_ snapshot: Snapshot, owner: Int64) {
        TodaySnapshot(
            userID: owner,
            day: TodaySnapshot.dayString(date),
            calories: snapshot.totals.calories,
            caloriesTarget: snapshot.targets?.macros?.calories,
            protein: snapshot.totals.protein, fat: snapshot.totals.fat, carbs: snapshot.totals.carbs,
            waterGlasses: snapshot.water?.glasses, waterGoal: snapshot.water?.goal,
            updatedAt: Date()
        ).save()
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func readHealth() async -> HealthDay? {
        guard HealthService.isEnabled else { return nil }
        let health = HealthService.shared
        async let steps = health.steps(on: date)
        async let energy = health.activeEnergy(on: date)
        async let weight = health.weightMeasured(on: date)
        async let workout = health.hasWorkout(on: date)
        return HealthDay(steps: await steps, activeEnergy: await energy, weight: await weight, hadWorkout: await workout)
    }

    /// Отправляет на сервер то, что Здоровье знает лучше дневника: больше
    /// шагов и взвешивание за этот день. Ничего не затирает: вес, введённый
    /// вручную, остаётся как есть.
    private func syncHealth(_ snapshot: Snapshot) async -> Bool {
        guard let health = snapshot.health else { return false }
        var changed = false
        if let steps = health.steps, steps > (snapshot.metrics?.steps ?? 0) {
            changed = await saveMetric(.steps(steps, date: date), quiet: true) || changed
        }
        if snapshot.metrics?.weight == nil, let weight = health.weight {
            changed = await saveMetric(.weight(weight, date: date), quiet: true) || changed
        }
        return changed
    }

    @discardableResult
    private func saveMetric(_ request: SaveMetricRequest, quiet: Bool = false) async -> Bool {
        do {
            _ = try await session.api.send(Endpoint<FullDailyMetrics>.post("/api/v1/dashboard/daily", body: request))
            if !quiet { await load() }
            return true
        } catch {
            if !quiet { actionError = error.userMessage }
            return false
        }
    }

    private func addWater() async {
        addingWater = true
        defer { addingWater = false }
        do {
            let water = try await session.api.send(Endpoint<Water>.post(
                "/api/v1/food-tracker/water", body: AddWaterRequest(date: APIDates.day(date), glasses: 1)))
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            await HealthService.shared.saveWater(milliliters: Double(water.glass_size), at: isToday ? Date() : date)
            if case var .loaded(snapshot) = content {
                snapshot.water = water
                content = .loaded(snapshot)
            }
        } catch {
            actionError = error.userMessage
        }
    }

    private func complete(_ task: ClientTask) async {
        do {
            _ = try await session.api.send(Endpoint<Empty>.post(
                "/api/v1/dashboard/tasks/\(task.id)/complete", body: CompleteTaskRequest(date: APIDates.day(date))))
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await load()
        } catch {
            actionError = error.userMessage
        }
    }

    private func requestCurator() async {
        do {
            _ = try await session.api.send(Endpoint<Empty>.post(
                "/api/v1/leads/curator-request", body: CuratorRequest(capture_source: "curator_offer_dashboard")))
            curatorRequested = true
        } catch {
            actionError = error.userMessage
        }
    }
}

// MARK: - Ввод веса и тренировки

struct WeightSheet: View {
    @Environment(\.dismiss) private var dismiss
    let current: Double?
    let onSave: (Double) async -> Void

    @State private var kg: Double?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        TextField("Вес", value: $kg, format: .number.precision(.fractionLength(0...1)))
                            .keyboardType(.decimalPad)
                            .font(.title)
                        Text("кг").foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Взвешивайтесь утром натощак — так цифры сравнимы день ко дню.")
                }
            }
            .navigationTitle("Вес")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        saving = true
                        Task {
                            if let kg { await onSave(kg) }
                            dismiss()
                        }
                    }
                    .disabled(saving || (kg ?? 0) <= 0 || (kg ?? 0) > 500)
                }
            }
            .onAppear { kg = current }
        }
    }
}

struct WorkoutSheet: View {
    @Environment(\.dismiss) private var dismiss
    let metrics: FullDailyMetrics?
    let onSave: ([String], [String: Int]) async -> Void

    @State private var selected: Set<String> = []
    @State private var minutes: [String: Int] = [:]
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Что было") {
                    ForEach(WorkoutKind.allCases) { kind in
                        HStack {
                            Button {
                                if selected.contains(kind.rawValue) { selected.remove(kind.rawValue) } else { selected.insert(kind.rawValue) }
                            } label: {
                                Label(kind.title, systemImage: selected.contains(kind.rawValue) ? "checkmark.circle.fill" : "circle")
                            }
                            .foregroundStyle(.primary)
                            if selected.contains(kind.rawValue) {
                                Spacer()
                                TextField("мин", value: Binding(get: { minutes[kind.rawValue] }, set: { minutes[kind.rawValue] = $0 }),
                                          format: .number)
                                    .keyboardType(.numberPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 60)
                                Text("мин").foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if metrics?.workout_completed == true {
                    Section {
                        Button("Тренировки не было", role: .destructive) { save(types: []) }
                    }
                }
            }
            .navigationTitle("Тренировка")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { save(types: Array(selected)) }
                        .disabled(saving || selected.isEmpty)
                }
            }
            .onAppear {
                selected = Set(metrics?.workout_types ?? [])
                minutes = metrics?.workout_type_durations ?? [:]
            }
        }
    }

    private func save(types: [String]) {
        saving = true
        Task {
            await onSave(types.sorted(), minutes)
            dismiss()
        }
    }
}

struct StepsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let current: Int?
    let onSave: (Int) async -> Void

    @State private var steps: Int?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Шаги", value: $steps, format: .number)
                        .keyboardType(.numberPad)
                        .font(.title)
                } footer: {
                    Text("Если включено Apple Здоровье, шаги подтягиваются сами — вручную их стоит вводить, когда телефона с собой не было.")
                }
            }
            .navigationTitle("Шаги")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        saving = true
                        Task {
                            if let steps { await onSave(steps) }
                            dismiss()
                        }
                    }
                    .disabled(saving || (steps ?? -1) < 0 || (steps ?? 0) > 200_000)
                }
            }
            .onAppear { steps = (current ?? 0) > 0 ? current : nil }
        }
    }
}
