import SwiftUI

struct DiaryView: View {
    @Environment(SessionStore.self) private var session

    @State private var date = Date()
    @State private var content: Loadable<EntriesResponse> = .loading
    @State private var addingTo: MealType?
    @State private var deleteError: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    DayPicker(date: $date)
                }
                switch content {
                case .loading:
                    Section { HStack { Spacer(); ProgressView(); Spacer() } }
                case let .failed(message):
                    Section { ErrorRetryView(message: message) { Task { await load() } } }
                case let .loaded(response):
                    Section {
                        LabeledContent("Итого", value: "\(response.dailyTotals.calories.formatted(.number.precision(.fractionLength(0)))) ккал")
                        Text(macroLine(response.dailyTotals))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(MealType.allCases) { meal in
                        mealSection(meal, entries: response.entries(for: meal))
                    }
                }
            }
            .navigationTitle("Дневник")
            .refreshable { await load() }
            .task(id: APIDates.day(date)) { await load() }
            .sheet(item: $addingTo) { meal in
                AddFoodView(meal: meal, date: date) {
                    Task { await load() }
                }
            }
            .alert("Не удалось удалить", isPresented: Binding(
                get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(deleteError ?? "")
            }
        }
    }

    private func mealSection(_ meal: MealType, entries: [FoodEntry]) -> some View {
        Section {
            ForEach(entries) { entry in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(entry.foodName)
                        Spacer()
                        Text("\(entry.nutrition.calories.formatted(.number.precision(.fractionLength(0)))) ккал")
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    Text("\(entry.portionAmount.formatted(.number.precision(.fractionLength(0...1)))) \(unit(entry.portionType)) · \(entry.time)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .onDelete { offsets in
                let doomed = offsets.map { entries[$0] }
                Task { await delete(doomed) }
            }
            Button {
                addingTo = meal
            } label: {
                Label("Добавить", systemImage: "plus")
            }
            .accessibilityIdentifier("diary.add.\(meal.rawValue)")
        } header: {
            Text(meal.title)
        }
    }

    private func unit(_ portionType: String) -> String {
        switch portionType {
        case "milliliters": return "мл"
        case "portion": return "порц."
        default: return "г"
        }
    }

    private func macroLine(_ m: Macros) -> String {
        let f = FloatingPointFormatStyle<Double>.number.precision(.fractionLength(0))
        return "Б \(m.protein.formatted(f)) · Ж \(m.fat.formatted(f)) · У \(m.carbs.formatted(f))"
    }

    private func load() async {
        if content.value == nil { content = .loading }
        do {
            let response = try await session.api.send(Endpoint<EntriesResponse>.get(
                "/api/v1/food-tracker/entries", query: [URLQueryItem(name: "date", value: APIDates.day(date))]))
            content = .loaded(response)
        } catch is CancellationError {
            return
        } catch {
            content = .failed(error.userMessage)
        }
    }

    private func delete(_ entries: [FoodEntry]) async {
        for entry in entries {
            do {
                _ = try await session.api.send(Endpoint<DeleteResult>.delete("/api/v1/food-tracker/entries/\(entry.id)"))
                await HealthService.shared.deleteNutrition(entryID: entry.id)
            } catch {
                deleteError = error.userMessage
            }
        }
        await load()
    }
}

