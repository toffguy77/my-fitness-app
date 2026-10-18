import Foundation

// «Меню» (бета, `ios-meal-plan`): план на день из рецептов под норму,
// рецепты, список покупок. Имена полей — как на проводе
// (`openspec/changes/meal-day-plan/api.md`, `recipe-catalogue`, `shopping-list`).

/// КБЖУ в меню называются по-своему: `kcal`, а не `calories`.
public struct MenuNutrition: Codable, Sendable, Equatable, Hashable {
    public var kcal: Double
    public var protein: Double
    public var fat: Double
    public var carbs: Double

    public init(kcal: Double, protein: Double, fat: Double, carbs: Double) {
        self.kcal = kcal
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
    }

    public static let zero = MenuNutrition(kcal: 0, protein: 0, fat: 0, carbs: 0)

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kcal = try container.decodeIfPresent(Double.self, forKey: .kcal) ?? 0
        protein = try container.decodeIfPresent(Double.self, forKey: .protein) ?? 0
        fat = try container.decodeIfPresent(Double.self, forKey: .fat) ?? 0
        carbs = try container.decodeIfPresent(Double.self, forKey: .carbs) ?? 0
    }

    /// В КБЖУ дневника.
    public var nutrition: Nutrition { Nutrition(calories: kcal, protein: protein, fat: fat, carbs: carbs) }
}

/// Блюдо плана на приём пищи.
public struct MealPlanItem: Codable, Sendable, Equatable, Identifiable {
    public var mealType: String
    public var recipeID: String
    public var name: String
    public var photoURL: String?
    /// Вес блюда в плане, г.
    public var grams: Double
    public var portionGrams: Double?
    /// КБЖУ на `grams`.
    public var nutrition: MenuNutrition
    public var locked: Bool
    public var manualGrams: Bool
    /// Рецепт снят или скрыт куратором.
    public var unavailable: Bool
    /// Есть запись дневника этого блюда.
    public var eaten: Bool
    public var eatenGrams: Double?
    public var foodEntryID: String?

    public init(mealType: String, recipeID: String, name: String, photoURL: String? = nil, grams: Double,
                portionGrams: Double? = nil, nutrition: MenuNutrition, locked: Bool = false, manualGrams: Bool = false,
                unavailable: Bool = false, eaten: Bool = false, eatenGrams: Double? = nil, foodEntryID: String? = nil) {
        self.mealType = mealType
        self.recipeID = recipeID
        self.name = name
        self.photoURL = photoURL
        self.grams = grams
        self.portionGrams = portionGrams
        self.nutrition = nutrition
        self.locked = locked
        self.manualGrams = manualGrams
        self.unavailable = unavailable
        self.eaten = eaten
        self.eatenGrams = eatenGrams
        self.foodEntryID = foodEntryID
    }

    public var id: String { mealType }
    public var meal: MealType? { MealType(rawValue: mealType) }

    enum CodingKeys: String, CodingKey {
        case name, grams, nutrition, locked, unavailable, eaten
        case mealType = "meal_type"
        case recipeID = "recipe_id"
        case photoURL = "photo_url"
        case portionGrams = "portion_grams"
        case manualGrams = "manual_grams"
        case eatenGrams = "eaten_grams"
        case foodEntryID = "food_entry_id"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        mealType = try container.decode(String.self, forKey: .mealType)
        recipeID = try container.decode(String.self, forKey: .recipeID)
        name = try container.decode(String.self, forKey: .name)
        photoURL = try container.decodeIfPresent(String.self, forKey: .photoURL)
        grams = try container.decodeIfPresent(Double.self, forKey: .grams) ?? 0
        portionGrams = try container.decodeIfPresent(Double.self, forKey: .portionGrams)
        nutrition = try container.decodeIfPresent(MenuNutrition.self, forKey: .nutrition) ?? .zero
        locked = try container.decodeIfPresent(Bool.self, forKey: .locked) ?? false
        manualGrams = try container.decodeIfPresent(Bool.self, forKey: .manualGrams) ?? false
        unavailable = try container.decodeIfPresent(Bool.self, forKey: .unavailable) ?? false
        eaten = try container.decodeIfPresent(Bool.self, forKey: .eaten) ?? false
        eatenGrams = try container.decodeIfPresent(Double.self, forKey: .eatenGrams)
        foodEntryID = try container.decodeIfPresent(String.self, forKey: .foodEntryID)
    }

