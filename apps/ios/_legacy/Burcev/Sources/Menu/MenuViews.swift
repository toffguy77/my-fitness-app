import SwiftUI

/// «Меню» (бета): план на день из рецептов под норму КБЖУ — как /menu на сайте.
struct MenuView: View {
    @Environment(SessionStore.self) private var session

    enum Tab: String, CaseIterable, Identifiable {
        case plan = "План", recipes = "Рецепты"
        var id: String { rawValue }
    }

    @State private var tab: Tab = .plan

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Раздел", selection: $tab) {
                    ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding([.horizontal, .top])
                switch tab {
                case .plan: DayPlanView()
                case .recipes: RecipesListView()
                }
            }
            .navigationTitle("Меню")
            .navigationDestination(for: RecipeSummary.self) { RecipeView(recipeID: $0.id) }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        NavigationLink { ShoppingListView() } label: { Label("Список покупок", systemImage: "cart") }
                        NavigationLink { MealPlanSettingsView() } label: { Label("Приёмы пищи", systemImage: "slider.horizontal.3") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
    }
}

struct DayPlanView: View {
    @Environment(SessionStore.self) private var session

    @State private var date = Date()
    @State private var plan: MealPlan?
    @State private var missing: [String]?
    @State private var errorText: String?
    @State private var loading = false
    @State private var replacing: MealPlanItem?
    @State private var eating: MealPlanItem?

