import Foundation

// «Меню» (бета): план на день из рецептов, рецепты, список покупок.

/// КБЖУ в меню называются по-другому: `kcal`, а не `calories`.
struct MenuNutrition: Decodable, Sendable, Equatable {
    let kcal: Double
    let protein: Double
    let fat: Double
    let carbs: Double
}

struct MenuPercent: Decodable, Sendable, Equatable {
    let kcal: Int
}

struct MealPlanItem: Decodable, Sendable, Identifiable, Equatable {
    let meal_type: String
    let recipe_id: String
    let name: String
    let photo_url: String?
    let grams: Double
    let nutrition: MenuNutrition
    let percent_of_target: MenuPercent?
    let locked: Bool
    let manual_grams: Bool
    let unavailable: Bool
    let eaten: Bool
    let eaten_grams: Double?

    var id: String { meal_type }
    var meal: MealType? { MealType(rawValue: meal_type) }
}

struct MealPlan: Decodable, Sendable, Equatable {
    struct EmptySlot: Decodable, Sendable, Equatable {
        let meal_type: String
        let reason: String
    }
    struct Deviation: Decodable, Sendable, Equatable, Hashable {
        let nutrient: String
        let delta: Double
    }
    let date: String
    let meal_types: [String]
    let target: MenuNutrition
    let target_changed: Bool
    let items: [MealPlanItem]
    let empty: [EmptySlot]
    let totals: MenuNutrition
    let remaining: MenuNutrition
    let deviations: [Deviation]

    func item(for meal: String) -> MealPlanItem? { items.first { $0.meal_type == meal } }
}

struct EatResult: Decodable, Sendable {
    let entry_id: String
    let plan: MealPlan
}

struct EatRequest: Encodable {
    let grams: Double?
    let time: String?
}

struct PlanItemUpdate: Encodable {
    var recipe_id: String?
    var grams: Double?
    var locked: Bool?
    var reset_grams: Bool?
}

struct Alternative: Decodable, Sendable, Identifiable {
    let recipe_id: String
    let name: String
    let photo_url: String?
    let grams: Double
    let nutrition: MenuNutrition
    var id: String { recipe_id }
}

struct AlternativesResponse: Decodable, Sendable {
    let items: [Alternative]
}

struct MealPlanSettings: Codable, Sendable {
    var meal_types: [String]
}

struct RecipeSummary: Decodable, Sendable, Identifiable, Hashable {
    struct PerPortion: Decodable, Sendable, Hashable {
        let kcal: Double
        let protein: Double
        let fat: Double
        let carbs: Double
    }
    let id: String
    let name: String
    let photo_url: String?
    let cook_minutes: Int?
    let complexity: String?
    let meal_types: [String]?
    let portion_grams: Double?
    let per_portion: PerPortion?
}

struct RecipesPage: Decodable, Sendable {
    let items: [RecipeSummary]
    let total: Int
}

struct RecipeVersion: Decodable, Sendable {
    struct Ingredient: Decodable, Sendable, Identifiable {
        let position: Int
        let food_name: String?
        let source_name: String?
        let grams: Double?
        let display_quantity: String?
        let to_taste: Bool
        var id: Int { position }
        var title: String { food_name ?? source_name ?? "—" }
    }
    struct Step: Decodable, Sendable, Identifiable {
        let position: Int
        let text: String
        let photo_url: String?
        var id: Int { position }
    }
    let recipe_id: String
    let name: String
    let description: String?
    let photo_url: String?
    let cook_minutes: Int?
    let servings: Int?
    let portion_grams: Double?
    let per_portion: MenuNutrition?
    let ingredients: [Ingredient]
    let steps: [Step]
}

struct ShoppingList: Decodable, Sendable {
    struct Department: Decodable, Sendable, Identifiable {
        struct Item: Decodable, Sendable, Identifiable {
            let food_id: String
            let name: String
            let quantity_text: String
            var id: String { food_id }
        }
        let name: String
        let items: [Item]
        var id: String { name }
    }
    let from: String
    let to: String
    let has_plans: Bool
    let departments: [Department]
    let at_home: [String]
}
