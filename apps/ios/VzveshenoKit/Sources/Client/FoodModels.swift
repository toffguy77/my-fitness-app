import Foundation

// Ответы `food-tracker` (`ios-food-logging`, `ios-food-diary`). Записи
// дневника и продукты — в camelCase (`foodId`, `nutritionPer100`), кроме
// отдельных полей в snake_case; так их отдаёт сервер.

/// КБЖУ на проводе: `{calories, protein, fat, carbs}`.
struct WireNutrition: Codable, Sendable {
    var calories: Double?
    var protein: Double?
    var fat: Double?
    var carbs: Double?

    var value: Nutrition {
        Nutrition(calories: calories ?? 0, protein: protein ?? 0, fat: fat ?? 0, carbs: carbs ?? 0)
    }

    init(_ nutrition: Nutrition) {
        calories = nutrition.calories
        protein = nutrition.protein
        fat = nutrition.fat
        carbs = nutrition.carbs
    }
}

/// Продукт поиска, штрихкода, недавних и избранного.
///
/// `id` — UUID у своих и каталожных продуктов, у `products` — число строкой:
/// в запись уходит как есть, сервер сам заводит продукт (`ensureFoodItemExists`).
public struct FoodItem: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var name: String
    public var brand: String?
    public var servingSize: Double?
    public var servingUnit: String?
    public var per100: Nutrition
    public var source: String?
    public var barcode: String?

    public init(id: String, name: String, brand: String? = nil, servingSize: Double? = nil, servingUnit: String? = nil,
                per100: Nutrition, source: String? = nil, barcode: String? = nil) {
        self.id = id
        self.name = name
        self.brand = brand
        self.servingSize = servingSize
        self.servingUnit = servingUnit
        self.per100 = per100
        self.source = source
        self.barcode = barcode
    }

    enum CodingKeys: String, CodingKey {
        case id, name, brand, servingSize, servingUnit, source, barcode
        case per100 = "nutritionPer100"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let text = try? container.decode(String.self, forKey: .id) {
            id = text
        } else {
            id = String(try container.decode(Int64.self, forKey: .id))
        }
        name = try container.decode(String.self, forKey: .name)
        brand = try container.decodeIfPresent(String.self, forKey: .brand)
        servingSize = try container.decodeIfPresent(Double.self, forKey: .servingSize)
        servingUnit = try container.decodeIfPresent(String.self, forKey: .servingUnit)
        per100 = try container.decodeIfPresent(WireNutrition.self, forKey: .per100)?.value ?? .zero
        source = try container.decodeIfPresent(String.self, forKey: .source)
        barcode = try container.decodeIfPresent(String.self, forKey: .barcode)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(brand, forKey: .brand)
        try container.encodeIfPresent(servingSize, forKey: .servingSize)
        try container.encodeIfPresent(servingUnit, forKey: .servingUnit)
        try container.encode(WireNutrition(per100), forKey: .per100)
        try container.encodeIfPresent(source, forKey: .source)
        try container.encodeIfPresent(barcode, forKey: .barcode)
    }

    /// Метка источника на строке поиска: «база», «штрихкод», «моё».
    public var sourceTag: String? {
        switch source {
        case "user", "ai": return "моё"
        case "openfoodfacts": return barcode == nil ? "база" : "штрихкод"
        case "recipe": return "рецепт"
        case nil: return nil
        default: return barcode == nil ? "база" : "штрихкод"
        }
    }

    /// «110 ккал на 100 г · Б 4 · Ж 1 · У 21».
    public var subtitle: String {
        var parts = ["\(NumberText.grouped(per100.kcal)) ккал на 100 г"]
        if let brand, !brand.isEmpty { parts.insert(brand, at: 0) }
        parts.append(per100.macroLine)
        return parts.joined(separator: " · ")
    }

    /// Единица по умолчанию: напитки — мл.
    public var defaultUnit: PortionUnit {
        switch servingUnit?.lowercased() {
        case "ml", "мл": return .milliliters
        default: return .grams
        }
    }
}

