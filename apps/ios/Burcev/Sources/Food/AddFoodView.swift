import SwiftUI
import PhotosUI

/// Добавление еды: поиск, штрихкод, фото блюда, свой продукт — как вкладки
/// модального окна на сайте, но с камерой телефона вместо загрузки файла.
struct AddFoodView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let meal: MealType
    let date: Date
    let onAdded: () -> Void

    enum Mode: String, CaseIterable, Identifiable {
        case search = "Поиск"
        case barcode = "Штрихкод"
        case photo = "Фото"
        case manual = "Вручную"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .search
    @State private var selected: FoodItem?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Способ", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding([.horizontal, .top])

                switch mode {
                case .search:
                    FoodSearchView(selected: $selected)
                case .barcode:
                    BarcodeView(selected: $selected)
                case .photo:
                    PhotoRecognitionView(meal: meal, date: date) { finish() }
                case .manual:
                    ManualFoodView(selected: $selected)
                }
            }
            .navigationTitle(meal.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
            }
            .navigationDestination(item: $selected) { item in
                PortionView(mode: .create(item), meal: meal, date: date) { finish() }
            }
        }
    }

    private func finish() {
        onAdded()
        dismiss()
    }
}

extension FoodItem: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: FoodItem, rhs: FoodItem) -> Bool { lhs.id == rhs.id }
}

// MARK: - Поиск, недавнее, избранное

struct FoodSearchView: View {
    @Environment(SessionStore.self) private var session
    @Binding var selected: FoodItem?

    @State private var query = ""
    @State private var results: [FoodItem] = []
    @State private var recent: [FoodItem] = []
    @State private var favorites: [FoodItem] = []
    @State private var searching = false
    @State private var searchError: String?

    var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespaces).count < 3 {
                if !favorites.isEmpty {
                    Section("Избранное") { rows(favorites) }
                }
                if !recent.isEmpty {
                    Section("Недавнее") { rows(recent) }
                }
                if favorites.isEmpty && recent.isEmpty {
                    Text("Введите хотя бы три буквы названия.")
                        .foregroundStyle(.secondary)
                }
            } else {
                if let searchError {
                    Text(searchError).foregroundStyle(.red)
                } else if !searching && results.isEmpty {
                    Text("Ничего не нашлось. Попробуйте другое название или добавьте продукт вручную.")
                        .foregroundStyle(.secondary)
                }
                rows(results)
            }
        }
        .overlay { if searching && results.isEmpty { ProgressView() } }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Продукт или блюдо")
        .task(id: query) { await search() }
        .task { await loadSuggestions() }
    }

    private func rows(_ items: [FoodItem]) -> some View {
        ForEach(items) { item in
            Button {
                selected = item
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name).foregroundStyle(.primary)
                    Text(item.subtitle).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .swipeActions(edge: .trailing) {
                if favorites.contains(item) {
                    Button("Убрать", systemImage: "star.slash") { Task { await toggleFavorite(item, on: false) } }
                } else {
                    Button("В избранное", systemImage: "star") { Task { await toggleFavorite(item, on: true) } }
                        .tint(.yellow)
                }
            }
        }
    }

    private func loadSuggestions() async {
        async let recent = try? session.api.send(Endpoint<FoodsList>.get(
            "/api/v1/food-tracker/recent", query: [URLQueryItem(name: "limit", value: "15")]))
        async let favorites = try? session.api.send(Endpoint<FoodsList>.get("/api/v1/food-tracker/favorites"))
        self.recent = await recent?.foods ?? []
        self.favorites = await favorites?.foods ?? []
    }

    private func toggleFavorite(_ item: FoodItem, on: Bool) async {
        let path = "/api/v1/food-tracker/favorites/\(item.id)"
        _ = try? await session.api.send(on
            ? Endpoint<Empty>.post(path, body: [String: String]())
            : Endpoint<Empty>.delete(path))
        await loadSuggestions()
    }

    private func search() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard text.count >= 3 else {
            results = []
            return
        }
        // Пауза, пока человек печатает: новая буква отменяет эту задачу.
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

extension FoodItem {
    var subtitle: String {
        let kcal = nutritionPer100.calories.formatted(.number.precision(.fractionLength(0)))
        if let brand, !brand.isEmpty {
            return "\(brand) · \(kcal) ккал на 100 г"
        }
        return "\(kcal) ккал на 100 г"
    }
}

// MARK: - Свой продукт

struct ManualFoodView: View {
    @Environment(SessionStore.self) private var session
    @Binding var selected: FoodItem?

