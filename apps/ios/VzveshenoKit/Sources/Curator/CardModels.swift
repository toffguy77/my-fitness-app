import Client
import Foundation

/// План недели (`GET …/weekly-plans`).
public struct WeeklyPlan: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    public var macros: Macros
    public var startDate: String
    public var endDate: String
    public var comment: String?
    public var isActive: Bool

    public init(id: String, macros: Macros, startDate: String, endDate: String, comment: String? = nil, isActive: Bool) {
        self.id = id
        self.macros = macros
        self.startDate = startDate
        self.endDate = endDate
        self.comment = comment
        self.isActive = isActive
    }

    enum CodingKeys: String, CodingKey {
        case id, comment
        case startDate = "start_date"
        case endDate = "end_date"
        case isActive = "is_active"
    }

    public init(from decoder: Decoder) throws {
        macros = try Macros(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        startDate = DayKey.of(try container.decodeIfPresent(String.self, forKey: .startDate) ?? "")
        endDate = DayKey.of(try container.decodeIfPresent(String.self, forKey: .endDate) ?? "")
        comment = try container.decodeIfPresent(String.self, forKey: .comment)
        isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive) ?? false
    }
}

/// Тип задачи клиента.
public enum TaskKind: String, CaseIterable, Sendable, Identifiable {
    case nutrition, workout, habit, measurement

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .nutrition: return "Питание"
        case .workout: return "Тренировка"
        case .habit: return "Привычка"
        case .measurement: return "Замеры"
        }
    }
}

/// Повторение задачи.
public enum TaskRecurrence: String, CaseIterable, Sendable, Identifiable {
    case once, daily, weekly

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .once: return "Однократно"
        case .daily: return "Ежедневно"
        case .weekly: return "Еженедельно"
        }
    }
}

/// Фильтр вкладки «Задачи».
public enum TaskFilter: String, CaseIterable, Sendable, Identifiable {
    case active, completed, overdue

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .active: return "Активные"
        case .completed: return "Завершённые"
        case .overdue: return "Просроченные"
        }
    }
}

/// Задача клиента (`GET …/tasks`).
public struct CuratorTask: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var type: String
    public var description: String?
    /// `yyyy-MM-dd`.
    public var deadline: String
    public var recurrence: String
    public var recurrenceDays: [Int]
    /// `active`, `completed`, `overdue` (просрочку однократной задачи считает сервер).
    public var status: String

    public init(id: String, title: String, type: String, description: String? = nil, deadline: String, recurrence: String = "once",
                recurrenceDays: [Int] = [], status: String) {
        self.id = id
        self.title = title
        self.type = type
        self.description = description
        self.deadline = deadline
        self.recurrence = recurrence
        self.recurrenceDays = recurrenceDays
        self.status = status
    }

    enum CodingKeys: String, CodingKey {
        case id, title, type, description, deadline, recurrence, status
        case recurrenceDays = "recurrence_days"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        type = try container.decodeIfPresent(String.self, forKey: .type) ?? "habit"
        description = try container.decodeIfPresent(String.self, forKey: .description)
        deadline = DayKey.of(try container.decodeIfPresent(String.self, forKey: .deadline) ?? "")
        recurrence = try container.decodeIfPresent(String.self, forKey: .recurrence) ?? "once"
        recurrenceDays = try container.decodeIfPresent([Int].self, forKey: .recurrenceDays) ?? []
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "active"
    }

    /// Фильтр, в который попадает задача. Сервер хранит только `active` и
    /// `completed`, а `overdue` вычисляет при чтении — поэтому список
    /// загружается целиком и делится здесь, а не `?status=overdue`
    /// (такой запрос сервер не находит никогда).
    public func filter(today: String) -> TaskFilter {
        switch status {
        case "completed": return .completed
        case "overdue": return .overdue
        default:
            if recurrence == "once", !deadline.isEmpty, deadline < today { return .overdue }
            return .active
        }
    }

    public var kind: TaskKind? { TaskKind(rawValue: type) }
}

