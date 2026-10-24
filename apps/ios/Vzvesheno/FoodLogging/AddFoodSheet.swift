import API
import Client
import DesignSystem
import SwiftUI
import UIKit

/// Лист «Записать еду» (`ios-food-logging`): способ и приём из запроса —
/// аксессуара, дневника, ссылки `?add=`, интента. Добавленное уходит в
/// дневник через очередь и видно сразу.
struct AddFoodSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let request: FoodLogRequest

    @State private var method: FoodLogMethod
    @State private var meal: MealType
    @State private var search: FoodSearchModel?
    @State private var selected: FoodItem?
    @State private var portion = Portion()
    @State private var photo: (result: RecognitionResult, image: UIImage)?
    @State private var manualCode: String?
    @State private var added = 0

    init(request: FoodLogRequest) {
        self.request = request
        _method = State(initialValue: request.method)
        _meal = State(initialValue: request.meal)
    }

    var body: some View {
        Group {
            if let photo {
                PhotoResultContent(
                    result: photo.result, meal: meal, photoCaption: "\(meal.title) · \(timeText)", photo: photo.image,
                    onRetake: { self.photo = nil },
                    onStep: { id, direction in
                        guard var current = self.photo else { return }
                        let item = current.result.items.first { $0.id == id }
                        current.result.setGrams(id, item?.stepped(direction))
                        self.photo = current
                    },
                    onApply: { id in self.photo?.result.applyEstimate(id) },
                    onFind: { item in
                        self.photo = nil
                        method = .search
                        search?.query = item.food.name
                    },
                    onAdd: { if let result = self.photo?.result { Task { await addRecognized(result) } } })
                .background(DS.Color.bgCanvas)
            } else {
                ScrollView {
                    AddFoodContent(method: $method, meal: $meal, onCancel: { dismiss() }, content: {
                        methodBody
                    })
                    .padding(.bottom, DS.Space.s6)
                }
                .scrollDismissesKeyboard(.interactively)
                .background(DS.Color.bgCanvas)
            }
        }
        .sensoryFeedback(.success, trigger: added)
        // Без `.contain` идентификатор контейнера достаётся каждому элементу внутри.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("sheet.addFood")
        .task {
            if search == nil {
                let model = FoodSearchModel(api: self.model.api)
                search = model
                await model.loadSuggestions()
            }
            #if DEBUG
            await prepareStoreShot()
            #endif
        }
        .onChange(of: method) { _, _ in selected = nil }
    }

    /// Поиск открыт сам — клавиатура сразу. На снимке для App Store её нет:
    /// она закрыла бы выдачу и порцию.
    private var focusesSearch: Bool {
        #if DEBUG
        if StoreShot.current != nil { return false }
        #endif
        return request.method == .search
    }

    private var timeText: String {
        ClockText.hhmm(Date(), calendar: model.diary?.calendar ?? DayCalendar(timeZone: model.profileTimeZone))
    }

    @ViewBuilder
    private var methodBody: some View {
        switch method {
        case .search:
            if let search {
                @Bindable var search = search
                FoodSearchContent(
                    query: $search.query, showsSuggestions: search.showsSuggestions, results: search.results,
                    recent: search.recent, favorites: search.favorites, searching: search.searching, error: search.error,
                    searchedFor: search.searchedFor, isFavorite: search.isFavorite, selected: selected, portion: $portion,
                    meal: meal, focusOnAppear: focusesSearch,
                    onSelect: { item in
                        selected = item
                        portion = Portion(unit: item.defaultUnit, amount: item.defaultUnit.quick[0],
                                          servingGrams: item.servingSize)
                    },
                    onStar: { item in Task { await search.toggleFavorite(item) } },
                    onAdd: { if let selected { Task { await add([EntryDraft(food: selected, meal: meal, date: request.date,
                                                                                 portion: portion)]) } } })
            }
        case .barcode:
            BarcodeMethodView(
                lookup: BarcodeLookupService(api: model.api, cache: model.barcodeCache), meal: meal,
                onClose: { dismiss() },
                onAdd: { food, portion in
                    Task { await add([EntryDraft(food: food, meal: meal, date: request.date, portion: portion)]) }
                },
                onNotFound: { code in
                    manualCode = code
                    method = .manual
                })
            .frame(height: 560)
        case .photo:
            PhotoMethodView(meal: meal, api: model.api, testPhoto: model.usesTestPhoto,
                            onResult: { result, image in photo = (result, image) },
                            onSearch: { method = .search }, onBarcode: { method = .barcode })
        case .manual:
            ManualFoodView(service: ManualFoodService(api: model.api, cache: model.barcodeCache), barcode: manualCode,
                           selected: $selected, portion: $portion, meal: meal) {
                if let selected {
                    Task { await add([EntryDraft(food: selected, meal: meal, date: request.date, portion: portion)]) }
                }
            }
        }
    }

    private func add(_ drafts: [EntryDraft]) async {
        guard let diary = model.diary else { return }
        await diary.add(drafts)
        for draft in drafts {
            model.track(ProductEvent.foodEntryCreated, ["meal_type": draft.meal.rawValue])
        }
        added += 1
        dismiss()
    }

    private func addRecognized(_ result: RecognitionResult) async {
        let stamp = Int64(Date().timeIntervalSince1970 * 1000)
        await add(result.drafts(meal: meal, date: request.date, stamp: stamp))
    }
}