    var body: some View {
        List {
            Section { DayPicker(date: $date, allowFuture: true) }
            if let missing {
                Section {
                    Text("Чтобы собрать меню, нужна ваша норма. Заполните \(missing.contains("weight") ? "вес" : "")\(missing.count > 1 ? " и " : "")\(missing.contains("profile") ? "профиль" : "").")
                    NavigationLink("Тело и цели") { BodySettingsView() }
                }
            }
            if let plan {
                if plan.target_changed {
                    Section {
                        Label("Норма изменилась с тех пор, как меню собрано.", systemImage: "arrow.triangle.2.circlepath")
                        Button("Пересобрать меню") { Task { await act { try await regenerate() } } }
                    }
                }
                Section("За день") {
                    MacroRow(title: "Калории", value: plan.totals.kcal, target: plan.target.kcal, unit: "ккал")
                    MacroRow(title: "Белки", value: plan.totals.protein, target: plan.target.protein, unit: "г")
                    MacroRow(title: "Жиры", value: plan.totals.fat, target: plan.target.fat, unit: "г")
                    MacroRow(title: "Углеводы", value: plan.totals.carbs, target: plan.target.carbs, unit: "г")
                }
                ForEach(plan.meal_types, id: \.self) { meal in
                    slot(meal, plan: plan)
                }
                Section {
                    Button("Подогнать оставшиеся порции") { Task { await act { try await post("refit") } } }
                    Button("Пересобрать меню") { Task { await act { try await regenerate() } } }
                } footer: {
                    Text("Пересборка заменит блюда, кроме закреплённых и съеденных.")
                }
            } else if loading {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
        }
        .refreshable { await load() }
        .task(id: APIDates.day(date)) { await load() }
        .sheet(item: $replacing) { item in
            AlternativesSheet(date: date, item: item) { newPlan in plan = newPlan }
        }
        .sheet(item: $eating) { item in
            EatSheet(date: date, item: item) { newPlan in plan = newPlan }
                .presentationDetents([.medium])
        }
    }

    @ViewBuilder
    private func slot(_ meal: String, plan: MealPlan) -> some View {
        let title = MealType(rawValue: meal)?.title ?? meal
        Section(title) {
            if let item = plan.item(for: meal) {
                NavigationLink(value: RecipeSummary(id: item.recipe_id, name: item.name, photo_url: item.photo_url,
                                                    cook_minutes: nil, complexity: nil, meal_types: nil,
                                                    portion_grams: nil, per_portion: nil)) {
                    HStack(spacing: 12) {
                        if let photo = item.photo_url, let url = URL(string: photo) {
                            AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.1) }
                                .frame(width: 56, height: 56).clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                            Text("\(item.grams.formatted(.number.precision(.fractionLength(0)))) г · \(item.nutrition.kcal.formatted(.number.precision(.fractionLength(0)))) ккал")
                                .font(.footnote).foregroundStyle(.secondary)
                            HStack(spacing: 6) {
                                if item.eaten { tag("Съедено", .green) }
                                if item.locked { tag("Закреплено", .blue) }
                                if item.unavailable { tag("Недоступно", .orange) }
                            }
                        }
                    }
                }
                if !item.eaten {
                    HStack {
                        Button("Съел") { eating = item }.buttonStyle(.borderedProminent)
                        Button("Заменить") { replacing = item }.buttonStyle(.bordered)
                        Spacer()
                        Button {
                            Task { await act { try await update(meal, PlanItemUpdate(locked: !item.locked)) } }
                        } label: {
                            Image(systemName: item.locked ? "lock.fill" : "lock.open")
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(item.locked ? "Открепить" : "Закрепить")
                    }
                }
            } else {
                Text("Не нашлось подходящих рецептов — проверьте ограничения в питании.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func tag(_ text: String, _ color: Color) -> some View {
        Text(text).font(.caption2.weight(.semibold)).padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule()).foregroundStyle(color)
    }

    private var day: String { APIDates.day(date) }

    private func load() async {
        loading = true
        defer { loading = false }
        await act { plan = try await session.api.send(Endpoint<MealPlan>.get("/api/v1/meal-plans/\(day)")) }
    }

    private func regenerate() async throws {
        try await post("regenerate")
    }

    private func post(_ action: String) async throws {
        plan = try await session.api.send(Endpoint<MealPlan>.post("/api/v1/meal-plans/\(day)/\(action)", body: [String: String]()))
    }

    private func update(_ meal: String, _ change: PlanItemUpdate) async throws {
        plan = try await session.api.send(Endpoint<MealPlan>.put("/api/v1/meal-plans/\(day)/items/\(meal)", body: change))
    }

    /// Одна обработка ошибок на все действия: «нет нормы» — подсказка, а не ошибка.
    private func act(_ body: () async throws -> Void) async {
        do {
            try await body()
            errorText = nil
            missing = nil
        } catch is CancellationError {
            return
        } catch APIError.server(status: 409, code: "target_missing", _) {
            plan = nil
            missing = ["profile", "weight"]
        } catch {
            errorText = error.userMessage
        }
    }
}

struct AlternativesSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let date: Date
    let item: MealPlanItem
    let onPlan: (MealPlan) -> Void

    @State private var options: [Alternative]?
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            List {
                if let errorText { Text(errorText).foregroundStyle(.red) }
                if let options {
                    if options.isEmpty { Text("Других подходящих блюд нет.").foregroundStyle(.secondary) }
                    ForEach(options) { option in
                        Button {
                            Task { await choose(option) }
                        } label: {
                            VStack(alignment: .leading) {
                                Text(option.name).foregroundStyle(.primary)
                                Text("\(option.grams.formatted(.number.precision(.fractionLength(0)))) г · \(option.nutrition.kcal.formatted(.number.precision(.fractionLength(0)))) ккал · Б \(option.nutrition.protein.formatted(.number.precision(.fractionLength(0))))")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Заменить: \(item.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } } }
            .task {
                do {
                    options = try await session.api.send(Endpoint<AlternativesResponse>.get(
                        "/api/v1/meal-plans/\(APIDates.day(date))/items/\(item.meal_type)/alternatives")).items
                } catch {
                    errorText = error.userMessage
                    options = []
                }
            }
        }
    }

    private func choose(_ option: Alternative) async {
        do {
            let plan = try await session.api.send(Endpoint<MealPlan>.put(
                "/api/v1/meal-plans/\(APIDates.day(date))/items/\(item.meal_type)",
                body: PlanItemUpdate(recipe_id: option.recipe_id)))
            onPlan(plan)
            dismiss()
        } catch {
            errorText = error.userMessage
        }
    }
}

struct EatSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let date: Date
    let item: MealPlanItem
    let onPlan: (MealPlan) -> Void

    @State private var grams: Double?
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(item.name).font(.headline)
                    HStack {
                        TextField("Граммы", value: $grams, format: .number.precision(.fractionLength(0)))
                            .keyboardType(.numberPad)
                        Text("г").foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Блюдо запишется в дневник. Остальные порции дня можно потом подогнать.")
                }
                if let errorText { Text(errorText).foregroundStyle(.red) }
            }
            .navigationTitle("Съел")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Записать") { Task { await eat() } }.disabled((grams ?? 0) <= 0)
                }
            }
            .onAppear { grams = item.grams }
        }
    }

    private func eat() async {
        do {
            let isToday = Calendar.current.isDateInToday(date)
            let result = try await session.api.send(Endpoint<EatResult>.post(
                "/api/v1/meal-plans/\(APIDates.day(date))/items/\(item.meal_type)/eat",
                body: EatRequest(grams: grams, time: isToday ? APIDates.time(Date()) : nil)))
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if let eaten = result.plan.item(for: item.meal_type) {
                let k = (eaten.eaten_grams ?? eaten.grams) / max(eaten.grams, 1)
                await HealthService.shared.saveNutrition(
                    entryID: result.entry_id, day: date, time: isToday ? APIDates.time(Date()) : "12:00",
                    macros: Macros(calories: eaten.nutrition.kcal * k, protein: eaten.nutrition.protein * k,
                                   fat: eaten.nutrition.fat * k, carbs: eaten.nutrition.carbs * k),
                    name: eaten.name)
            }
            onPlan(result.plan)
            dismiss()
        } catch {
            errorText = error.userMessage
        }
    }
}

