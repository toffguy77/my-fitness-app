import Client
import Foundation

// Ответы `/api/v1/curator/*` и `/api/v1/conversations` в том виде, в каком их
// отдаёт сервер (`apps/api/internal/modules/curator`, `chat`, `leads`,
// `support`). Необязательные поля разбираются мягко: экран куратора не должен
// падать от того, что у клиента чего-то нет.

/// `GET /curator/analytics`.
public struct CuratorAnalytics: Decodable, Sendable, Equatable {
    public var totalClients: Int
    public var attentionClients: Int
    public var avgKBZHUPercent: Double
    public var totalUnread: Int
    public var clientsWaiting: Int
    public var activeTasks: Int
    public var overdueTasks: Int
    public var completedToday: Int

    public init(totalClients: Int, attentionClients: Int, avgKBZHUPercent: Double, totalUnread: Int, clientsWaiting: Int,
                activeTasks: Int, overdueTasks: Int, completedToday: Int) {
        self.totalClients = totalClients
        self.attentionClients = attentionClients
        self.avgKBZHUPercent = avgKBZHUPercent
        self.totalUnread = totalUnread
        self.clientsWaiting = clientsWaiting
        self.activeTasks = activeTasks
        self.overdueTasks = overdueTasks
        self.completedToday = completedToday
    }

    enum CodingKeys: String, CodingKey {
        case totalClients = "total_clients"
        case attentionClients = "attention_clients"
        case avgKBZHUPercent = "avg_kbzhu_percent"
        case totalUnread = "total_unread"
        case clientsWaiting = "clients_waiting"
        case activeTasks = "active_tasks"
        case overdueTasks = "overdue_tasks"
        case completedToday = "completed_today"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        func int(_ key: CodingKeys) throws -> Int { try container.decodeIfPresent(Int.self, forKey: key) ?? 0 }
        totalClients = try int(.totalClients)
        attentionClients = try int(.attentionClients)
        avgKBZHUPercent = try container.decodeIfPresent(Double.self, forKey: .avgKBZHUPercent) ?? 0
        totalUnread = try int(.totalUnread)
        clientsWaiting = try int(.clientsWaiting)
        activeTasks = try int(.activeTasks)
        overdueTasks = try int(.overdueTasks)
        completedToday = try int(.completedToday)
    }
}

/// `GET /curator/analytics/benchmark?weeks=4` — свои недели (упрощённая динамика).
public struct CuratorBenchmark: Decodable, Sendable, Equatable {
    public struct Week: Decodable, Sendable, Equatable {
        public var weekStart: String
        public var avgKBZHUPercent: Double

        public init(weekStart: String, avgKBZHUPercent: Double) {
            self.weekStart = weekStart
            self.avgKBZHUPercent = avgKBZHUPercent
        }

        enum CodingKeys: String, CodingKey {
            case weekStart = "week_start"
            case avgKBZHUPercent = "avg_kbzhu_percent"
        }
    }

    public var own: [Week]

    public init(own: [Week]) { self.own = own }

    enum CodingKeys: String, CodingKey { case own = "own_snapshots" }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        own = try container.decodeIfPresent([Week].self, forKey: .own) ?? []
    }
}

/// Причина «Требуют внимания» (`collectAttention`): приоритет — у сервера.
public enum AttentionReason: String, Sendable, Equatable {
    case redAlert = "red_alert"
    case overdueTask = "overdue_task"
    case inactive
    case unreadMessage = "unread_message"
    case awaitingFeedback = "awaiting_feedback"
    case incompleteProfile = "incomplete_profile"

    /// Подпись бейджа — как в вебе (`AttentionList.tsx`).
    public var title: String {
        switch self {
        case .redAlert: return "Алерт КБЖУ"
        case .overdueTask: return "Просроченная задача"
        case .inactive: return "Нет активности"
        case .unreadMessage: return "Сообщение"
        case .awaitingFeedback: return "Ожидает отзыв"
        case .incompleteProfile: return "Неполный профиль"
        }
    }
}

/// Пункт `GET /curator/attention`.
public struct AttentionItem: Decodable, Sendable, Equatable {
    public var clientID: Int64
    public var clientName: String
    /// Сырой код причины: незнакомую причину сервер может добавить раньше приложения.
    public var reasonCode: String
    public var detail: String
    public var priority: Int
    /// Путь веба, куда ведёт пункт: `/curator/clients/:id` или `/curator/chat/:id`.
    public var actionURL: String

    public init(clientID: Int64, clientName: String, reason: String, detail: String, priority: Int, actionURL: String) {
        self.clientID = clientID
        self.clientName = clientName
        reasonCode = reason
        self.detail = detail
        self.priority = priority
        self.actionURL = actionURL
    }

    public var reason: AttentionReason? { AttentionReason(rawValue: reasonCode) }

