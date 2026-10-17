import Foundation

// Ответы API, из которых собирается «Сегодня» (`ios-client-today`). Имена
// полей — как на проводе (snake_case); даты дня приходят то `2026-10-17`,
// то `2026-10-17T00:00:00Z`, то с поясом профиля — день берётся первыми
// десятью символами (`DayKey.of`).

/// Источник значения дня: `null` — ещё не вводилось.
public enum MetricSource: String, Codable, Sendable, Equatable {
    case manual
    case healthkit
}

/// `GET /dashboard/daily/:date` и элемент `GET /dashboard/week` (`DailyMetrics`).
public struct DailyMetrics: Decodable, Sendable, Equatable {
    public var date: String
    public var calories: Int
    public var protein: Int
    public var fat: Int
    public var carbs: Int
    public var weight: Double?
    public var steps: Int
    public var workoutCompleted: Bool
    public var workoutTypes: [String]?
    public var workoutTypeDurations: [String: Int]?
    public var workoutDuration: Int?
    public var stepsSource: MetricSource?
    public var weightSource: MetricSource?
    public var workoutSource: MetricSource?
    public var updatedAt: String?

    public init(date: String, calories: Int = 0, protein: Int = 0, fat: Int = 0, carbs: Int = 0, weight: Double? = nil,
                steps: Int = 0, workoutCompleted: Bool = false, workoutTypes: [String]? = nil,
                workoutTypeDurations: [String: Int]? = nil, workoutDuration: Int? = nil,
                stepsSource: MetricSource? = nil, weightSource: MetricSource? = nil, workoutSource: MetricSource? = nil,
                updatedAt: String? = nil) {
        self.date = date
        self.calories = calories
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
        self.weight = weight
        self.steps = steps
        self.workoutCompleted = workoutCompleted
        self.workoutTypes = workoutTypes
        self.workoutTypeDurations = workoutTypeDurations
        self.workoutDuration = workoutDuration
        self.stepsSource = stepsSource
        self.weightSource = weightSource
        self.workoutSource = workoutSource
        self.updatedAt = updatedAt
    }

    /// День записи, `yyyy-MM-dd`.
    public var day: String { DayKey.of(date) }

    enum CodingKeys: String, CodingKey {
        case date, calories, protein, fat, carbs, weight, steps
        case workoutCompleted = "workout_completed"
        case workoutTypes = "workout_types"
        case workoutTypeDurations = "workout_type_durations"
        case workoutDuration = "workout_duration"
        case stepsSource = "steps_source"
        case weightSource = "weight_source"
        case workoutSource = "workout_source"
        case updatedAt = "updated_at"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        date = try container.decode(String.self, forKey: .date)
        calories = try container.decodeIfPresent(Int.self, forKey: .calories) ?? 0
        protein = try container.decodeIfPresent(Int.self, forKey: .protein) ?? 0
        fat = try container.decodeIfPresent(Int.self, forKey: .fat) ?? 0
        carbs = try container.decodeIfPresent(Int.self, forKey: .carbs) ?? 0
        weight = try container.decodeIfPresent(Double.self, forKey: .weight)
        steps = try container.decodeIfPresent(Int.self, forKey: .steps) ?? 0
        workoutCompleted = try container.decodeIfPresent(Bool.self, forKey: .workoutCompleted) ?? false
        workoutTypes = try container.decodeIfPresent([String].self, forKey: .workoutTypes)
        workoutTypeDurations = try container.decodeIfPresent([String: Int].self, forKey: .workoutTypeDurations)
        workoutDuration = try container.decodeIfPresent(Int.self, forKey: .workoutDuration)
        // Незнакомый источник — не повод терять день.
        stepsSource = try? container.decodeIfPresent(MetricSource.self, forKey: .stepsSource)
        weightSource = try? container.decodeIfPresent(MetricSource.self, forKey: .weightSource)
        workoutSource = try? container.decodeIfPresent(MetricSource.self, forKey: .workoutSource)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
    }
}

