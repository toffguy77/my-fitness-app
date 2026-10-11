import Foundation

// Кабинет куратора: сводка, план, задачи, отчёты, заявки, поддержка.

struct CuratorAnalytics: Decodable, Sendable {
    let total_clients: Int
    let attention_clients: Int
    let avg_kbzhu_percent: Double
    let total_unread: Int
    let active_tasks: Int
    let overdue_tasks: Int
    let completed_today: Int
}

struct AttentionItem: Decodable, Sendable, Identifiable {
    let client_id: Int64
    let client_name: String
    let reason: String
    let detail: String
    let priority: Int

    var id: String { "\(client_id)-\(reason)-\(detail)" }

    var reasonTitle: String {
        switch reason {
        case "red_alert": return "Отклонение"
        case "overdue_task": return "Просрочена задача"
        case "inactive": return "Нет записей"
        case "unread_message": return "Не отвечено"
        case "awaiting_feedback": return "Ждёт отзыва"
        case "incomplete_profile": return "Профиль не заполнен"
        default: return reason
        }
    }
}

struct CuratorTask: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let title: String
    let type: String
    let description: String?
    let deadline: String
    let recurrence: String
    let recurrence_days: [Int]?
    let status: String
    let completions: [String]?
}

struct CuratorTaskRequest: Encodable {
    let title: String
    let type: String
    let description: String?
    let deadline: String
    let recurrence: String
    let recurrence_days: [Int]?
}

struct CuratorTaskUpdate: Encodable {
    var title: String?
    var description: String?
    var deadline: String?
    var status: String?
}

struct CuratorPlan: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let calories: Double
    let protein: Double
    let fat: Double
    let carbs: Double
    let start_date: String
    let end_date: String
    let comment: String?
    let is_active: Bool
}

struct CuratorPlanRequest: Encodable {
    let calories: Double
    let protein: Double
    let fat: Double
    let carbs: Double
    let start_date: String
    let end_date: String
    let comment: String?
}

struct CuratorPlanUpdate: Encodable {
    let calories: Double
    let protein: Double
    let fat: Double
    let carbs: Double
    let comment: String?
}

struct FeedbackCategory: Codable, Sendable, Equatable {
    var rating: String
    var comment: String?
}

struct CuratorFeedback: Codable, Sendable, Equatable {
    var nutrition: FeedbackCategory?
    var activity: FeedbackCategory?
    var water: FeedbackCategory?
    var photo_uploaded: Bool?
    var summary: String
    var recommendations: String?
}

struct CuratorReport: Decodable, Sendable, Identifiable {
    struct Summary: Decodable, Sendable {
        let days_with_nutrition: Int?
        let days_with_weight: Int?
        let days_with_activity: Int?
        let average_calories: Double?
        let average_weight: Double?
        let total_steps: Int?
        let workouts_completed: Int?
    }
    let id: String
    let week_start: String
    let week_end: String
    let summary: Summary?
    let curator_feedback: CuratorFeedback?
    let has_feedback: Bool
}

struct TargetWeightRequest: Encodable {
    let target_weight: Double?
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(target_weight, forKey: .target_weight)
    }
    private enum CodingKeys: String, CodingKey { case target_weight }
}

struct WaterGoalRequest: Encodable {
    let water_goal: Int?
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(water_goal, forKey: .water_goal)
    }
    private enum CodingKeys: String, CodingKey { case water_goal }
}

struct Page<T: Decodable & Sendable>: Decodable, Sendable {
    let items: [T]
    let total: Int
}

struct Lead: Decodable, Sendable, Identifiable {
    struct Parameters: Decodable, Sendable {
        let height_cm: Double?
        let weight_kg: Double?
        let goal: String?
    }
    struct Result: Decodable, Sendable {
        let calories: Double?
    }
    let id: String
    let email: String
    let name: String?
    let parameters: Parameters?
    let result: Result?
    let last_step: String?
    let handled_at: String?
    let age_days: Int?
    let contact_allowed: Bool?
}

struct SupportConversation: Decodable, Sendable, Identifiable {
    let id: String
    let status: String
    let telegram_username: String?
    let telegram_name: String?
    let escalation_reason: String?

    var title: String { telegram_name ?? telegram_username.map { "@\($0)" } ?? "Без имени" }
}

struct SupportThread: Decodable, Sendable {
    struct Item: Decodable, Sendable, Identifiable {
        let id: String
        let author: String
        let text: String
        let created_at: String
    }
    let conversation: SupportConversation
    let messages: [Item]
}

struct ReplyRequest: Encodable {
    let text: String
}