    enum CodingKeys: String, CodingKey {
        case detail, priority
        case clientID = "client_id"
        case clientName = "client_name"
        case reasonCode = "reason"
        case actionURL = "action_url"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        clientID = try container.decode(Int64.self, forKey: .clientID)
        clientName = try container.decodeIfPresent(String.self, forKey: .clientName) ?? ""
        reasonCode = try container.decodeIfPresent(String.self, forKey: .reasonCode) ?? ""
        detail = try container.decodeIfPresent(String.self, forKey: .detail) ?? ""
        priority = try container.decodeIfPresent(Int.self, forKey: .priority) ?? Int.max
        actionURL = try container.decodeIfPresent(String.self, forKey: .actionURL) ?? "/curator/clients/\(clientID)"
    }
}

/// КБЖУ: факт дня или план.
public struct Macros: Codable, Sendable, Equatable {
    public var calories: Double
    public var protein: Double
    public var fat: Double
    public var carbs: Double

    public init(calories: Double, protein: Double, fat: Double, carbs: Double) {
        self.calories = calories
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
    }

    public static let zero = Macros(calories: 0, protein: 0, fat: 0, carbs: 0)

    enum CodingKeys: String, CodingKey { case calories, protein, fat, carbs }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        calories = try container.decodeIfPresent(Double.self, forKey: .calories) ?? 0
        protein = try container.decodeIfPresent(Double.self, forKey: .protein) ?? 0
        fat = try container.decodeIfPresent(Double.self, forKey: .fat) ?? 0
        carbs = try container.decodeIfPresent(Double.self, forKey: .carbs) ?? 0
    }
}

/// Алерт клиента: `red`, `yellow`, `green`.
public struct ClientAlert: Decodable, Sendable, Equatable, Hashable {
    public var level: String
    public var message: String

    public init(level: String, message: String) {
        self.level = level
        self.message = message
    }
}

/// Вода дня.
public struct WaterView: Decodable, Sendable, Equatable {
    public var glasses: Int
    public var goal: Int
    public var glassSize: Int

    public init(glasses: Int, goal: Int, glassSize: Int = 250) {
        self.glasses = glasses
        self.goal = goal
        self.glassSize = glassSize
    }

    enum CodingKeys: String, CodingKey {
        case glasses, goal
        case glassSize = "glass_size"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        glasses = try container.decodeIfPresent(Int.self, forKey: .glasses) ?? 0
        goal = try container.decodeIfPresent(Int.self, forKey: .goal) ?? 0
        glassSize = try container.decodeIfPresent(Int.self, forKey: .glassSize) ?? 250
    }
}

/// Клиент из `GET /curator/clients` (и шапка `GET /curator/clients/:id`).
public struct CuratorClient: Decodable, Sendable, Equatable, Identifiable {
    public var id: Int64
    public var name: String
    public var todayKBZHU: Macros?
    public var plan: Macros?
    public var alerts: [ClientAlert]
    public var unreadCount: Int
    public var lastWeight: Double?
    public var lastWeightSource: String?
    public var targetWeight: Double?
    public var timezone: String?
    public var birthDate: String?
    public var biologicalSex: String?
    public var fitnessGoal: String?
    public var weeklyKBZHUPercent: Double?
    public var lastActivityDate: String?
    public var streakDays: Int

    public init(id: Int64, name: String, todayKBZHU: Macros? = nil, plan: Macros? = nil, alerts: [ClientAlert] = [],
                unreadCount: Int = 0, lastWeight: Double? = nil, lastWeightSource: String? = nil, targetWeight: Double? = nil,
                timezone: String? = nil, birthDate: String? = nil, biologicalSex: String? = nil, fitnessGoal: String? = nil,
                weeklyKBZHUPercent: Double? = nil, lastActivityDate: String? = nil, streakDays: Int = 0) {
        self.id = id
        self.name = name
        self.todayKBZHU = todayKBZHU
        self.plan = plan
        self.alerts = alerts
        self.unreadCount = unreadCount
        self.lastWeight = lastWeight
        self.lastWeightSource = lastWeightSource
        self.targetWeight = targetWeight
        self.timezone = timezone
        self.birthDate = birthDate
        self.biologicalSex = biologicalSex
        self.fitnessGoal = fitnessGoal
        self.weeklyKBZHUPercent = weeklyKBZHUPercent
        self.lastActivityDate = lastActivityDate
        self.streakDays = streakDays
    }

