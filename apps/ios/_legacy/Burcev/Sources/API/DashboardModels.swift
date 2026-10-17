import Foundation

// Дашборд клиента: задачи, неделя, прогресс, первая неделя.

struct SaveMetricRequest: Encodable {
    struct Metric: Encodable {
        let type: String
        let data: [String: MetricValue]
    }
    let date: String
    let metric: Metric

    static func weight(_ kg: Double, date: Date) -> SaveMetricRequest {
        SaveMetricRequest(date: APIDates.day(date), metric: Metric(type: "weight", data: ["weight": .number(kg)]))
    }

    static func steps(_ steps: Int, date: Date) -> SaveMetricRequest {
        SaveMetricRequest(date: APIDates.day(date), metric: Metric(type: "steps", data: ["steps": .number(Double(steps))]))
    }

    static func workout(types: [String], minutes: [String: Int], date: Date) -> SaveMetricRequest {
        var data: [String: MetricValue] = ["completed": .bool(!types.isEmpty)]
        if !types.isEmpty {
            data["types"] = .strings(types)
            data["typeDurations"] = .ints(minutes.filter { types.contains($0.key) && $0.value > 0 })
        }
        return SaveMetricRequest(date: APIDates.day(date), metric: Metric(type: "workout", data: data))
    }
}

/// Значение в `metric.data`: сервер берёт поля по типу, лишние игнорирует.
enum MetricValue: Encodable {
    case number(Double)
    case bool(Bool)
    case strings([String])
    case ints([String: Int])

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case let .number(v): try c.encode(v)
        case let .bool(v): try c.encode(v)
        case let .strings(v): try c.encode(v)
        case let .ints(v): try c.encode(v)
        }
    }
}

/// Виды тренировок — коды, которые принимает сервер, и подписи как на сайте.
enum WorkoutKind: String, CaseIterable, Identifiable {
    case strength, cardio, yoga, hiit, stretching, swimming, running, cycling

    var id: String { rawValue }

    var title: String {
        switch self {
        case .strength: return "Силовая"
        case .cardio: return "Кардио"
        case .yoga: return "Йога"
        case .hiit: return "ВИИТ"
        case .stretching: return "Растяжка"
        case .swimming: return "Плавание"
        case .running: return "Бег"
        case .cycling: return "Велосипед"
        }
    }
}

struct FullDailyMetrics: Decodable, Sendable, Equatable {
    let steps: Int
    let weight: Double?
    let workout_completed: Bool
    let workout_types: [String]?
    let workout_type_durations: [String: Int]?
    let workout_duration: Int?
}

struct ClientTask: Decodable, Sendable, Identifiable, Equatable {
    struct Completion: Decodable, Sendable, Equatable {
        let completed_date: String
    }
    let id: String
    let title: String
    let description: String?
    let type: String
    let due_date: String
    let status: String
    let recurrence: String
    let recurrence_days: [Int]?
    let completions: [Completion]?

    func isDone(on day: Date) -> Bool {
        if recurrence == "once" { return status == "completed" }
        let key = APIDates.day(day)
        return completions?.contains { $0.completed_date.hasPrefix(key) } ?? false
    }

    var icon: String {
        switch type {
        case "nutrition": return "fork.knife"
        case "workout": return "figure.run"
        case "measurement": return "scalemass"
        default: return "checkmark.seal"
        }
    }
}

struct TasksResponse: Decodable, Sendable {
    let tasks: [ClientTask]?
}

struct CompleteTaskRequest: Encodable {
    let date: String
}

struct HistoryDay: Decodable, Sendable, Identifiable, Equatable {
    struct Target: Decodable, Sendable, Equatable {
        let calories: Double
    }
    struct Actual: Decodable, Sendable, Equatable {
        let calories: Double
    }
    let date: String
    let target: Target?
    let actual: Actual

    var id: String { date }

    var day: Date? { APIDates.parseDay(date) }
}

struct HistoryResponse: Decodable, Sendable {
    let days: [HistoryDay]
}

struct Progress: Decodable, Sendable {
    struct Point: Decodable, Sendable, Identifiable {
        let date: String
        let weight: Double
        var id: String { date }
        var day: Date? { APIDates.parseDay(date) }
    }
    let weight_trend: [Point]
    let nutrition_adherence: Double
    let target_weight: Double?
}

struct OnboardingState: Decodable, Sendable {
    struct Step: Decodable, Sendable, Identifiable {
        let key: String
        let done: Bool
        var id: String { key }

        var title: String {
            switch key {
            case "profile": return "Заполнить профиль"
            case "first_meal": return "Записать первый приём пищи"
            case "plate_photo": return "Распознать блюдо по фото"
            case "curator_hello": return "Написать куратору"
            default: return key
            }
        }
    }
    struct Curator: Decodable, Sendable {
        struct Last: Decodable, Sendable {
            let text: String
            let from_curator: Bool
        }
        let conversation_id: String
        let name: String
        let unread_count: Int
        let last_message: Last?
    }
    struct Access: Decodable, Sendable {
        let allowed: Bool
        let expired: Bool
        let expires_at: String?
    }
    let active: Bool
    let steps: [Step]
    let curator: Curator?
    let curator_access: Access?
}

struct CuratorRequest: Encodable {
    let capture_source: String
}