/// `GET /dashboard/week` → `{metrics, count}`: только дни, у которых есть строка.
public struct WeekMetrics: Decodable, Sendable, Equatable {
    public var metrics: [DailyMetrics]

    public init(metrics: [DailyMetrics]) { self.metrics = metrics }
}

/// Активный план куратора (`GET /dashboard/weekly-plan`).
public struct WeeklyPlan: Decodable, Sendable, Equatable {
    public var id: String
    public var caloriesGoal: Int
    public var proteinGoal: Int
    public var fatGoal: Int?
    public var carbsGoal: Int?
    public var stepsGoal: Int?
    public var startDate: String
    public var endDate: String

    public init(id: String = "plan", caloriesGoal: Int, proteinGoal: Int, fatGoal: Int? = nil, carbsGoal: Int? = nil,
                stepsGoal: Int? = nil, startDate: String = "", endDate: String = "") {
        self.id = id
        self.caloriesGoal = caloriesGoal
        self.proteinGoal = proteinGoal
        self.fatGoal = fatGoal
        self.carbsGoal = carbsGoal
        self.stepsGoal = stepsGoal
        self.startDate = startDate
        self.endDate = endDate
    }

    enum CodingKeys: String, CodingKey {
        case id
        case caloriesGoal = "calories_goal"
        case proteinGoal = "protein_goal"
        case fatGoal = "fat_goal"
        case carbsGoal = "carbs_goal"
        case stepsGoal = "steps_goal"
        case startDate = "start_date"
        case endDate = "end_date"
    }
}

/// Ответ `GET /dashboard/weekly-plan`: `{"plan": null}` без плана, иначе сам план.
public struct WeeklyPlanAnswer: Decodable, Sendable, Equatable {
    public var plan: WeeklyPlan?

    public init(plan: WeeklyPlan?) { self.plan = plan }

    private enum Keys: String, CodingKey { case plan }

    public init(from decoder: Decoder) throws {
        let keyed = try decoder.container(keyedBy: Keys.self)
        if keyed.contains(.plan) {
            plan = try keyed.decodeIfPresent(WeeklyPlan.self, forKey: .plan)
        } else {
            plan = try WeeklyPlan(from: decoder)
        }
    }
}

/// Расчётная норма дня (`DailyTargetRecord`).
public struct CalculatedTargets: Decodable, Sendable, Equatable {
    public var calories: Double
    public var protein: Double
    public var fat: Double
    public var carbs: Double
    public var workoutBonus: Double

    public init(calories: Double, protein: Double, fat: Double, carbs: Double, workoutBonus: Double = 0) {
        self.calories = calories
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
        self.workoutBonus = workoutBonus
    }

    enum CodingKeys: String, CodingKey {
        case calories, protein, fat, carbs
        case workoutBonus = "workout_bonus"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        calories = try container.decode(Double.self, forKey: .calories)
        protein = try container.decodeIfPresent(Double.self, forKey: .protein) ?? 0
        fat = try container.decodeIfPresent(Double.self, forKey: .fat) ?? 0
        carbs = try container.decodeIfPresent(Double.self, forKey: .carbs) ?? 0
        workoutBonus = try container.decodeIfPresent(Double.self, forKey: .workoutBonus) ?? 0
    }
}

/// Чего не хватает для расчёта нормы.
public struct MissingTargetInputs: Decodable, Sendable, Equatable {
    public var profile: Bool
    public var weight: Bool

    public init(profile: Bool, weight: Bool) {
        self.profile = profile
        self.weight = weight
    }
}

/// Ответ `GET /nutrition-calc/targets?date=`: запись нормы или `{targets: null, missing}`.
public struct TargetsAnswer: Decodable, Sendable, Equatable {
    public var targets: CalculatedTargets?
    public var missing: MissingTargetInputs?

    public init(targets: CalculatedTargets?, missing: MissingTargetInputs? = nil) {
        self.targets = targets
        self.missing = missing
    }