    enum CodingKeys: String, CodingKey {
        case id, name, plan, alerts, timezone
        case todayKBZHU = "today_kbzhu"
        case unreadCount = "unread_count"
        case lastWeight = "last_weight"
        case lastWeightSource = "last_weight_source"
        case targetWeight = "target_weight"
        case birthDate = "birth_date"
        case biologicalSex = "biological_sex"
        case fitnessGoal = "fitness_goal"
        case weeklyKBZHUPercent = "weekly_kbzhu_percent"
        case lastActivityDate = "last_activity_date"
        case streakDays = "streak_days"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int64.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
        todayKBZHU = try container.decodeIfPresent(Macros.self, forKey: .todayKBZHU)
        plan = try container.decodeIfPresent(Macros.self, forKey: .plan)
        alerts = try container.decodeIfPresent([ClientAlert].self, forKey: .alerts) ?? []
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
        lastWeight = try container.decodeIfPresent(Double.self, forKey: .lastWeight)
        lastWeightSource = try container.decodeIfPresent(String.self, forKey: .lastWeightSource)
        targetWeight = try container.decodeIfPresent(Double.self, forKey: .targetWeight)
        timezone = try container.decodeIfPresent(String.self, forKey: .timezone)
        birthDate = try container.decodeIfPresent(String.self, forKey: .birthDate)
        biologicalSex = try container.decodeIfPresent(String.self, forKey: .biologicalSex)
        fitnessGoal = try container.decodeIfPresent(String.self, forKey: .fitnessGoal)
        weeklyKBZHUPercent = try container.decodeIfPresent(Double.self, forKey: .weeklyKBZHUPercent)
        lastActivityDate = try container.decodeIfPresent(String.self, forKey: .lastActivityDate)
        streakDays = try container.decodeIfPresent(Int.self, forKey: .streakDays) ?? 0
    }

    public var displayName: String { name.isEmpty ? "Без имени" : name }

    /// Процент КБЖУ в строке «Остальные»: за неделю, иначе за сегодня.
    public var kbzhuPercent: Int? {
        if let weekly = weeklyKBZHUPercent { return NumberText.jsRound(weekly) }
        guard let plan, plan.calories > 0, let today = todayKBZHU else { return nil }
        return NumberText.jsRound(today.calories / plan.calories * 100)
    }
}

/// Запись дневника дня клиента.
public struct ClientFoodEntry: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    public var foodName: String
    public var mealType: String
    public var calories: Double
    public var protein: Double
    public var fat: Double
    public var carbs: Double
    public var weight: Double
    /// Кто добавил запись за клиента; `nil` — сам клиент.
    public var createdBy: Int64?
    public var time: String

    public init(id: String, foodName: String, mealType: String, calories: Double, protein: Double = 0, fat: Double = 0,
                carbs: Double = 0, weight: Double = 0, createdBy: Int64? = nil, time: String = "") {
        self.id = id
        self.foodName = foodName
        self.mealType = mealType
        self.calories = calories
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
        self.weight = weight
        self.createdBy = createdBy
        self.time = time
    }

    enum CodingKeys: String, CodingKey {
        case id, calories, protein, fat, carbs, weight, time
        case foodName = "food_name"
        case mealType = "meal_type"
        case createdBy = "created_by"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        foodName = try container.decodeIfPresent(String.self, forKey: .foodName) ?? ""
        mealType = try container.decodeIfPresent(String.self, forKey: .mealType) ?? "snack"
        calories = try container.decodeIfPresent(Double.self, forKey: .calories) ?? 0
        protein = try container.decodeIfPresent(Double.self, forKey: .protein) ?? 0
        fat = try container.decodeIfPresent(Double.self, forKey: .fat) ?? 0
        carbs = try container.decodeIfPresent(Double.self, forKey: .carbs) ?? 0
        weight = try container.decodeIfPresent(Double.self, forKey: .weight) ?? 0
        createdBy = try container.decodeIfPresent(Int64.self, forKey: .createdBy)
        time = try container.decodeIfPresent(String.self, forKey: .time) ?? ""
    }

    /// «Добавлено куратором» — запись по фото из переписки.
    public var addedByCurator: Bool { createdBy != nil }
}

/// День клиента в карточке.
public struct ClientDay: Decodable, Sendable, Equatable, Identifiable {
    public struct Workout: Decodable, Sendable, Equatable {
        public var completed: Bool
        public var type: String
        public var duration: Int

        public init(completed: Bool, type: String, duration: Int) {
            self.completed = completed
            self.type = type
            self.duration = duration
        }