/// `GET /food-tracker/search` → `{items, total}`.
public struct FoodSearchAnswer: Decodable, Sendable, Equatable {
    public var items: [FoodItem]

    public init(items: [FoodItem]) { self.items = items }

    enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        items = try container.decodeIfPresent([FoodItem].self, forKey: .items) ?? []
    }
}

/// `GET /recent`, `GET /favorites` → `{foods}`.
public struct FoodList: Decodable, Sendable, Equatable {
    public var foods: [FoodItem]

    public init(foods: [FoodItem]) { self.foods = foods }

    enum CodingKeys: String, CodingKey { case foods }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        foods = try container.decodeIfPresent([FoodItem].self, forKey: .foods) ?? []
    }
}

/// `GET /barcode/:code`: всегда 200, «не найдено» — `found: false`.
public struct BarcodeAnswer: Decodable, Sendable, Equatable {
    public var found: Bool
    public var food: FoodItem?
    public var message: String?

    public init(found: Bool, food: FoodItem? = nil, message: String? = nil) {
        self.found = found
        self.food = food
        self.message = message
    }
}

/// Запись дневника.
public struct FoodEntry: Codable, Sendable, Equatable, Identifiable, Hashable {
    public var id: String
    public var foodID: String?
    public var foodName: String
    public var mealType: MealType
    public var portionType: PortionUnit
    public var portionAmount: Double
    public var nutrition: Nutrition
    /// «08:10».
    public var time: String
    /// `yyyy-MM-dd`.
    public var date: String

    public init(id: String, foodID: String? = nil, foodName: String, mealType: MealType, portionType: PortionUnit = .grams,
                portionAmount: Double, nutrition: Nutrition, time: String, date: String) {
        self.id = id
        self.foodID = foodID
        self.foodName = foodName
        self.mealType = mealType
        self.portionType = portionType
        self.portionAmount = portionAmount
        self.nutrition = nutrition
        self.time = time
        self.date = date
    }

    enum CodingKeys: String, CodingKey {
        case id, foodName, mealType, portionType, portionAmount, nutrition, time, date
        case foodID = "foodId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        foodID = try container.decodeIfPresent(String.self, forKey: .foodID)
        foodName = try container.decodeIfPresent(String.self, forKey: .foodName) ?? ""
        mealType = (try? container.decode(MealType.self, forKey: .mealType)) ?? .snack
        portionType = (try? container.decode(PortionUnit.self, forKey: .portionType)) ?? .grams
        portionAmount = try container.decodeIfPresent(Double.self, forKey: .portionAmount) ?? 0
        nutrition = try container.decodeIfPresent(WireNutrition.self, forKey: .nutrition)?.value ?? .zero
        time = try container.decodeIfPresent(String.self, forKey: .time) ?? ""
        date = DayKey.of(try container.decodeIfPresent(String.self, forKey: .date) ?? "")
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(foodID, forKey: .foodID)
        try container.encode(foodName, forKey: .foodName)
        try container.encode(mealType, forKey: .mealType)
        try container.encode(portionType, forKey: .portionType)
        try container.encode(portionAmount, forKey: .portionAmount)
        try container.encode(WireNutrition(nutrition), forKey: .nutrition)
        try container.encode(time, forKey: .time)
        try container.encode(date, forKey: .date)
    }

    /// «250 г · 08:10».
    public var caption: String {
        let amount = "\(NumberText.oneDecimal(portionAmount)) \(portionType.short)"
        return time.isEmpty ? amount : "\(amount) · \(time.prefix(5))"
    }

    /// КБЖУ на 100 г, восстановленные из итога порции (для правки).
    public var per100: Nutrition {
        let grams = Portion(unit: portionType, amount: portionAmount).grams
        return grams > 0 ? nutrition.scaled(by: 100 / grams) : .zero
    }
}