// MARK: - Рецепты

struct RecipesListView: View {
    @Environment(SessionStore.self) private var session
    @State private var query = ""
    @State private var meal: MealType?
    @State private var recipes: [RecipeSummary] = []
    @State private var total = 0
    @State private var errorText: String?

    var body: some View {
        List {
            Section {
                Picker("Приём пищи", selection: $meal) {
                    Text("Любой").tag(MealType?.none)
                    ForEach(MealType.allCases) { Text($0.title).tag(MealType?.some($0)) }
                }
            }
            if let errorText { Text(errorText).foregroundStyle(.red) }
            ForEach(recipes) { recipe in
                NavigationLink(value: recipe) {
                    HStack(spacing: 12) {
                        if let photo = recipe.photo_url, let url = URL(string: photo) {
                            AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.1) }
                                .frame(width: 56, height: 56).clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(recipe.name)
                            if let p = recipe.per_portion {
                                Text("\(p.kcal.formatted(.number.precision(.fractionLength(0)))) ккал · \(recipe.cook_minutes.map { "\($0) мин" } ?? "")")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if recipes.count < total {
                Button("Показать ещё") { Task { await load(reset: false) } }
            }
        }
        .searchable(text: $query, prompt: "Название блюда")
        .task(id: "\(query)|\(meal?.rawValue ?? "")") {
            try? await Task.sleep(for: .milliseconds(300))
            await load(reset: true)
        }
    }

    private func load(reset: Bool) async {
        let page = reset ? 1 : recipes.count / 20 + 1
        var q = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "page_size", value: "20")]
        if !query.isEmpty { q.append(URLQueryItem(name: "q", value: query)) }
        if let meal { q.append(URLQueryItem(name: "meal_type", value: meal.rawValue)) }
        do {
            let result = try await session.api.send(Endpoint<RecipesPage>.get("/api/v1/recipes", query: q))
            recipes = reset ? result.items : recipes + result.items
            total = result.total
            errorText = nil
        } catch is CancellationError {
            return
        } catch {
            errorText = error.userMessage
        }
    }
}

struct RecipeView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let recipeID: String

    @State private var recipe: Loadable<RecipeVersion> = .loading

