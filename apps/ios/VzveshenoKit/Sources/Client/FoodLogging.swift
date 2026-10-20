import Foundation

/// Приём пищи — как на проводе (`meal_type`).
public enum MealType: String, Codable, Sendable, CaseIterable, Identifiable, Hashable {
    case breakfast, lunch, dinner, snack

    public var id: String { rawValue }

    /// «Завтрак».
    public var title: String {
        switch self {
        case .breakfast: return "Завтрак"
        case .lunch: return "Обед"
        case .dinner: return "Ужин"
        case .snack: return "Перекус"
        }
    }

    /// «в завтрак», «в обед», «в ужин», «в перекус» — для кнопки «Добавить в …».
    public var accusative: String {
        switch self {
        case .breakfast: return "завтрак"
        case .lunch: return "обед"
        case .dinner: return "ужин"
        case .snack: return "перекус"
        }
    }

    /// Приём по часу (`ios-food-logging`): 5–10 — завтрак, 11–15 — обед,
    /// 17–21 — ужин, остальное — перекус.
    public static func byHour(_ hour: Int) -> MealType {
        switch hour {
        case 5...10: return .breakfast
        case 11...15: return .lunch
        case 17...21: return .dinner
        default: return .snack
        }
    }

    /// Приём по моменту в поясе календаря.
    public static func at(_ date: Date, calendar: DayCalendar) -> MealType {
        byHour(calendar.calendar.component(.hour, from: date))
    }
}

/// Способ записи еды — вкладка листа «Записать еду».
public enum FoodLogMethod: String, Sendable, CaseIterable, Identifiable, Hashable {
    case search, barcode, photo, manual

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .search: return "Поиск"
        case .barcode: return "Штрихкод"
        case .photo: return "Фото"
        case .manual: return "Вручную"
        }
    }
}

/// Открыть лист «Записать еду»: откуда бы ни пришла команда — аксессуар,
/// дневник, ссылка `?add=`, App Intent, виджет — она сводится к этому.
public struct FoodLogRequest: Sendable, Equatable, Identifiable {
    public var method: FoodLogMethod
    public var meal: MealType
    /// День записи, `yyyy-MM-dd`.
    public var date: String
    public let id: UUID

    public init(method: FoodLogMethod, meal: MealType, date: String, id: UUID = UUID()) {
        self.method = method
        self.meal = meal
        self.date = date
        self.id = id
    }

    /// Лист на способе `method` с приёмом по часу момента `now`.
    public static func make(method: FoodLogMethod, date: String? = nil, meal: MealType? = nil, now: Date,
                            calendar: DayCalendar) -> FoodLogRequest {
        FoodLogRequest(method: method, meal: meal ?? MealType.at(now, calendar: calendar), date: date ?? calendar.key(now))
    }
}

/// Единица порции (`portion_type`).
public enum PortionUnit: String, Codable, Sendable, CaseIterable, Identifiable {
    case grams
    case milliliters
    case portion

    public var id: String { rawValue }

    /// Подпись после числа: «г», «мл», «порц.».
    public var short: String {
        switch self {
        case .grams: return "г"
        case .milliliters: return "мл"
        case .portion: return "порц."
        }
    }

    /// Допустимые значения (`ios-food-logging`): граммы и мл 1–2000,
    /// порции 0,5–10.
    public var range: ClosedRange<Double> {
        switch self {
        case .grams, .milliliters: return 1...2000
        case .portion: return 0.5...10
        }
    }

    /// Шаг колеса: граммы и мл — 1, порции — 0,5.
    public var step: Double { self == .portion ? 0.5 : 1 }

    /// Быстрые значения.
    public var quick: [Double] {
        switch self {
        case .grams: return [100, 150, 200, 250]
        case .milliliters: return [200, 250, 330, 500]
        case .portion: return [0.5, 1, 1.5, 2]
        }
    }

    /// Значения колеса по шагу.
    public var wheel: [Double] {
        stride(from: range.lowerBound, through: range.upperBound, by: step).map { $0 }
    }

    /// «150 г», «0,5 порц.».
    public func label(_ amount: Double) -> String {
        "\(NumberText.oneDecimal(amount)) \(short)"
    }
}

/// КБЖУ: на 100 г или итог порции.
public struct Nutrition: Codable, Sendable, Equatable, Hashable {
    public var calories: Double
    public var protein: Double
    public var fat: Double
    public var carbs: Double

    public init(calories: Double, protein: Double, fat: Double, carbs: Double) {
        self.calories = calories
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
    }

    public static let zero = Nutrition(calories: 0, protein: 0, fat: 0, carbs: 0)

    public func scaled(by factor: Double) -> Nutrition {
        Nutrition(calories: calories * factor, protein: protein * factor, fat: fat * factor, carbs: carbs * factor)
    }

    public static func + (lhs: Nutrition, rhs: Nutrition) -> Nutrition {
        Nutrition(calories: lhs.calories + rhs.calories, protein: lhs.protein + rhs.protein, fat: lhs.fat + rhs.fat,
                  carbs: lhs.carbs + rhs.carbs)
    }

    /// «Б 4 · Ж 1 · У 21».
    public var macroLine: String {
        "Б \(NumberText.jsRound(protein)) · Ж \(NumberText.jsRound(fat)) · У \(NumberText.jsRound(carbs))"
    }

    public var kcal: Int { NumberText.jsRound(calories) }
}

/// Порция и пересчёт КБЖУ — как сервер: на 100 г × граммы / 100; у порции —
/// на 100 г × вес порции × число порций / 100.
public struct Portion: Sendable, Equatable {
    public var unit: PortionUnit
    public var amount: Double
    /// Вес одной порции в граммах (для `portion`); без него порция — 100 г.
    public var servingGrams: Double?

    public init(unit: PortionUnit = .grams, amount: Double = 100, servingGrams: Double? = nil) {
        self.unit = unit
        self.amount = amount
        self.servingGrams = servingGrams
    }

    /// Граммы (миллилитры) порции.
    public var grams: Double {
        switch unit {
        case .grams, .milliliters: return amount
        case .portion: return amount * (servingGrams ?? 100)
        }
    }

    public var isValid: Bool { unit.range.contains(amount) }

    /// КБЖУ порции по КБЖУ на 100 г.
    public func nutrition(per100 base: Nutrition) -> Nutrition {
        base.scaled(by: grams / 100)
    }

    /// Ближайшее допустимое значение шага.
    public static func clamp(_ value: Double, unit: PortionUnit) -> Double {
        let stepped = (value / unit.step).rounded() * unit.step
        return min(max(stepped, unit.range.lowerBound), unit.range.upperBound)
    }
}