/// `GET /food-tracker/entries?date=` → записи по приёмам и итог дня.
public struct DayEntries: Decodable, Sendable, Equatable {
    public var entries: [MealType: [FoodEntry]]
    public var totals: Nutrition

    public init(entries: [MealType: [FoodEntry]], totals: Nutrition? = nil) {
        self.entries = entries
        self.totals = totals ?? entries.values.joined().reduce(.zero) { $0 + $1.nutrition }
    }

    enum CodingKeys: String, CodingKey {
        case entries
        case totals = "dailyTotals"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        var grouped: [MealType: [FoodEntry]] = [:]
        if let byMeal = try? container.decode([String: [FoodEntry]].self, forKey: .entries) {
            for (key, list) in byMeal {
                if let meal = MealType(rawValue: key) { grouped[meal, default: []] += list }
            }
        } else if let flat = try? container.decode([FoodEntry].self, forKey: .entries) {
            grouped = Dictionary(grouping: flat, by: \.mealType)
        }
        entries = grouped
        totals = try container.decodeIfPresent(WireNutrition.self, forKey: .totals)?.value
            ?? grouped.values.joined().reduce(.zero) { $0 + $1.nutrition }
    }

    public var all: [FoodEntry] { MealType.allCases.flatMap { entries[$0] ?? [] } }
}

/// Распознанная позиция: КБЖУ на 100 г, оценка веса — только подсказка.
public struct RecognizedFood: Decodable, Sendable, Equatable {
    public var name: String
    public var confidence: Double
    public var estimatedWeight: Double?
    public var per100: Nutrition

    public init(name: String, confidence: Double, estimatedWeight: Double?, per100: Nutrition) {
        self.name = name
        self.confidence = confidence
        self.estimatedWeight = estimatedWeight
        self.per100 = per100
    }

    enum CodingKeys: String, CodingKey {
        case name, confidence
        case estimatedWeight = "estimated_weight"
        case per100 = "nutrition"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 0
        estimatedWeight = try container.decodeIfPresent(Double.self, forKey: .estimatedWeight)
        per100 = try container.decodeIfPresent(WireNutrition.self, forKey: .per100)?.value ?? .zero
    }
}

/// `POST /food-tracker/recognize`.
public struct Recognition: Decodable, Sendable, Equatable {
    public var foods: [RecognizedFood]
    public var composition: [RecognizedFood]?
    public var remaining: Int?

    public init(foods: [RecognizedFood], composition: [RecognizedFood]? = nil, remaining: Int? = nil) {
        self.foods = foods
        self.composition = composition
        self.remaining = remaining
    }

    enum CodingKeys: String, CodingKey {
        case foods, composition
        case remaining = "remaining_recognitions"
    }

    /// Состав, а без него — блюдо целиком.
    public var parts: [RecognizedFood] {
        if let composition, !composition.isEmpty { return composition }
        return foods
    }
}

/// `POST /user-foods` и `/user-foods/clone` → свой продукт (snake_case).
public struct UserFood: Decodable, Sendable, Equatable {
    public var id: String
    public var name: String
    public var brand: String?
    public var per100: Nutrition

    enum CodingKeys: String, CodingKey {
        case id, name, brand
        case calories = "calories_per_100"
        case protein = "protein_per_100"
        case fat = "fat_per_100"
        case carbs = "carbs_per_100"
    }

    public init(id: String, name: String, brand: String? = nil, per100: Nutrition) {
        self.id = id
        self.name = name
        self.brand = brand
        self.per100 = per100
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        brand = try container.decodeIfPresent(String.self, forKey: .brand)
        per100 = Nutrition(calories: try container.decodeIfPresent(Double.self, forKey: .calories) ?? 0,
                           protein: try container.decodeIfPresent(Double.self, forKey: .protein) ?? 0,
                           fat: try container.decodeIfPresent(Double.self, forKey: .fat) ?? 0,
                           carbs: try container.decodeIfPresent(Double.self, forKey: .carbs) ?? 0)
    }

