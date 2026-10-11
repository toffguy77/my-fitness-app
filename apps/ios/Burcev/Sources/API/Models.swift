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
    var email_verified: Bool? = nil
    var onboarding_completed: Bool? = nil
}

/// Согласия при регистрации и входе по ссылке — четыре флага, как на сайте.
/// Первые три обязательны: сервер без них ссылку не отправит.
struct Consents: Encodable {
    let terms_of_service: Bool
    let privacy_policy: Bool
    let data_processing: Bool
    let marketing: Bool
}

struct RegisterRequest: Encodable {
    let email: String
    let password: String
    let consents: Consents
}

struct MagicLinkRequest: Encodable {
    let email: String
    let consents: Consents
}

struct TokenRequest: Encodable {
    let token: String
}

struct EmailRequest: Encodable {
    let email: String
}

struct ResetPasswordRequest: Encodable {
    let token: String
    let password: String
}

struct CodeRequest: Encodable {
    let code: String
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
    struct Attachment: Decodable, Sendable, Equatable {
        let file_url: String
        let file_name: String?
        let mime_type: String?
    }
    let id: String
    var conversation_id: String? = nil
    let sender_id: Int64
    let type: String
    let content: String?
    let created_at: String
    var attachments: [Attachment]? = nil

    /// Картинка сообщения: вложение или, как отправляет сайт, ссылка в тексте.
    var imageURL: URL? {
        guard type == "image" else { return nil }
        if let first = attachments?.first, let url = URL(string: first.file_url) { return url }
        return content.flatMap(URL.init(string:))
    }

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
        let avatar_url: String?
        let settings: ProfileSettings?
    }
    let profile: Profile
}

struct ProfileSettings: Decodable, Sendable, Equatable {
    let timezone: String?
    let apple_health_enabled: Bool?
    let target_weight: Double?
    let height: Double?
    let birth_date: String?
    let biological_sex: String?
    let activity_level: String?
    let fitness_goal: String?
}

/// Тело и цели. Сервер обновляет только присланные ключи, а `null` очищает —
/// поэтому кодируем все поля явно.
struct BodySettingsRequest: Encodable {
    var height: Double?
    var birth_date: String?
    var biological_sex: String?
    var activity_level: String?
    var fitness_goal: String?
    var target_weight: Double?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(height, forKey: .height)
        try c.encode(birth_date, forKey: .birth_date)
        try c.encode(biological_sex, forKey: .biological_sex)
        try c.encode(activity_level, forKey: .activity_level)
        try c.encode(fitness_goal, forKey: .fitness_goal)
        try c.encode(target_weight, forKey: .target_weight)
    }

    private enum CodingKeys: String, CodingKey {
        case height, birth_date, biological_sex, activity_level, fitness_goal, target_weight
    }
}

struct HealthFlagRequest: Encodable {
    let apple_health_enabled: Bool
}

struct NameRequest: Encodable {
    let name: String
}

struct FoodRestrictions: Decodable, Sendable {
    struct Excluded: Decodable, Sendable, Identifiable {
        let food_id: String
        let name: String
        var id: String { food_id }
    }
    struct Named: Decodable, Sendable, Identifiable {
        let id: String
        let name: String
    }
    let allergens: [String]
    let excluded_foods: [Excluded]?
    let rejected_recipes: [Named]?
}

struct RestrictionsRequest: Encodable {
    let allergens: [String]
    let excluded_food_ids: [String]
}

enum Allergen: String, CaseIterable, Identifiable {
    case nuts, peanuts, gluten, lactose, eggs, fish, seafood, soy, sesame, mustard, celery
    var id: String { rawValue }
    var title: String {
        switch self {
        case .nuts: return "Орехи"
        case .peanuts: return "Арахис"
        case .gluten: return "Глютен"
        case .lactose: return "Лактоза"
        case .eggs: return "Яйца"
        case .fish: return "Рыба"
        case .seafood: return "Морепродукты"
        case .soy: return "Соя"
        case .sesame: return "Кунжут"
        case .mustard: return "Горчица"
        case .celery: return "Сельдерей"
        }
    }
}

struct TelegramStatus: Decodable, Sendable {
    let linked: Bool
    let username: String?
}

struct TelegramLink: Decodable, Sendable {
    let url: String
}

struct DataExport: Decodable, Sendable, Identifiable {
    let id: String
    let status: String
    let requested_at: String
    let expires_at: String?
    let downloaded: Bool?
}

struct ExportsList: Decodable, Sendable {
    let exports: [DataExport]?
}

struct ChangePasswordRequest: Encodable {
    let current_password: String
    let new_password: String
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