    /// «150 г · 229 ккал».
    public var caption: String {
        "\(NumberText.grouped(NumberText.jsRound(grams))) г · \(NumberText.grouped(NumberText.jsRound(nutrition.kcal))) ккал"
    }
}

/// План на день (`GET /meal-plans/:date`).
public struct MealPlan: Codable, Sendable, Equatable {
    public struct EmptySlot: Codable, Sendable, Equatable {
        public var mealType: String
        public var reason: String

        public init(mealType: String, reason: String = "no_recipes") {
            self.mealType = mealType
            self.reason = reason
        }

        enum CodingKeys: String, CodingKey {
            case reason
            case mealType = "meal_type"
        }
    }

    /// Показатель вне допуска: `delta` > 0 — перебор, < 0 — недобор.
    public struct Deviation: Codable, Sendable, Equatable, Hashable {
        public var nutrient: String
        public var delta: Double

        public init(nutrient: String, delta: Double) {
            self.nutrient = nutrient
            self.delta = delta
        }
    }

    public var date: String
    public var mealTypes: [String]
    public var target: MenuNutrition
    public var targetChanged: Bool
    public var items: [MealPlanItem]
    public var empty: [EmptySlot]
    public var totals: MenuNutrition
    public var remaining: MenuNutrition
    public var deviations: [Deviation]

    public init(date: String, mealTypes: [String], target: MenuNutrition, targetChanged: Bool = false,
                items: [MealPlanItem], empty: [EmptySlot] = [], totals: MenuNutrition, remaining: MenuNutrition = .zero,
                deviations: [Deviation] = []) {
        self.date = date
        self.mealTypes = mealTypes
        self.target = target
        self.targetChanged = targetChanged
        self.items = items
        self.empty = empty
        self.totals = totals
        self.remaining = remaining
        self.deviations = deviations
    }

    enum CodingKeys: String, CodingKey {
        case date, target, items, empty, totals, remaining, deviations
        case mealTypes = "meal_types"
        case targetChanged = "target_changed"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        date = try container.decodeIfPresent(String.self, forKey: .date) ?? ""
        mealTypes = try container.decodeIfPresent([String].self, forKey: .mealTypes) ?? []
        target = try container.decodeIfPresent(MenuNutrition.self, forKey: .target) ?? .zero
        targetChanged = try container.decodeIfPresent(Bool.self, forKey: .targetChanged) ?? false
        items = try container.decodeIfPresent([MealPlanItem].self, forKey: .items) ?? []
        empty = try container.decodeIfPresent([EmptySlot].self, forKey: .empty) ?? []
        totals = try container.decodeIfPresent(MenuNutrition.self, forKey: .totals) ?? .zero
        remaining = try container.decodeIfPresent(MenuNutrition.self, forKey: .remaining) ?? .zero
        deviations = try container.decodeIfPresent([Deviation].self, forKey: .deviations) ?? []
    }

    public func item(for meal: String) -> MealPlanItem? { items.first { $0.mealType == meal } }

    /// Есть блюдо, которое стало недоступно.
    public var hasUnavailable: Bool { items.contains(where: \.unavailable) }