    private enum Keys: String, CodingKey { case targets, missing, calories }

    public init(from decoder: Decoder) throws {
        let keyed = try decoder.container(keyedBy: Keys.self)
        if keyed.contains(.calories) {
            targets = try CalculatedTargets(from: decoder)
            missing = nil
        } else {
            targets = try keyed.decodeIfPresent(CalculatedTargets.self, forKey: .targets)
            missing = try keyed.decodeIfPresent(MissingTargetInputs.self, forKey: .missing)
        }
    }
}

/// `GET/POST /food-tracker/water`.
public struct WaterDay: Codable, Sendable, Equatable {
    public var glasses: Int
    public var goal: Int
    public var glassSize: Int
    /// Цель задал куратор; без неё карточки «Вода» нет.
    public var enabled: Bool

    public init(glasses: Int, goal: Int, glassSize: Int = 250, enabled: Bool) {
        self.glasses = glasses
        self.goal = goal
        self.glassSize = glassSize
        self.enabled = enabled
    }

    enum CodingKeys: String, CodingKey {
        case glasses, goal, enabled
        case glassSize = "glass_size"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        glasses = try container.decodeIfPresent(Int.self, forKey: .glasses) ?? 0
        goal = try container.decodeIfPresent(Int.self, forKey: .goal) ?? 8
        glassSize = try container.decodeIfPresent(Int.self, forKey: .glassSize) ?? 250
        enabled = try container.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
    }
}

/// Задача куратора (`GET /dashboard/tasks`).
public struct CuratorTask: Decodable, Sendable, Equatable, Identifiable {
    public enum Kind: String, Decodable, Sendable {
        case nutrition, workout, habit, measurement
    }

    public var id: String
    public var title: String
    public var description: String?
    public var type: String
    public var dueDate: String
    public var status: String
    public var recurrence: String
    public var completions: [String]

    public init(id: String, title: String, description: String? = nil, type: String, dueDate: String,
                status: String = "active", recurrence: String = "once", completions: [String] = []) {
        self.id = id
        self.title = title
        self.description = description
        self.type = type
        self.dueDate = dueDate
        self.status = status
        self.recurrence = recurrence
        self.completions = completions
    }

    public var kind: Kind? { Kind(rawValue: type) }
    public var due: String { DayKey.of(dueDate) }

    enum CodingKeys: String, CodingKey {
        case id, title, description, type, status, recurrence, completions
        case dueDate = "due_date"
    }

    private struct Completion: Decodable {
        let completedDate: String
        enum CodingKeys: String, CodingKey { case completedDate = "completed_date" }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        type = try container.decodeIfPresent(String.self, forKey: .type) ?? "habit"
        dueDate = try container.decodeIfPresent(String.self, forKey: .dueDate) ?? ""
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "active"
        recurrence = try container.decodeIfPresent(String.self, forKey: .recurrence) ?? "once"
        completions = (try container.decodeIfPresent([Completion].self, forKey: .completions) ?? []).map(\.completedDate)
    }
}

public struct TasksAnswer: Decodable, Sendable, Equatable {
    public var tasks: [CuratorTask]

    public init(tasks: [CuratorTask]) { self.tasks = tasks }
}

/// `GET /dashboard/onboarding`: первая неделя, куратор и доступ к нему.
public struct FirstWeekState: Decodable, Sendable, Equatable {
    public struct Step: Decodable, Sendable, Equatable {
        public var key: String
        public var done: Bool

        public init(key: String, done: Bool) {
            self.key = key
            self.done = done
        }
    }

    public struct Curator: Decodable, Sendable, Equatable {
        public struct LastMessage: Decodable, Sendable, Equatable {
            public var text: String
            public var fromCurator: Bool

            public init(text: String, fromCurator: Bool) {
                self.text = text
                self.fromCurator = fromCurator
            }

            enum CodingKeys: String, CodingKey {
                case text
                case fromCurator = "from_curator"
            }
        }