/// Оценка в отзыве: «Отлично», «Хорошо», «Нужно улучшить».
public enum FeedbackRating: String, CaseIterable, Sendable, Codable, Identifiable {
    case excellent, good
    case needsImprovement = "needs_improvement"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .excellent: return "Отлично"
        case .good: return "Хорошо"
        case .needsImprovement: return "Нужно улучшить"
        }
    }
}

/// Тело `PUT …/weekly-reports/:reportId/feedback` и сохранённый отзыв.
public struct WeeklyFeedbackBody: Codable, Sendable, Equatable {
    public struct Category: Codable, Sendable, Equatable {
        public var rating: FeedbackRating
        public var comment: String

        public init(rating: FeedbackRating, comment: String = "") {
            self.rating = rating
            self.comment = comment
        }

        enum CodingKeys: String, CodingKey { case rating, comment }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            rating = FeedbackRating(rawValue: try container.decodeIfPresent(String.self, forKey: .rating) ?? "") ?? .good
            comment = try container.decodeIfPresent(String.self, forKey: .comment) ?? ""
        }
    }

    public var nutrition: Category?
    public var activity: Category?
    public var water: Category?
    public var photoUploaded: Bool?
    public var summary: String
    public var recommendations: String

    public init(nutrition: Category? = nil, activity: Category? = nil, water: Category? = nil, photoUploaded: Bool? = nil,
                summary: String, recommendations: String = "") {
        self.nutrition = nutrition
        self.activity = activity
        self.water = water
        self.photoUploaded = photoUploaded
        self.summary = summary
        self.recommendations = recommendations
    }

    enum CodingKeys: String, CodingKey {
        case nutrition, activity, water, summary, recommendations
        case photoUploaded = "photo_uploaded"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        nutrition = try container.decodeIfPresent(Category.self, forKey: .nutrition)
        activity = try container.decodeIfPresent(Category.self, forKey: .activity)
        water = try container.decodeIfPresent(Category.self, forKey: .water)
        photoUploaded = try container.decodeIfPresent(Bool.self, forKey: .photoUploaded)
        summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
        recommendations = try container.decodeIfPresent(String.self, forKey: .recommendations) ?? ""
    }
}

/// Недельный отчёт клиента (`GET …/weekly-reports`).
public struct WeeklyReport: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    public var weekStart: String
    public var weekEnd: String
    public var weekNumber: Int
    public var feedback: WeeklyFeedbackBody?
    public var hasFeedback: Bool

    public init(id: String, weekStart: String, weekEnd: String, weekNumber: Int = 0, feedback: WeeklyFeedbackBody? = nil,
                hasFeedback: Bool) {
        self.id = id
        self.weekStart = weekStart
        self.weekEnd = weekEnd
        self.weekNumber = weekNumber
        self.feedback = feedback
        self.hasFeedback = hasFeedback
    }

    enum CodingKeys: String, CodingKey {
        case id
        case weekStart = "week_start"
        case weekEnd = "week_end"
        case weekNumber = "week_number"
        case feedback = "curator_feedback"
        case hasFeedback = "has_feedback"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        weekStart = DayKey.of(try container.decodeIfPresent(String.self, forKey: .weekStart) ?? "")
        weekEnd = DayKey.of(try container.decodeIfPresent(String.self, forKey: .weekEnd) ?? "")
        weekNumber = try container.decodeIfPresent(Int.self, forKey: .weekNumber) ?? 0
        feedback = try? container.decodeIfPresent(WeeklyFeedbackBody.self, forKey: .feedback)
        hasFeedback = try container.decodeIfPresent(Bool.self, forKey: .hasFeedback) ?? false
    }

    /// «Обратная связь дана» или «Ожидает обратной связи».
    public var statusTitle: String { hasFeedback ? "Обратная связь дана" : "Ожидает обратной связи" }

    /// «13–19 октября».
    public var periodTitle: String {
        let start = DayText.dayMonth(weekStart)
        let end = DayText.dayMonth(weekEnd)
        let startParts = start.split(separator: " ")
        let endParts = end.split(separator: " ")
        if startParts.count == 2, endParts.count == 2, startParts[1] == endParts[1] {
            return "\(startParts[0])–\(end)"
        }
        return "\(start) – \(end)"
    }
}