    /// «Белков меньше нормы на 12 г» — по каждому показателю вне допуска.
    public var deviationTexts: [String] {
        deviations.map { deviation in
            let title: String
            let unit: String
            switch deviation.nutrient {
            case "kcal": title = "Калорий"; unit = "ккал"
            case "protein": title = "Белков"; unit = "г"
            case "fat": title = "Жиров"; unit = "г"
            default: title = "Углеводов"; unit = "г"
            }
            let amount = NumberText.grouped(NumberText.jsRound(abs(deviation.delta)))
            return "\(title) \(deviation.delta > 0 ? "больше" : "меньше") нормы на \(amount) \(unit)"
        }
    }
}

/// «Съел»: запись дневника и план с ней.
public struct EatResult: Decodable, Sendable, Equatable {
    public var entryID: String
    public var plan: MealPlan

    public init(entryID: String, plan: MealPlan) {
        self.entryID = entryID
        self.plan = plan
    }

    enum CodingKeys: String, CodingKey {
        case plan
        case entryID = "entry_id"
    }
}

/// Тело `PUT /meal-plans/:date/items/:meal`.
public struct PlanItemUpdate: Encodable, Sendable, Equatable {
    public var recipeID: String?
    public var grams: Double?
    public var locked: Bool?
    public var resetGrams: Bool?

    public init(recipeID: String? = nil, grams: Double? = nil, locked: Bool? = nil, resetGrams: Bool? = nil) {
        self.recipeID = recipeID
        self.grams = grams
        self.locked = locked
        self.resetGrams = resetGrams
    }

    enum CodingKeys: String, CodingKey {
        case grams, locked
        case recipeID = "recipe_id"
        case resetGrams = "reset_grams"
    }
}

/// Замена блюда.
public struct MealAlternative: Decodable, Sendable, Equatable, Identifiable {
    public var recipeID: String
    public var name: String
    public var photoURL: String?
    public var grams: Double
    public var nutrition: MenuNutrition

    public init(recipeID: String, name: String, photoURL: String? = nil, grams: Double, nutrition: MenuNutrition) {
        self.recipeID = recipeID
        self.name = name
        self.photoURL = photoURL
        self.grams = grams
        self.nutrition = nutrition
    }

    public var id: String { recipeID }

    enum CodingKeys: String, CodingKey {
        case name, grams, nutrition
        case recipeID = "recipe_id"
        case photoURL = "photo_url"
    }

    /// «180 г · 320 ккал · Б 24».
    public var caption: String {
        let kcal = NumberText.grouped(NumberText.jsRound(nutrition.kcal))
        return "\(NumberText.jsRound(grams)) г · \(kcal) ккал · Б \(NumberText.jsRound(nutrition.protein))"
    }
}

public struct MealAlternatives: Decodable, Sendable, Equatable {
    public var items: [MealAlternative]

    public init(items: [MealAlternative]) { self.items = items }
}

public struct MealPlanSettings: Codable, Sendable, Equatable {
    public var mealTypes: [String]

    public init(mealTypes: [String]) { self.mealTypes = mealTypes }

    enum CodingKeys: String, CodingKey { case mealTypes = "meal_types" }
}

/// Рецепт в каталоге.
public struct RecipeSummary: Decodable, Sendable, Equatable, Identifiable, Hashable {
    public var id: String
    public var name: String
    public var photoURL: String?
    public var cookMinutes: Int?
    public var mealTypes: [String]
    public var portionGrams: Double?
    public var perPortion: MenuNutrition?

    public init(id: String, name: String, photoURL: String? = nil, cookMinutes: Int? = nil, mealTypes: [String] = [],
                portionGrams: Double? = nil, perPortion: MenuNutrition? = nil) {
        self.id = id
        self.name = name
        self.photoURL = photoURL
        self.cookMinutes = cookMinutes
        self.mealTypes = mealTypes
        self.portionGrams = portionGrams
        self.perPortion = perPortion
    }