        public var conversationID: String
        public var name: String
        public var avatarURL: String?
        public var unreadCount: Int
        public var lastMessage: LastMessage?

        public init(conversationID: String, name: String, avatarURL: String? = nil, unreadCount: Int = 0,
                    lastMessage: LastMessage? = nil) {
            self.conversationID = conversationID
            self.name = name
            self.avatarURL = avatarURL
            self.unreadCount = unreadCount
            self.lastMessage = lastMessage
        }

        enum CodingKeys: String, CodingKey {
            case name
            case conversationID = "conversation_id"
            case avatarURL = "avatar_url"
            case unreadCount = "unread_count"
            case lastMessage = "last_message"
        }
    }

    public struct Access: Decodable, Sendable, Equatable {
        public var allowed: Bool
        public var expired: Bool

        public init(allowed: Bool, expired: Bool = false) {
            self.allowed = allowed
            self.expired = expired
        }
    }

    public var active: Bool
    public var steps: [Step]
    public var curator: Curator?
    public var curatorAccess: Access

    public init(active: Bool, steps: [Step] = [], curator: Curator? = nil, curatorAccess: Access = Access(allowed: false)) {
        self.active = active
        self.steps = steps
        self.curator = curator
        self.curatorAccess = curatorAccess
    }

    enum CodingKeys: String, CodingKey {
        case active, steps, curator
        case curatorAccess = "curator_access"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        active = try container.decodeIfPresent(Bool.self, forKey: .active) ?? false
        steps = try container.decodeIfPresent([Step].self, forKey: .steps) ?? []
        curator = try container.decodeIfPresent(Curator.self, forKey: .curator)
        curatorAccess = try container.decodeIfPresent(Access.self, forKey: .curatorAccess) ?? Access(allowed: false)
    }
}

/// `GET /dashboard/progress?weeks=4`.
public struct ProgressData: Decodable, Sendable, Equatable {
    public struct Point: Decodable, Sendable, Equatable {
        public var date: String
        public var weight: Double

        public init(date: String, weight: Double) {
            self.date = date
            self.weight = weight
        }
    }

    public var weightTrend: [Point]
    public var nutritionAdherence: Double
    public var targetWeight: Double?

    public init(weightTrend: [Point], nutritionAdherence: Double, targetWeight: Double? = nil) {
        self.weightTrend = weightTrend
        self.nutritionAdherence = nutritionAdherence
        self.targetWeight = targetWeight
    }

    enum CodingKeys: String, CodingKey {
        case weightTrend = "weight_trend"
        case nutritionAdherence = "nutrition_adherence"
        case targetWeight = "target_weight"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        weightTrend = try container.decodeIfPresent([Point].self, forKey: .weightTrend) ?? []
        nutritionAdherence = try container.decodeIfPresent(Double.self, forKey: .nutritionAdherence) ?? 0
        targetWeight = try container.decodeIfPresent(Double.self, forKey: .targetWeight)
    }
}

/// `GET /nutrition-calc/history?days=7` → `{days: [...]}`.
public struct CalorieHistory: Decodable, Sendable, Equatable {
    public struct Day: Decodable, Sendable, Equatable {
        public struct Amount: Decodable, Sendable, Equatable {
            public var calories: Double

            public init(calories: Double) { self.calories = calories }
        }

        public var date: String
        public var target: Amount?
        public var actual: Amount?

        public init(date: String, target: Double?, actual: Double) {
            self.date = date
            self.target = target.map(Amount.init(calories:))
            self.actual = Amount(calories: actual)
        }
    }

    public var days: [Day]

    public init(days: [Day]) { self.days = days }
}

/// `GET /notifications/unread-counts`.
public struct UnreadCounts: Decodable, Sendable, Equatable {
    public var main: Int
    public var content: Int

    public init(main: Int, content: Int) {
        self.main = main
        self.content = content
    }

    /// Число на колокольчике.
    public var total: Int { main + content }
}
