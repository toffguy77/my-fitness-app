import Foundation

// Модели ответов API. Ключи заданы явно: сервер смешивает snake_case и
// camelCase даже внутри одного объекта (FoodItem), и общая стратегия
// декодирования сломала бы половину полей.
//
// Поля с omitempty на сервере — опциональные: пустой срез Go в таком поле
// не приходит вовсе.

// MARK: - Авторизация

enum Role: String, Decodable, Sendable {
    case client
    case coordinator
    case superAdmin = "super_admin"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Role(rawValue: raw) ?? .unknown
    }
}

struct SessionUser: Decodable, Sendable, Equatable {
    let id: Int64
    let email: String
    let name: String?
    let role: Role
}

struct LoginResult: Decodable, Sendable {
    let user: SessionUser
    let token: String
}

struct LoginRequest: Encodable {
    let email: String
    let password: String
    let remember_me: Bool
}

struct RefreshRequest: Encodable {
    let refresh_token: String
}

struct MeResponse: Decodable, Sendable {
    struct User: Decodable, Sendable {
        let id: Int64
        let email: String
        let role: Role
        let has_password: Bool
    }
    let user: User
}

// MARK: - Питание

struct Macros: Decodable, Sendable, Equatable {
    var calories: Double
    var protein: Double
    var fat: Double
    var carbs: Double

    static let zero = Macros(calories: 0, protein: 0, fat: 0, carbs: 0)
}

enum MealType: String, Codable, Sendable, CaseIterable, Identifiable {
    case breakfast, lunch, dinner, snack

    var id: String { rawValue }

    var title: String {
        switch self {
        case .breakfast: return "Завтрак"
        case .lunch: return "Обед"
        case .dinner: return "Ужин"
        case .snack: return "Перекус"
        }
    }
}

struct FoodEntry: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let foodName: String
    let mealType: MealType
    let portionType: String
    let portionAmount: Double
    let nutrition: Macros
    let time: String
}

struct EntriesResponse: Decodable, Sendable {
    let entries: [String: [FoodEntry]]
    let dailyTotals: Macros

    func entries(for meal: MealType) -> [FoodEntry] {
        entries[meal.rawValue] ?? []
    }
}

struct FoodItem: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let name: String
    let brand: String?
    let servingSize: Double?
    let servingUnit: String?
    let nutritionPer100: Macros
}

struct SearchResponse: Decodable, Sendable {
    let items: [FoodItem]
    let total: Int
}

struct CreateEntryRequest: Encodable {
    let foodId: String
    let mealType: MealType
    let portionType: String
    let portionAmount: Double
    let time: String
    let date: String
    /// Переопределения — итоги на порцию. Нужны для распознанного по фото
    /// (`foodId` с приставкой `ai-`: сервер заводит продукт, только если
    /// пришли все пять) и для правки КБЖУ вручную.
    var foodName: String?
    var calories: Double?
    var protein: Double?
    var fat: Double?
    var carbs: Double?
}

struct UpdateEntryRequest: Encodable {
    let mealType: MealType
    let portionType: String
    let portionAmount: Double
    let time: String
    let foodName: String
    let calories: Double
    let protein: Double
    let fat: Double
    let carbs: Double
}

struct BarcodeResult: Decodable, Sendable {
    let found: Bool
    let food: FoodItem?
    let message: String?
}

struct FoodsList: Decodable, Sendable {
    let foods: [FoodItem]?
}

struct RecognizedFood: Decodable, Sendable, Identifiable, Equatable {
    let name: String
    let confidence: Double
    let estimated_weight: Double?
    /// На 100 г.
    let nutrition: Macros

    var id: String { name }
}

struct Recognition: Decodable, Sendable {
    let foods: [RecognizedFood]
    let composition: [RecognizedFood]?
    let remaining_recognitions: Int?
}

struct CreateUserFoodRequest: Encodable {
    let name: String
    let brand: String?
    let calories_per_100: Double
    let protein_per_100: Double
    let fat_per_100: Double
    let carbs_per_100: Double
}