    enum CodingKeys: String, CodingKey {
        case id, name
        case photoURL = "photo_url"
        case cookMinutes = "cook_minutes"
        case mealTypes = "meal_types"
        case portionGrams = "portion_grams"
        case perPortion = "per_portion"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        photoURL = try container.decodeIfPresent(String.self, forKey: .photoURL)
        cookMinutes = try container.decodeIfPresent(Int.self, forKey: .cookMinutes)
        mealTypes = try container.decodeIfPresent([String].self, forKey: .mealTypes) ?? []
        portionGrams = try container.decodeIfPresent(Double.self, forKey: .portionGrams)
        perPortion = try container.decodeIfPresent(MenuNutrition.self, forKey: .perPortion)
    }

    /// «320 ккал · 25 мин».
    public var caption: String {
        var parts: [String] = []
        if let perPortion { parts.append("\(NumberText.grouped(NumberText.jsRound(perPortion.kcal))) ккал") }
        if let cookMinutes, cookMinutes > 0 { parts.append("\(cookMinutes) мин") }
        return parts.joined(separator: " · ")
    }
}

/// `response.Collection`: `{items, total, limit, offset}`.
public struct RecipePage: Decodable, Sendable, Equatable {
    public var items: [RecipeSummary]
    public var total: Int

    public init(items: [RecipeSummary], total: Int) {
        self.items = items
        self.total = total
    }

    enum CodingKeys: String, CodingKey { case items, total }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        items = try container.decodeIfPresent([RecipeSummary].self, forKey: .items) ?? []
        total = try container.decodeIfPresent(Int.self, forKey: .total) ?? items.count
    }
}

/// Рецепт целиком (`GET /recipes/:id`).
public struct RecipeDetail: Decodable, Sendable, Equatable {
    public struct Ingredient: Decodable, Sendable, Equatable, Identifiable {
        public var position: Int
        public var foodName: String?
        public var sourceName: String?
        public var grams: Double?
        public var displayQuantity: String?
        public var toTaste: Bool

        public init(position: Int, foodName: String?, sourceName: String? = nil, grams: Double?, displayQuantity: String? = nil,
                    toTaste: Bool = false) {
            self.position = position
            self.foodName = foodName
            self.sourceName = sourceName
            self.grams = grams
            self.displayQuantity = displayQuantity
            self.toTaste = toTaste
        }

        public var id: Int { position }
        public var title: String { foodName ?? sourceName ?? "—" }
        /// «по вкусу», «2 шт.», «150 г».
        public var quantity: String {
            if toTaste { return "по вкусу" }
            if let displayQuantity, !displayQuantity.isEmpty { return displayQuantity }
            return grams.map { "\(NumberText.jsRound($0)) г" } ?? ""
        }

        enum CodingKeys: String, CodingKey {
            case position, grams
            case foodName = "food_name"
            case sourceName = "source_name"
            case displayQuantity = "display_quantity"
            case toTaste = "to_taste"
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            position = try container.decodeIfPresent(Int.self, forKey: .position) ?? 0
            foodName = try container.decodeIfPresent(String.self, forKey: .foodName)
            sourceName = try container.decodeIfPresent(String.self, forKey: .sourceName)
            grams = try container.decodeIfPresent(Double.self, forKey: .grams)
            displayQuantity = try container.decodeIfPresent(String.self, forKey: .displayQuantity)
            toTaste = try container.decodeIfPresent(Bool.self, forKey: .toTaste) ?? false
        }
    }

    public struct Step: Decodable, Sendable, Equatable, Identifiable {
        public var position: Int
        public var text: String

        public init(position: Int, text: String) {
            self.position = position
            self.text = text
        }

        public var id: Int { position }
    }

    public var recipeID: String
    public var name: String
    public var description: String?
    public var photoURL: String?
    public var cookMinutes: Int?
    public var portionGrams: Double?
    public var perPortion: MenuNutrition?
    public var ingredients: [Ingredient]
    public var steps: [Step]