        enum CodingKeys: String, CodingKey { case completed, type, duration }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            completed = try container.decodeIfPresent(Bool.self, forKey: .completed) ?? false
            type = try container.decodeIfPresent(String.self, forKey: .type) ?? ""
            duration = try container.decodeIfPresent(Int.self, forKey: .duration) ?? 0
        }
    }

    public var date: String
    public var kbzhu: Macros
    public var plan: Macros?
    public var alerts: [ClientAlert]
    public var foodEntries: [ClientFoodEntry]
    public var water: WaterView?
    public var steps: Int
    public var workout: Workout?
    public var weight: Double?
    public var stepsSource: String?
    public var weightSource: String?
    public var workoutSource: String?

    public var id: String { date }

    public init(date: String, kbzhu: Macros, plan: Macros? = nil, alerts: [ClientAlert] = [], foodEntries: [ClientFoodEntry] = [],
                water: WaterView? = nil, steps: Int = 0, workout: Workout? = nil, weight: Double? = nil,
                stepsSource: String? = nil, weightSource: String? = nil, workoutSource: String? = nil) {
        self.date = date
        self.kbzhu = kbzhu
        self.plan = plan
        self.alerts = alerts
        self.foodEntries = foodEntries
        self.water = water
        self.steps = steps
        self.workout = workout
        self.weight = weight
        self.stepsSource = stepsSource
        self.weightSource = weightSource
        self.workoutSource = workoutSource
    }

    enum CodingKeys: String, CodingKey {
        case date, kbzhu, plan, alerts, water, steps, workout, weight
        case foodEntries = "food_entries"
        case stepsSource = "steps_source"
        case weightSource = "weight_source"
        case workoutSource = "workout_source"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        date = DayKey.of(try container.decode(String.self, forKey: .date))
        kbzhu = try container.decodeIfPresent(Macros.self, forKey: .kbzhu) ?? .zero
        plan = try container.decodeIfPresent(Macros.self, forKey: .plan)
        alerts = try container.decodeIfPresent([ClientAlert].self, forKey: .alerts) ?? []
        foodEntries = try container.decodeIfPresent([ClientFoodEntry].self, forKey: .foodEntries) ?? []
        water = try container.decodeIfPresent(WaterView.self, forKey: .water)
        steps = try container.decodeIfPresent(Int.self, forKey: .steps) ?? 0
        workout = try container.decodeIfPresent(Workout.self, forKey: .workout)
        weight = try container.decodeIfPresent(Double.self, forKey: .weight)
        stepsSource = try container.decodeIfPresent(String.self, forKey: .stepsSource)
        weightSource = try container.decodeIfPresent(String.self, forKey: .weightSource)
        workoutSource = try container.decodeIfPresent(String.self, forKey: .workoutSource)
    }
}

/// Точка истории веса.
public struct WeightPoint: Decodable, Sendable, Equatable {
    public var date: String
    public var weight: Double
    public var source: String?

    public init(date: String, weight: Double, source: String? = nil) {
        self.date = date
        self.weight = weight
        self.source = source
    }
}

/// Фото недели.
public struct WeekPhoto: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    public var photoURL: String
    public var weekStart: String

    public init(id: String, photoURL: String, weekStart: String) {
        self.id = id
        self.photoURL = photoURL
        self.weekStart = weekStart
    }

    enum CodingKeys: String, CodingKey {
        case id
        case photoURL = "photo_url"
        case weekStart = "week_start"
    }

    /// Только с наших адресов (`TrustedMedia`).
    public var url: URL? { TrustedMedia.url(photoURL) }
}

/// `GET /curator/clients/:id?days=7`.
public struct ClientDetail: Decodable, Sendable, Equatable {
    public var client: CuratorClient
    public var days: [ClientDay]
    public var weeklyPlan: Macros?
    public var weightHistory: [WeightPoint]
    public var photos: [WeekPhoto]
    public var waterGoal: Int?

    public init(client: CuratorClient, days: [ClientDay] = [], weeklyPlan: Macros? = nil, weightHistory: [WeightPoint] = [],
                photos: [WeekPhoto] = [], waterGoal: Int? = nil) {
        self.client = client
        self.days = days
        self.weeklyPlan = weeklyPlan
        self.weightHistory = weightHistory
        self.photos = photos
        self.waterGoal = waterGoal
    }

    enum CodingKeys: String, CodingKey {
        case days, photos
        case weeklyPlan = "weekly_plan"
        case weightHistory = "weight_history"
        case waterGoal = "water_goal"
    }

    public init(from decoder: Decoder) throws {
        client = try CuratorClient(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        days = try container.decodeIfPresent([ClientDay].self, forKey: .days) ?? []
        weeklyPlan = try container.decodeIfPresent(Macros.self, forKey: .weeklyPlan)
        weightHistory = try container.decodeIfPresent([WeightPoint].self, forKey: .weightHistory) ?? []
        photos = try container.decodeIfPresent([WeekPhoto].self, forKey: .photos) ?? []
        waterGoal = try container.decodeIfPresent(Int.self, forKey: .waterGoal)
    }
}

/// Оповещение клиента (`GET /curator/clients/:id/notices`, ключи camelCase).
public struct ClientNotice: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var createdAt: String

    public init(id: String, title: String, createdAt: String) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey { case id, title, createdAt }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }
}
