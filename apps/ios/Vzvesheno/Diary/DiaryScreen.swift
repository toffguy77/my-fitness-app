import Client
import DesignSystem
import Navigation
import SwiftUI

/// «Дневник» клиента: модель из `AppModel`, лист записи, правка, отмена удаления.
struct DiaryScreen: View {
    @Environment(AppModel.self) private var model
    let offline: Bool

    @State private var tab = DiaryTab.ration
    @State private var editing: FoodEntry?
    @State private var pickingDate = false
    @State private var nutrientPath: NutrientRecommendation?
    @State private var configuring = false
    @State private var addingCustom = false

    var body: some View {
        ScrollView {
            if let diary = model.diary {
                VStack(spacing: DS.Space.s3) {
                    DiaryHeader(state: diary.state, tab: $tab, actions: actions(diary))
                    if offline {
                        OfflineBanner().accessibilityIdentifier("banner.offline")
                    }
                    switch tab {
                    case .ration:
                        DiaryRationContent(state: diary.state, actions: actions(diary))
                    case .nutrients:
                        if let nutrients = model.nutrients {
                            NutrientsContent(answer: nutrients.answer, error: nutrients.error,
                                             onOpen: { nutrientPath = $0 }, onConfigure: { configuring = true },
                                             onAddCustom: { addingCustom = true })
                                .task { if nutrients.answer == nil { await nutrients.load() } }
                        }
                    }
                }
                .padding(.horizontal, DS.Space.screenX)
                .padding(.top, DS.Space.s2)
                .padding(.bottom, DS.Space.s6)
            }
        }
        .background(DS.Color.bgCanvas)
        .refreshable {
            await model.diary?.load()
            if tab == .nutrients { await model.nutrients?.load() }
        }
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("screen.diary")
        // Не overlay: прокрутка уходит под панель «Записать еду», и
        // «Отменить» оказался бы под ней.
        .safeAreaInset(edge: .bottom, spacing: 0) { undoBanner }
        .sheet(item: $editing) { entry in
            EntryEditorSheet(entry: entry, today: model.diary?.today ?? entry.date) { action in
                Task { await handle(action) }
            }
        }
        .sheet(isPresented: $pickingDate) { datePicker }
        .sheet(isPresented: $configuring) { if let nutrients = model.nutrients { NutrientsConfigureSheet(nutrients: nutrients) } }
        .sheet(isPresented: $addingCustom) { if let nutrients = model.nutrients { CustomRecommendationSheet(nutrients: nutrients) } }
        .navigationDestination(item: $nutrientPath) { item in
            if let nutrients = model.nutrients { NutrientDetailScreen(nutrients: nutrients, item: item) }
        }
        .alert("Дневник", isPresented: Binding(get: { model.diary?.notice != nil }, set: { if !$0 { model.diary?.notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.diary?.notice ?? "")
        }
    }

    private func actions(_ diary: DiaryModel) -> DiaryActions {
        DiaryActions(
            previousDay: { Task { await diary.shift(days: -1) } },
            nextDay: { Task { await diary.shift(days: 1) } },
            pickDate: { pickingDate = true },
            addTo: { meal in model.openFoodLog(.search, meal: meal, date: diary.selected) },
            edit: { entry in editing = entry },
            delete: { entry in Task { await diary.delete(entry) } },
            repeatToday: { entry in Task { await diary.repeatToday(entry) } },
            saveAsOwn: { entry in Task { await diary.saveAsOwn(entry) } },
            water: { delta in Task { await diary.changeWater(by: delta) } }
        )
    }

    @ViewBuilder
    private var undoBanner: some View {
        if let deletion = model.diary?.deletion {
            HStack {
                Text("«\(deletion.entry.foodName)» удалено")
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.coachFg)
                    .lineLimit(1)
                Spacer()
                Button("Отменить") { model.diary?.undoDelete() }
                    .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout).weight(.semibold))
                    .foregroundStyle(DS.Color.coachFg)
                    .frame(minHeight: DS.Size.touch)
                    .accessibilityIdentifier("diary.undo")
            }
            .padding(.horizontal, DS.Space.s4)
            .background(Capsule().fill(DS.Color.coachBg))
            .padding(.horizontal, DS.Space.s4)
            .padding(.bottom, DS.Space.s2)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("diary.undoBanner")
        }
    }

    private var datePicker: some View {
        NavigationStack {
            DatePicker("Дата", selection: Binding(
                get: { model.diary.flatMap { $0.calendar.date($0.selected) } ?? Date() },
                set: { date in
                    pickingDate = false
                    if let diary = model.diary { Task { await diary.select(diary.calendar.key(date)) } }
                }), in: ...Date(), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .tint(DS.Color.primaryDefault)
                .environment(\.locale, Locale(identifier: "ru_RU"))
                .padding()
                .navigationTitle("Выберите день")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { pickingDate = false } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func handle(_ action: EntryEditorSheet.Action) async {
        guard let diary = model.diary else { return }
        switch action {
        case let .save(entry): await diary.update(entry)
        case let .delete(entry): await diary.delete(entry)
        case let .repeatToday(entry): await diary.repeatToday(entry)
        case let .saveAsOwn(entry): await diary.saveAsOwn(entry)
        }
    }
}

/// Правка записи: приём, порция, время, название и КБЖУ (`PUT /entries/:id`).
struct EntryEditorSheet: View {
    enum Action {
        case save(FoodEntry)
        case delete(FoodEntry)
        case repeatToday(FoodEntry)
        case saveAsOwn(FoodEntry)
    }

    let entry: FoodEntry
    let today: String
    let onAction: (Action) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft: FoodEntry
    @State private var amount: String
    @State private var time: Date
    @State private var calories: String
    @State private var protein: String
    @State private var fat: String
    @State private var carbs: String

    init(entry: FoodEntry, today: String, onAction: @escaping (Action) -> Void) {
        self.entry = entry
        self.today = today
        self.onAction = onAction
        _draft = State(initialValue: entry)
        _amount = State(initialValue: NumberText.oneDecimal(entry.portionAmount))
        let parts = entry.time.split(separator: ":").compactMap { Int($0) }
        let time = Calendar.current.date(bySettingHour: parts.first ?? 12, minute: parts.count > 1 ? parts[1] : 0, second: 0,
                                         of: Date()) ?? Date()
        _time = State(initialValue: time)
        _calories = State(initialValue: NumberText.oneDecimal(entry.nutrition.calories))
        _protein = State(initialValue: NumberText.oneDecimal(entry.nutrition.protein))
        _fat = State(initialValue: NumberText.oneDecimal(entry.nutrition.fat))
        _carbs = State(initialValue: NumberText.oneDecimal(entry.nutrition.carbs))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Название", text: $draft.foodName).accessibilityIdentifier("editor.name")
                    Picker("Приём пищи", selection: $draft.mealType) {
                        ForEach(MealType.allCases) { Text($0.title).tag($0) }
                    }
                    HStack {
                        TextField("Порция", text: $amount)
                            .keyboardType(.decimalPad)
                            .accessibilityIdentifier("editor.amount")
                            .onChange(of: amount) { _, text in rescale(text) }
                        Picker("", selection: $draft.portionType) {
                            ForEach(PortionUnit.allCases) { Text($0.short).tag($0) }
                        }
                        .labelsHidden()
                    }
                    DatePicker("Время", selection: $time, displayedComponents: .hourAndMinute)
                        .environment(\.locale, Locale(identifier: "ru_RU"))
                }
                Section("КБЖУ порции") {
                    number("Калории, ккал", $calories)
                    number("Белки, г", $protein)
                    number("Жиры, г", $fat)
                    number("Углеводы, г", $carbs)
                }
                Section {
                    if entry.date != today {
                        Button("Повторить сегодня") { onAction(.repeatToday(entry)); dismiss() }
                            .accessibilityIdentifier("editor.repeat")
                    }
                    Button("Сохранить как своё") { onAction(.saveAsOwn(entry)); dismiss() }
                        .disabled(entry.id.hasPrefix("local-"))
                        .accessibilityIdentifier("editor.saveAsOwn")
                    Button("Удалить", role: .destructive) { onAction(.delete(entry)); dismiss() }
                        .accessibilityIdentifier("editor.delete")
                }
            }
            .tint(DS.Color.primaryDefault)
            .navigationTitle("Запись")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        if let result { onAction(.save(result)); dismiss() }
                    }
                    .disabled(result == nil)
                    .accessibilityIdentifier("editor.save")
                }
            }
        }
    }

    private func number(_ title: String, _ value: Binding<String>) -> some View {
        LabeledContent(title) {
            TextField("0", text: value).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
        }
    }

    /// Новая порция — КБЖУ пересчитаны из «на 100 г» записи.
    private func rescale(_ text: String) {
        guard let value = Self.parse(text), value > 0 else { return }
        let per100 = entry.per100
        let nutrition = Portion(unit: draft.portionType, amount: value).nutrition(per100: per100)
        calories = NumberText.oneDecimal(nutrition.calories)
        protein = NumberText.oneDecimal(nutrition.protein)
        fat = NumberText.oneDecimal(nutrition.fat)
        carbs = NumberText.oneDecimal(nutrition.carbs)
    }

    private var result: FoodEntry? {
        guard let value = Self.parse(amount), draft.portionType.range.contains(value) || draft.portionType != .portion && value > 0,
              let kcal = Self.parse(calories), kcal >= 0,
              !draft.foodName.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        var updated = draft
        updated.portionAmount = value
        let parts = Calendar.current.dateComponents([.hour, .minute], from: time)
        updated.time = String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
        updated.nutrition = Nutrition(calories: kcal, protein: Self.parse(protein) ?? 0, fat: Self.parse(fat) ?? 0,
                                      carbs: Self.parse(carbs) ?? 0)
        return updated
    }

    static func parse(_ text: String) -> Double? {
        Double(text.replacingOccurrences(of: "\u{00A0}", with: "").replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespaces))
    }
}