#if DEBUG
extension AddFoodSheet {
    /// Снимок для App Store (`StoreShot`): выбранная порция в поиске или
    /// результат фото тарелки.
    private func prepareStoreShot() async {
        switch StoreShot.current {
        case .addFood?:
            guard let search, selected == nil else { return }
            search.query = StoreShot.searchQuery
            await search.waitForSearch()
            guard let item = search.results.first else { return }
            selected = item
            portion = Portion(unit: item.defaultUnit, amount: StoreShot.searchGrams, servingGrams: item.servingSize)
        case .photoResult?:
            guard photo == nil, let data = StoreShot.media("plate.jpg"), let image = UIImage(data: data),
                  let jpeg = PhotoPreparation.jpeg(from: image),
                  let recognition = try? await RecognitionAPI.recognize(jpeg: jpeg, api: model.api) else { return }
            var result = RecognitionResult(recognition: recognition)
            // Вес первой позиции уже подтверждён — как на макете PhotoResult.png.
            if let first = result.items.first { result.applyEstimate(first.id) }
            photo = (result, image)
        default:
            break
        }
    }
}
#endif

/// Способ «Вручную»: свой продукт (`POST /user-foods`), затем порция.
struct ManualFoodView: View {
    let service: ManualFoodService
    /// Код, который сервер не знает: подставлен в название.
    let barcode: String?
    @Binding var selected: FoodItem?
    @Binding var portion: Portion
    let meal: MealType
    let onAdd: () -> Void

    @State private var name = ""
    @State private var brand = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var fat = ""
    @State private var carbs = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            if let barcode {
                Text("Продукта с кодом \(barcode) нет в базе. Добавьте его — следующий скан этого кода на этом телефоне сразу его найдёт.")
                    .dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                    .accessibilityIdentifier("manual.barcode")
            }
            if let selected {
                PortionCard(food: selected, portion: $portion, meal: meal, onAdd: onAdd)
            } else {
                DSField(title: "Название", text: $name, placeholder: "например, сырники домашние")
                    .accessibilityIdentifier("manual.name")
                DSField(title: "Производитель (необязательно)", text: $brand)
                Text("На 100 г").dsText(DS.Typography.overline).foregroundStyle(DS.Color.fgSubtle)
                HStack(spacing: DS.Space.s2) {
                    DSField(title: "Ккал", text: $calories, keyboard: .decimalPad).accessibilityIdentifier("manual.kcal")
                    DSField(title: "Белки", text: $protein, keyboard: .decimalPad)
                }
                HStack(spacing: DS.Space.s2) {
                    DSField(title: "Жиры", text: $fat, keyboard: .decimalPad)
                    DSField(title: "Углеводы", text: $carbs, keyboard: .decimalPad)
                }
                if let error {
                    Text(error).dsText(DS.Typography.caption).foregroundStyle(DS.Color.statusDangerFg)
                }
                Button(saving ? "Сохраняем…" : "Дальше — порция") { Task { await save() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .disabled(saving || form == nil)
                    .accessibilityIdentifier("manual.next")
                Text("Продукт сохранится в ваших — в следующий раз его найдёт поиск.")
                    .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
            }
        }
    }

    private var form: (String, Nutrition)? {
        ManualFoodForm.validate(name: name, calories: calories, protein: protein, fat: fat, carbs: carbs)
    }

    private func save() async {
        guard let (title, per100) = form else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let body = NewUserFoodBody(name: title, brand: brand.trimmingCharacters(in: .whitespaces).nilIfEmpty, per100: per100)
            selected = try await service.create(body, barcode: barcode)
            portion = Portion()
        } catch APIError.network {
            error = "Нет сети: свой продукт сохраняется на сервере. Попробуйте, когда сеть появится."
        } catch {
            self.error = "Не получилось сохранить продукт. Проверьте значения."
        }
    }
}