struct UserFood: Decodable, Sendable {
    let id: String
    let name: String
    let brand: String?
    let calories_per_100: Double
    let protein_per_100: Double
    let fat_per_100: Double
    let carbs_per_100: Double

    var asFoodItem: FoodItem {
        FoodItem(id: id, name: name, brand: brand, servingSize: 100, servingUnit: "g",
                 nutritionPer100: Macros(calories: calories_per_100, protein: protein_per_100,
                                         fat: fat_per_100, carbs: carbs_per_100))
    }
}

struct DeleteResult: Decodable, Sendable {}

struct Water: Decodable, Sendable, Equatable {
    let glasses: Int
    let goal: Int
    let glass_size: Int
    let enabled: Bool
}

struct AddWaterRequest: Encodable {
    let date: String
    let glasses: Int
}

/// Цели на день. Сервер отвечает либо плоской записью с `calories`, либо
/// `{"targets":null,"message":…}`, когда посчитать нечем (нет веса или профиля).
struct DailyTargets: Decodable, Sendable, Equatable {
    let macros: Macros?
    let message: String?
    let isCuratorOverride: Bool

    private enum CodingKeys: String, CodingKey {
        case calories, protein, fat, carbs, source, message
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let calories = try c.decodeIfPresent(Double.self, forKey: .calories) {
            macros = Macros(
                calories: calories,
                protein: try c.decodeIfPresent(Double.self, forKey: .protein) ?? 0,
                fat: try c.decodeIfPresent(Double.self, forKey: .fat) ?? 0,
                carbs: try c.decodeIfPresent(Double.self, forKey: .carbs) ?? 0)
        } else {
            macros = nil
        }
        message = try c.decodeIfPresent(String.self, forKey: .message)
        isCuratorOverride = (try c.decodeIfPresent(String.self, forKey: .source)) == "curator_override"
    }
}

struct DailyMetrics: Decodable, Sendable, Equatable {
    let steps: Int
    let weight: Double?
    let workout_completed: Bool
}

// MARK: - Чат

struct Participant: Decodable, Sendable, Equatable {
    let id: Int64
    let name: String
    let avatar_url: String?
}

struct Message: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let sender_id: Int64
    let type: String
    let content: String?
    let created_at: String

    var createdAt: Date? { APIDates.timestamp(created_at) }
}

struct Conversation: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let last_message: Message?
    let unread_count: Int
    let participant: Participant
}

struct SendMessageRequest: Encodable {
    let type: String
    let content: String
}

// MARK: - Куратор

struct ClientAlert: Decodable, Sendable, Equatable, Hashable {
    let level: String
    let message: String
}

struct ClientCard: Decodable, Sendable, Identifiable, Equatable {
    let id: Int64
    let name: String
    let email: String?
    let today_kbzhu: Macros
    let plan: Macros?
    let alerts: [ClientAlert]
    let unread_count: Int
    let last_weight: Double?
    let weight_trend: String
    let target_weight: Double?
    let active_tasks_count: Int
    let overdue_tasks_count: Int
    let streak_days: Int
}

struct ClientFoodEntry: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let food_name: String
    let meal_type: String
    let calories: Double
    let weight: Double?
    let time: String
}

struct ClientDay: Decodable, Sendable, Identifiable, Equatable {
    let date: String
    let kbzhu: Macros
    let plan: Macros?
    let alerts: [ClientAlert]
    let steps: Int
    let food_entries: [ClientFoodEntry]

    var id: String { date }
}

struct ClientDetail: Decodable, Sendable, Equatable {
    let id: Int64
    let name: String
    let email: String?
    let last_weight: Double?
    let target_weight: Double?
    let days: [ClientDay]
}

// MARK: - Профиль и удаление

struct ProfileResponse: Decodable, Sendable {
    struct Profile: Decodable, Sendable {
        let id: Int64
        let email: String
        let name: String?
        let role: Role
    }
    let profile: Profile
}

struct DeletionStatus: Decodable, Sendable, Equatable {
    let requested: Bool
    let scheduled_for: String?
}

struct DeletionRequest: Encodable {
    let current_password: String
    let code: String
}

struct CodeSent: Decodable, Sendable {}
