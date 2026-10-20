import Foundation

// Уведомления, статьи, настройки уведомлений.

struct AppNotification: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let category: String
    let type: String
    let title: String
    let content: String
    let createdAt: String
    let readAt: String?
    let actionUrl: String?

    var isRead: Bool { readAt != nil }
    var created: Date? { APIDates.timestamp(createdAt) }

    var icon: String {
        switch type {
        case "trainer_feedback", "feedback_received": return "text.bubble"
        case "achievement": return "trophy"
        case "reminder": return "bell"
        case "plan_updated": return "list.clipboard"
        case "task_assigned": return "checklist"
        case "task_overdue": return "exclamationmark.circle"
        case "new_content": return "doc.richtext"
        case "export_ready": return "square.and.arrow.down"
        case "curator_access_ending", "curator_access_ended": return "person.crop.circle.badge.exclamationmark"
        default: return "bell"
        }
    }

    /// `actionUrl` — путь сайта. Статьи открываем в приложении, остальное —
    /// по вкладкам; ссылку, которую приложение не знает, открывает браузер.
    var articleID: String? {
        guard let url = actionUrl, url.hasPrefix("/content/") else { return nil }
        return String(url.dropFirst("/content/".count))
    }
}

struct NotificationsPage: Decodable, Sendable {
    let notifications: [AppNotification]
    let total: Int
    let hasMore: Bool
}

struct UnreadCounts: Decodable, Sendable, Equatable {
    let main: Int
    let content: Int
    var total: Int { main + content }
}

struct MarkAllRequest: Encodable {
    let category: String
}

struct DeliveryPreferences: Codable, Sendable, Equatable {
    struct TypeSetting: Codable, Sendable, Equatable, Identifiable {
        let type: String
        var app: Bool
        var email: Bool
        var push: Bool
        var id: String { type }

        var title: String {
            switch type {
            case "trainer_feedback": return "Ответ куратора"
            case "feedback_received": return "Отзыв на недельный отчёт"
            case "plan_updated": return "Новый план питания"
            case "task_assigned": return "Новая задача"
            case "task_overdue": return "Просроченная задача"
            case "export_ready": return "Выгрузка данных готова"
            case "client_left": return "Клиент ушёл"
            case "reminder": return "Напоминания"
            case "achievement": return "Достижения"
            case "system_update": return "Обновления сервиса"
            case "new_feature": return "Новые возможности"
            case "general": return "Общие"
            case "new_content": return "Новые статьи"
            default: return type
            }
        }
    }
    var types: [TypeSetting]
    var quietHoursStart: Int?
    var quietHoursEnd: Int?
    var timezone: String?
    var emailUnsubscribed: Bool?

    /// Сервер ждёт оба часа тишины или ни одного — пишем null явно.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(types, forKey: .types)
        try c.encode(quietHoursStart, forKey: .quietHoursStart)
        try c.encode(quietHoursEnd, forKey: .quietHoursEnd)
        try c.encodeIfPresent(emailUnsubscribed, forKey: .emailUnsubscribed)
    }
}

struct Article: Decodable, Sendable, Identifiable, Equatable, Hashable {
    let id: String
    let author_name: String?
    let title: String
    let excerpt: String?
    let cover_image_url: String?
    let category: String
    let published_at: String?
    let body: String?

    var categoryTitle: String { ContentCategory(rawValue: category)?.title ?? category }
    var published: Date? { published_at.flatMap(APIDates.timestamp) }
}

struct FeedPage: Decodable, Sendable {
    let articles: [Article]
    let total: Int
}

enum ContentCategory: String, CaseIterable, Identifiable {
    case nutrition, training, recipes, health, motivation, general

    var id: String { rawValue }

    var title: String {
        switch self {
        case .nutrition: return "Питание"
        case .training: return "Тренировки"
        case .recipes: return "Рецепты"
        case .health: return "Здоровье"
        case .motivation: return "Мотивация"
        case .general: return "Общее"
        }
    }
}