    public init(recipeID: String, name: String, description: String? = nil, photoURL: String? = nil, cookMinutes: Int? = nil,
                portionGrams: Double? = nil, perPortion: MenuNutrition? = nil, ingredients: [Ingredient] = [], steps: [Step] = []) {
        self.recipeID = recipeID
        self.name = name
        self.description = description
        self.photoURL = photoURL
        self.cookMinutes = cookMinutes
        self.portionGrams = portionGrams
        self.perPortion = perPortion
        self.ingredients = ingredients
        self.steps = steps
    }

    enum CodingKeys: String, CodingKey {
        case name, description, ingredients, steps
        case recipeID = "recipe_id"
        case photoURL = "photo_url"
        case cookMinutes = "cook_minutes"
        case portionGrams = "portion_grams"
        case perPortion = "per_portion"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        recipeID = try container.decode(String.self, forKey: .recipeID)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        photoURL = try container.decodeIfPresent(String.self, forKey: .photoURL)
        cookMinutes = try container.decodeIfPresent(Int.self, forKey: .cookMinutes)
        portionGrams = try container.decodeIfPresent(Double.self, forKey: .portionGrams)
        perPortion = try container.decodeIfPresent(MenuNutrition.self, forKey: .perPortion)
        ingredients = try container.decodeIfPresent([Ingredient].self, forKey: .ingredients) ?? []
        steps = try container.decodeIfPresent([Step].self, forKey: .steps) ?? []
    }

    /// «Порция 250 г: 320 ккал · Б 24 · Ж 10 · У 30».
    public var portionLine: String? {
        guard let perPortion else { return nil }
        let grams = portionGrams.map { " \(NumberText.jsRound($0)) г" } ?? ""
        return "Порция\(grams): \(NumberText.grouped(NumberText.jsRound(perPortion.kcal))) ккал · \(perPortion.nutrition.macroLine)"
    }
}

/// Список покупок за диапазон дат.
public struct ShoppingList: Decodable, Sendable, Equatable {
    public struct Item: Decodable, Sendable, Equatable, Identifiable {
        public var foodID: String
        public var name: String
        public var quantityText: String

        public init(foodID: String, name: String, quantityText: String) {
            self.foodID = foodID
            self.name = name
            self.quantityText = quantityText
        }

        public var id: String { foodID }

        enum CodingKeys: String, CodingKey {
            case name
            case foodID = "food_id"
            case quantityText = "quantity_text"
        }
    }

    public struct Department: Decodable, Sendable, Equatable, Identifiable {
        public var name: String
        public var items: [Item]

        public init(name: String, items: [Item]) {
            self.name = name
            self.items = items
        }

        public var id: String { name }
    }

    public var from: String
    public var to: String
    public var hasPlans: Bool
    public var departments: [Department]
    public var atHome: [String]

    public init(from: String, to: String, hasPlans: Bool, departments: [Department], atHome: [String] = []) {
        self.from = from
        self.to = to
        self.hasPlans = hasPlans
        self.departments = departments
        self.atHome = atHome
    }

    enum CodingKeys: String, CodingKey {
        case from, to, departments
        case hasPlans = "has_plans"
        case atHome = "at_home"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        from = try container.decodeIfPresent(String.self, forKey: .from) ?? ""
        to = try container.decodeIfPresent(String.self, forKey: .to) ?? ""
        hasPlans = try container.decodeIfPresent(Bool.self, forKey: .hasPlans) ?? false
        departments = try container.decodeIfPresent([Department].self, forKey: .departments) ?? []
        atHome = try container.decodeIfPresent([String].self, forKey: .atHome) ?? []
    }

    /// Текст для «Поделиться»: отдел и строки «— название, количество».
    public var shareText: String {
        var blocks = departments.map { department in
            ([department.name + ":"] + department.items.map { "— \($0.name), \($0.quantityText)" }).joined(separator: "\n")
        }
        if !atHome.isEmpty { blocks.append("Обычно есть дома: " + atHome.joined(separator: ", ")) }
        return blocks.joined(separator: "\n\n")
    }
}