    public var asFoodItem: FoodItem {
        FoodItem(id: id, name: name, brand: brand, per100: per100, source: "user")
    }
}

// MARK: Тела запросов

/// `POST /food-tracker/entries` (camelCase, как в вебе).
public struct NewEntryBody: Codable, Sendable, Equatable {
    public var foodId: String
    public var mealType: MealType
    public var portionType: PortionUnit
    public var portionAmount: Double
    public var time: String
    public var date: String
    public var foodName: String?
    public var calories: Double?
    public var protein: Double?
    public var fat: Double?
    public var carbs: Double?

    public init(foodId: String, mealType: MealType, portionType: PortionUnit, portionAmount: Double, time: String,
                date: String, foodName: String? = nil, nutrition: Nutrition? = nil) {
        self.foodId = foodId
        self.mealType = mealType
        self.portionType = portionType
        self.portionAmount = portionAmount
        self.time = time
        self.date = date
        self.foodName = foodName
        calories = nutrition?.calories
        protein = nutrition?.protein
        fat = nutrition?.fat
        carbs = nutrition?.carbs
    }
}

/// `PUT /food-tracker/entries/:id`.
public struct EntryUpdateBody: Codable, Sendable, Equatable {
    public var mealType: MealType
    public var portionType: PortionUnit
    public var portionAmount: Double
    public var time: String
    public var foodName: String
    public var calories: Double
    public var protein: Double
    public var fat: Double
    public var carbs: Double

    public init(entry: FoodEntry) {
        mealType = entry.mealType
        portionType = entry.portionType
        portionAmount = entry.portionAmount
        time = entry.time
        foodName = entry.foodName
        calories = entry.nutrition.calories
        protein = entry.nutrition.protein
        fat = entry.nutrition.fat
        carbs = entry.nutrition.carbs
    }
}

/// `POST /food-tracker/user-foods` (snake_case).
public struct NewUserFoodBody: Encodable, Sendable, Equatable {
    public var name: String
    public var brand: String?
    public var caloriesPer100: Double
    public var proteinPer100: Double
    public var fatPer100: Double
    public var carbsPer100: Double
    public var servingSize: Double = 100
    public var servingUnit = "g"

    public init(name: String, brand: String?, per100: Nutrition) {
        self.name = name
        self.brand = brand
        caloriesPer100 = per100.calories
        proteinPer100 = per100.protein
        fatPer100 = per100.fat
        carbsPer100 = per100.carbs
    }

    enum CodingKeys: String, CodingKey {
        case name, brand
        case caloriesPer100 = "calories_per_100"
        case proteinPer100 = "protein_per_100"
        case fatPer100 = "fat_per_100"
        case carbsPer100 = "carbs_per_100"
        case servingSize = "serving_size"
        case servingUnit = "serving_unit"
    }
}

/// Форма «Вручную»: название и КБЖУ на 100 г. Сервер не принимает
/// нулевые калории (`required` на числе) — форма тоже.
public enum ManualFoodForm {
    public static func validate(name: String, calories: String, protein: String, fat: String, carbs: String) -> (String, Nutrition)? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...255).contains(trimmed.count), let kcal = number(calories), kcal > 0, kcal <= 900 else { return nil }
        let macros = [protein, fat, carbs].map { $0.trimmingCharacters(in: .whitespaces).isEmpty ? 0 : number($0) }
        guard macros.allSatisfy({ $0 != nil && $0! >= 0 && $0! <= 100 }) else { return nil }
        return (trimmed, Nutrition(calories: kcal, protein: macros[0] ?? 0, fat: macros[1] ?? 0, carbs: macros[2] ?? 0))
    }

    static func number(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }
}

/// «13:20» момента в поясе календаря — поле `time` записи.
public enum ClockText {
    public static func hhmm(_ date: Date, calendar: DayCalendar) -> String {
        let parts = calendar.calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }
}