    @State private var name = ""
    @State private var brand = ""
    @State private var calories: Double?
    @State private var protein: Double?
    @State private var fat: Double?
    @State private var carbs: Double?
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        Form {
            Section("Продукт") {
                TextField("Название", text: $name)
                TextField("Производитель (необязательно)", text: $brand)
            }
            Section("На 100 г") {
                number("Калории, ккал", $calories)
                number("Белки, г", $protein)
                number("Жиры, г", $fat)
                number("Углеводы, г", $carbs)
            }
            if let errorText {
                Section { Text(errorText).foregroundStyle(.red) }
            }
            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack { Spacer(); if saving { ProgressView() } else { Text("Дальше — порция").fontWeight(.semibold) }; Spacer() }
                }
                .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty || (calories ?? 0) <= 0)
            } footer: {
                Text("Продукт сохранится в ваших — в следующий раз его найдёт поиск.")
            }
        }
    }

    private func number(_ title: String, _ value: Binding<Double?>) -> some View {
        TextField(title, value: value, format: .number.precision(.fractionLength(0...1)))
            .keyboardType(.decimalPad)
    }

    private func save() async {
        saving = true
        errorText = nil
        defer { saving = false }
        do {
            let food = try await session.api.send(Endpoint<UserFood>.post(
                "/api/v1/food-tracker/user-foods",
                body: CreateUserFoodRequest(
                    name: name.trimmingCharacters(in: .whitespaces),
                    brand: brand.isEmpty ? nil : brand,
                    calories_per_100: calories ?? 0,
                    protein_per_100: protein ?? 0,
                    fat_per_100: fat ?? 0,
                    carbs_per_100: carbs ?? 0)))
            selected = food.asFoodItem
        } catch {
            errorText = error.userMessage
        }
    }
}

// MARK: - Порция: новая запись или правка

struct PortionView: View {
    enum Mode {
        case create(FoodItem)
        case edit(FoodEntry)
    }

    @Environment(SessionStore.self) private var session

    let mode: Mode
    let date: Date
    let onDone: () -> Void

    @State private var meal: MealType
    @State private var grams: Double
    @State private var saving = false
    @State private var errorText: String?

    init(mode: Mode, meal: MealType, date: Date, onDone: @escaping () -> Void) {
        self.mode = mode
        self.date = date
        self.onDone = onDone
        switch mode {
        case .create:
            _meal = State(initialValue: meal)
            _grams = State(initialValue: 100)
        case let .edit(entry):
            _meal = State(initialValue: entry.mealType)
            _grams = State(initialValue: entry.portionAmount)
        }
    }

    private var name: String {
        switch mode {
        case let .create(item): return item.name
        case let .edit(entry): return entry.foodName
        }
    }

    /// КБЖУ на 100 г. У записи их нет — восстанавливаем из итогов порции.
    private var per100: Macros {
        switch mode {
        case let .create(item):
            return item.nutritionPer100
        case let .edit(entry):
            let k = entry.portionAmount > 0 ? 100 / entry.portionAmount : 0
            let n = entry.nutrition
            return Macros(calories: n.calories * k, protein: n.protein * k, fat: n.fat * k, carbs: n.carbs * k)
        }
    }

    /// Так же считает сервер: на 100 г × граммы / 100.
    private var scaled: Macros {
        let k = max(grams, 0) / 100
        let p = per100
        return Macros(calories: p.calories * k, protein: p.protein * k, fat: p.fat * k, carbs: p.carbs * k)
    }

    var body: some View {
        Form {
            Section {
                Text(name).font(.headline)
                if case let .create(item) = mode, let brand = item.brand, !brand.isEmpty {
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
                Picker("Приём пищи", selection: $meal) {
                    ForEach(MealType.allCases) { Text($0.title).tag($0) }
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
                        if saving { ProgressView() } else { Text(isEdit ? "Сохранить" : "Записать в \(meal.title.lowercased())").fontWeight(.semibold) }
                        Spacer()
                    }
                }
                .disabled(saving || grams <= 0 || grams > 5000)
                .accessibilityIdentifier("portion.save")
            }
        }
        .navigationTitle(isEdit ? "Запись" : "Порция")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var isEdit: Bool {
        if case .edit = mode { return true }
        return false
    }

    private func save() async {
        saving = true
        errorText = nil
        defer { saving = false }
        do {
            let entry: FoodEntry
            switch mode {
            case let .create(item):
                entry = try await session.api.send(Endpoint<FoodEntry>.post(
                    "/api/v1/food-tracker/entries",
                    body: CreateEntryRequest(
                        // Идентификатор из поиска — как есть: числовой из каталога
                        // сервер сам переводит в свой (ensureFoodItemExists).
                        foodId: item.id, mealType: meal, portionType: "grams",
                        portionAmount: grams, time: APIDates.time(Date()), date: APIDates.day(date))))
            case let .edit(old):
                // Как на сайте: отправляем всё, КБЖУ — посчитанные на клиенте.
                let m = scaled
                entry = try await session.api.send(Endpoint<FoodEntry>.put(
                    "/api/v1/food-tracker/entries/\(old.id)",
                    body: UpdateEntryRequest(
                        mealType: meal, portionType: old.portionType, portionAmount: grams, time: old.time,
                        foodName: old.foodName, calories: m.calories, protein: m.protein, fat: m.fat, carbs: m.carbs)))
            }
            await HealthService.shared.saveNutrition(entryID: entry.id, day: date, time: entry.time,
                                                     macros: entry.nutrition, name: entry.foodName)
            onDone()
        } catch {
            errorText = error.userMessage
        }
    }
}