    var body: some View {
        Group {
            switch recipe {
            case .loading:
                ProgressView()
            case let .failed(message):
                ErrorRetryView(message: message) { Task { await load() } }
            case let .loaded(r):
                List {
                    if let photo = r.photo_url, let url = URL(string: photo) {
                        AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Color.secondary.opacity(0.1).frame(height: 200) }
                            .listRowInsets(EdgeInsets())
                    }
                    Section {
                        Text(r.name).font(.title2.weight(.bold))
                        if let d = r.description, !d.isEmpty { Text(d).foregroundStyle(.secondary) }
                        if let p = r.per_portion {
                            Text("Порция \(r.portion_grams.map { "\(Int($0)) г" } ?? ""): \(Int(p.kcal)) ккал · Б \(Int(p.protein)) · Ж \(Int(p.fat)) · У \(Int(p.carbs))")
                                .font(.footnote)
                        }
                        if let minutes = r.cook_minutes { Label("\(minutes) мин", systemImage: "clock").font(.footnote) }
                    }
                    Section("Ингредиенты") {
                        ForEach(r.ingredients) { i in
                            HStack {
                                Text(i.title)
                                Spacer()
                                Text(i.to_taste ? "по вкусу" : (i.display_quantity ?? i.grams.map { "\(Int($0)) г" } ?? ""))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section("Приготовление") {
                        ForEach(r.steps) { step in
                            HStack(alignment: .top) {
                                Text("\(step.position).").fontWeight(.semibold)
                                Text(step.text)
                            }
                        }
                    }
                    Section {
                        Button("Не предлагать это блюдо", role: .destructive) { Task { await reject() } }
                    }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            recipe = .loaded(try await session.api.send(Endpoint<RecipeVersion>.get("/api/v1/recipes/\(recipeID)")))
        } catch is CancellationError {
            return
        } catch {
            recipe = .failed(error.userMessage)
        }
    }

    private func reject() async {
        _ = try? await session.api.send(Endpoint<Empty>.post("/api/v1/recipes/\(recipeID)/reject", body: [String: String]()))
        dismiss()
    }
}

// MARK: - Список покупок и настройки меню

struct ShoppingListView: View {
    @Environment(SessionStore.self) private var session
    @State private var list: ShoppingList?
    @State private var errorText: String?
    @AppStorage("shopping.bought") private var boughtRaw = ""

    private var bought: Set<String> { Set(boughtRaw.split(separator: ",").map(String.init)) }

    var body: some View {
        List {
            if let errorText { Text(errorText).foregroundStyle(.red) }
            if let list {
                if !list.has_plans {
                    Text("На ближайшие дни меню не собрано. Откройте «План», чтобы его собрать.").foregroundStyle(.secondary)
                }
                ForEach(list.departments) { department in
                    Section(department.name) {
                        ForEach(department.items) { item in
                            Button {
                                toggle(item.food_id)
                            } label: {
                                HStack {
                                    Image(systemName: bought.contains(item.food_id) ? "checkmark.circle.fill" : "circle")
                                    Text(item.name).strikethrough(bought.contains(item.food_id))
                                    Spacer()
                                    Text(item.quantity_text).foregroundStyle(.secondary)
                                }
                            }
                            .foregroundStyle(.primary)
                        }
                    }
                }
                if !list.at_home.isEmpty {
                    Section("Обычно есть дома") { Text(list.at_home.joined(separator: ", ")) }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Список покупок")
        .toolbar {
            if let list {
                ToolbarItem(placement: .primaryAction) {
                    ShareLink(item: text(list)) { Image(systemName: "square.and.arrow.up") }
                }
            }
        }
        .task {
            do {
                list = try await session.api.send(Endpoint<ShoppingList>.get("/api/v1/shopping-list"))
            } catch {
                errorText = error.userMessage
            }
        }
    }

    private func toggle(_ id: String) {
        var set = bought
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
        boughtRaw = set.sorted().joined(separator: ",")
    }

    private func text(_ list: ShoppingList) -> String {
        list.departments.map { d in
            ([d.name + ":"] + d.items.map { "— \($0.name), \($0.quantity_text)" }).joined(separator: "\n")
        }.joined(separator: "\n\n")
    }
}

struct MealPlanSettingsView: View {
    @Environment(SessionStore.self) private var session
    @State private var selected: Set<String> = []
    @State private var message: String?

    var body: some View {
        Form {
            Section {
                ForEach(MealType.allCases) { meal in
                    Toggle(meal.title, isOn: Binding(
                        get: { selected.contains(meal.rawValue) },
                        set: { if $0 { selected.insert(meal.rawValue) } else if selected.count > 1 { selected.remove(meal.rawValue) } }))
                }
            } footer: {
                Text("Новые настройки применятся при следующей пересборке меню.")
            }
            Button("Сохранить") {
                Task {
                    let order = MealType.allCases.map(\.rawValue).filter(selected.contains)
                    _ = try? await session.api.send(Endpoint<MealPlanSettings>.put("/api/v1/meal-plan-settings", body: MealPlanSettings(meal_types: order)))
                    message = "Сохранено."
                }
            }
            if let message { Text(message).foregroundStyle(.green) }
        }
        .navigationTitle("Приёмы пищи")
        .task {
            if let s = try? await session.api.send(Endpoint<MealPlanSettings>.get("/api/v1/meal-plan-settings")) {
                selected = Set(s.meal_types)
            }
        }
    }
}