/// Поиск продукта и ввод порции.
struct AddFoodView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let meal: MealType
    let date: Date
    let onAdded: () -> Void

    @State private var query = ""
    @State private var results: [FoodItem] = []
    @State private var searching = false
    @State private var searchError: String?
    @State private var selected: FoodItem?

    var body: some View {
        NavigationStack {
            List {
                if let searchError {
                    Text(searchError).foregroundStyle(.red)
                }
                if query.count < 3 {
                    Text("Введите хотя бы три буквы названия.")
                        .foregroundStyle(.secondary)
                } else if !searching && results.isEmpty && searchError == nil {
                    Text("Ничего не нашлось.")
                        .foregroundStyle(.secondary)
                }
                ForEach(results) { item in
                    Button {
                        selected = item
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).foregroundStyle(.primary)
                            Text(subtitle(item))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .overlay { if searching && results.isEmpty { ProgressView() } }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Продукт или блюдо")
            .task(id: query) { await search() }
            .navigationTitle(meal.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
            }
            .navigationDestination(item: $selected) { item in
                PortionView(item: item, meal: meal, date: date) {
                    onAdded()
                    dismiss()
                }
            }
        }
    }

    private func subtitle(_ item: FoodItem) -> String {
        let kcal = item.nutritionPer100.calories.formatted(.number.precision(.fractionLength(0)))
        if let brand = item.brand, !brand.isEmpty {
            return "\(brand) · \(kcal) ккал на 100 г"
        }
        return "\(kcal) ккал на 100 г"
    }

    private func search() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard text.count >= 3 else {
            results = []
            return
        }
        // Пауза, пока человек печатает: запрос на каждую букву — лишняя
        // нагрузка и мигающий список. Новая буква отменяет эту задачу.
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        searching = true
        searchError = nil
        defer { searching = false }
        do {
            let response = try await session.api.send(Endpoint<SearchResponse>.get(
                "/api/v1/food-tracker/search",
                query: [URLQueryItem(name: "q", value: text), URLQueryItem(name: "limit", value: "30")]))
            guard !Task.isCancelled else { return }
            results = response.items
        } catch is CancellationError {
            return
        } catch {
            searchError = error.userMessage
        }
    }
}

extension FoodItem: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: FoodItem, rhs: FoodItem) -> Bool { lhs.id == rhs.id }
}

struct PortionView: View {
    @Environment(SessionStore.self) private var session

    let item: FoodItem
    let meal: MealType
    let date: Date
    let onAdded: () -> Void

    @State private var grams: Double = 100
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        Form {
            Section {
                Text(item.name).font(.headline)
                if let brand = item.brand, !brand.isEmpty {
                    Text(brand).foregroundStyle(.secondary)
                }
            }
            Section("Порция") {
                HStack {
                    TextField("Граммы", value: $grams, format: .number.precision(.fractionLength(0...1)))
                        .keyboardType(.decimalPad)
                        .accessibilityIdentifier("portion.grams")
                    Text("г").foregroundStyle(.secondary)
                }
            }
            Section("В этой порции") {
                let m = scaled
                LabeledContent("Калории", value: "\(m.calories.formatted(.number.precision(.fractionLength(0)))) ккал")
                LabeledContent("Белки", value: "\(m.protein.formatted(.number.precision(.fractionLength(1)))) г")
                LabeledContent("Жиры", value: "\(m.fat.formatted(.number.precision(.fractionLength(1)))) г")
                LabeledContent("Углеводы", value: "\(m.carbs.formatted(.number.precision(.fractionLength(1)))) г")
            }
            if let errorText {
                Section { Text(errorText).foregroundStyle(.red) }
            }
            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack {
                        Spacer()
                        if saving { ProgressView() } else { Text("Записать в \(meal.title.lowercased())").fontWeight(.semibold) }
                        Spacer()
                    }
                }
                .disabled(saving || grams <= 0)
                .accessibilityIdentifier("portion.save")
            }
        }
        .navigationTitle("Порция")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Так же считает сервер: значения на 100 г × граммы / 100.
    private var scaled: Macros {
        let k = max(grams, 0) / 100
        let p = item.nutritionPer100
        return Macros(calories: p.calories * k, protein: p.protein * k, fat: p.fat * k, carbs: p.carbs * k)
    }

    private func save() async {
        saving = true
        errorText = nil
        defer { saving = false }
        let now = APIDates.time(Date())
        do {
            let entry = try await session.api.send(Endpoint<FoodEntry>.post(
                "/api/v1/food-tracker/entries",
                body: CreateEntryRequest(
                    // Идентификатор из поиска — как есть: числовой из каталога
                    // сервер сам переводит в свой (ensureFoodItemExists).
                    foodId: item.id,
                    mealType: meal,
                    portionType: "grams",
                    portionAmount: grams,
                    time: now,
                    date: APIDates.day(date))))
            await HealthService.shared.saveNutrition(entryID: entry.id, day: date, time: entry.time,
                                                     macros: entry.nutrition, name: entry.foodName)
            onAdded()
        } catch {
            errorText = error.userMessage
        }
    }
}
