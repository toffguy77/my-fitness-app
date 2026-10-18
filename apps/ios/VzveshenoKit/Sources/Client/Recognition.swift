import API
import Foundation

/// Уверенность распознавания: как в вебе — от 0,9 высокая, от 0,7 средняя.
public enum RecognitionConfidence: String, Sendable, Equatable {
    case high, medium, low

    public init(_ value: Double) {
        switch value {
        case 0.9...: self = .high
        case 0.7...: self = .medium
        default: self = .low
        }
    }

    public var title: String {
        switch self {
        case .high: return "Высокая"
        case .medium: return "Средняя"
        case .low: return "Низкая"
        }
    }
}

/// Позиция экрана результата: вес вводит человек, оценка — подсказка.
public struct RecognitionItem: Sendable, Equatable, Identifiable {
    public let id: Int
    public let food: RecognizedFood
    /// Вес, г; `nil` — не задан: позиция не добавляется.
    public var grams: Double?

    public init(id: Int, food: RecognizedFood, grams: Double? = nil) {
        self.id = id
        self.food = food
        self.grams = grams
    }

    public var confidence: RecognitionConfidence { RecognitionConfidence(food.confidence) }

    /// Низкая уверенность: вместо веса — «Найти».
    public var suggestsSearch: Bool { confidence == .low }

    /// «оценка 180 г».
    public var estimateText: String? {
        guard let estimate = food.estimatedWeight, estimate > 0 else { return nil }
        return "оценка \(NumberText.grouped(estimate.jsRounded)) г"
    }

    public var nutrition: Nutrition? {
        grams.map { Portion(unit: .grams, amount: $0).nutrition(per100: food.per100) }
    }

    /// «229 ккал · Б 46 · Ж 5».
    public var nutritionLine: String? {
        nutrition.map { "\(NumberText.grouped($0.kcal)) ккал · Б \($0.protein.jsRounded) · Ж \($0.fat.jsRounded)" }
    }

    /// Шаг «−»/«+» — 10 г, в пределах 1–2000.
    public func stepped(_ direction: Int) -> Double {
        let base = grams ?? food.estimatedWeight ?? 100
        return Portion.clamp(((base / 10).rounded() + Double(direction)) * 10, unit: .grams)
    }
}

/// Экран «Нашли на тарелке» (`ios-food-logging`): вес не подставляется сам,
/// «Подставить» берёт оценку, добавляются только позиции с весом — одной
/// кнопкой «Добавить N позиций в …».
public struct RecognitionResult: Sendable, Equatable {
    public var items: [RecognitionItem]
    public var dishName: String?
    public var remaining: Int?
    public var dailyLimit: Int

    public init(recognition: Recognition, dailyLimit: Int = 3) {
        items = recognition.parts.enumerated().map { RecognitionItem(id: $0.offset, food: $0.element) }
        dishName = recognition.foods.first?.name
        remaining = recognition.remaining
        self.dailyLimit = dailyLimit
    }

    public init(items: [RecognitionItem], dishName: String? = nil, remaining: Int? = nil, dailyLimit: Int = 3) {
        self.items = items
        self.dishName = dishName
        self.remaining = remaining
        self.dailyLimit = dailyLimit
    }

    /// «ещё 2 из 3 сегодня».
    public var remainingText: String? {
        remaining.map { "ещё \($0) из \(max(dailyLimit, $0)) сегодня" }
    }

    public mutating func applyEstimate(_ id: Int) {
        guard let index = items.firstIndex(where: { $0.id == id }), let estimate = items[index].food.estimatedWeight,
              estimate > 0 else { return }
        items[index].grams = Portion.clamp(estimate, unit: .grams)
    }

    public mutating func setGrams(_ id: Int, _ grams: Double?) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].grams = grams.map { Portion.clamp($0, unit: .grams) }
    }

    /// Что войдёт в «Добавить N позиций»: только позиции с весом.
    public var addable: [RecognitionItem] {
        items.filter { ($0.grams ?? 0) > 0 && !$0.suggestsSearch }
    }

    /// «Итого, если подставить оценку»: с весом — по весу, без — по оценке.
    public var estimatedTotal: Int {
        items.filter { !$0.suggestsSearch }.reduce(0.0) { sum, item in
            let grams = item.grams ?? item.food.estimatedWeight ?? 0
            return sum + Portion(unit: .grams, amount: grams).nutrition(per100: item.food.per100).calories
        }.jsRounded
    }

    /// «Добавить 2 позиции в обед»; без позиций с весом — подсказка.
    public func addTitle(meal: MealType) -> String {
        let count = addable.count
        guard count > 0 else { return "Укажите вес позиций" }
        return "Добавить \(count) \(Self.positions(count)) в \(meal.accusative)"
    }

    static func positions(_ count: Int) -> String {
        let mod10 = count % 10
        let mod100 = count % 100
        if mod10 == 1 && mod100 != 11 { return "позицию" }
        if (2...4).contains(mod10) && !(12...14).contains(mod100) { return "позиции" }
        return "позиций"
    }

    /// Записи дневника: `ai-` и все пять переопределений — по ним сервер
    /// заводит продукт в «моих».
    public func drafts(meal: MealType, date: String, stamp: Int64) -> [EntryDraft] {
        addable.map { item in
            let grams = item.grams ?? 0
            return EntryDraft(foodID: "ai-\(stamp)-\(item.id)", name: item.food.name, meal: meal, date: date,
                              portion: Portion(unit: .grams, amount: grams),
                              nutrition: Portion(unit: .grams, amount: grams).nutrition(per100: item.food.per100))
        }
    }
}

/// Отказ распознавания человеческими словами.
public enum RecognitionFailure: Equatable, Sendable {
    /// `recognition_daily_limit`: «Найти вручную» и «Штрихкод».
    case dailyLimit(String)
    case unclear
    case unavailable
    case other(String)

    public init(_ error: Error) {
        switch error {
        case let APIError.server(_, code?, _) where code == "recognition_daily_limit":
            self = .dailyLimit("Распознавания по фото на сегодня закончились. Найдите блюдо вручную или по штрихкоду.")
        case let APIError.server(_, code?, _) where code == "recognition_unclear":
            self = .unclear
        case let APIError.server(status, _, _) where status == 503:
            self = .unavailable
        case APIError.network:
            self = .other("Нет сети. Фото не отправлено — попробуйте ещё раз.")
        default:
            self = .other("Не получилось распознать фото. Попробуйте ещё раз или найдите блюдо вручную.")
        }
    }

    public var message: String {
        switch self {
        case let .dailyLimit(text): return text
        case .unclear: return "Не получилось разобрать блюдо. Переснимите сверху при хорошем свете или найдите в поиске."
        case .unavailable: return "Распознавание по фото сейчас недоступно."
        case let .other(text): return text
        }
    }

    public var isDailyLimit: Bool {
        if case .dailyLimit = self { return true }
        return false
    }
}

/// `POST /food-tracker/recognize`: JPEG уже подготовлен на телефоне.
public enum RecognitionAPI {
    public static func recognize(jpeg: Data, api: APIClient) async throws -> Recognition {
        let form = MultipartForm(fields: [:], file: ("photo", "plate.jpg", "image/jpeg", jpeg))
        let endpoint = Endpoint(method: .post, path: "/api/v1/food-tracker/recognize", body: form.body,
                                contentType: form.contentType)
        return try await api.send(endpoint, as: Recognition.self)
    }
}
