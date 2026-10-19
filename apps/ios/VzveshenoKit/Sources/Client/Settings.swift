import API
import Foundation
import Observation
import Session

/// Профиль и настройки (`GET /users/profile` → `{profile}`).
public struct UserProfile: Decodable, Sendable, Equatable {
    public struct Settings: Decodable, Sendable, Equatable {
        public var language: String
        public var units: String
        public var timezone: String
        public var targetWeight: Double?
        public var height: Double?
        public var birthDate: String?
        public var biologicalSex: String?
        public var activityLevel: String?
        public var fitnessGoal: String?

        public init(language: String = "ru", units: String = "metric", timezone: String = "Europe/Moscow",
                    targetWeight: Double? = nil, height: Double? = nil, birthDate: String? = nil, biologicalSex: String? = nil,
                    activityLevel: String? = nil, fitnessGoal: String? = nil) {
            self.language = language
            self.units = units
            self.timezone = timezone
            self.targetWeight = targetWeight
            self.height = height
            self.birthDate = birthDate
            self.biologicalSex = biologicalSex
            self.activityLevel = activityLevel
            self.fitnessGoal = fitnessGoal
        }

        enum CodingKeys: String, CodingKey {
            case language, units, timezone, height
            case targetWeight = "target_weight"
            case birthDate = "birth_date"
            case biologicalSex = "biological_sex"
            case activityLevel = "activity_level"
            case fitnessGoal = "fitness_goal"
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            language = try container.decodeIfPresent(String.self, forKey: .language) ?? "ru"
            units = try container.decodeIfPresent(String.self, forKey: .units) ?? "metric"
            timezone = try container.decodeIfPresent(String.self, forKey: .timezone) ?? "Europe/Moscow"
            targetWeight = try container.decodeIfPresent(Double.self, forKey: .targetWeight)
            height = try container.decodeIfPresent(Double.self, forKey: .height)
            birthDate = try container.decodeIfPresent(String.self, forKey: .birthDate)
            biologicalSex = try container.decodeIfPresent(String.self, forKey: .biologicalSex)
            activityLevel = try container.decodeIfPresent(String.self, forKey: .activityLevel)
            fitnessGoal = try container.decodeIfPresent(String.self, forKey: .fitnessGoal)
        }
    }

    public var id: Int64
    public var email: String
    public var name: String?
    public var avatarURL: String?
    public var settings: Settings

    public init(id: Int64, email: String, name: String? = nil, avatarURL: String? = nil, settings: Settings = Settings()) {
        self.id = id
        self.email = email
        self.name = name
        self.avatarURL = avatarURL
        self.settings = settings
    }

    enum CodingKeys: String, CodingKey {
        case id, email, name, settings
        case avatarURL = "avatar_url"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(Int64.self, forKey: .id) ?? 0
        email = try container.decodeIfPresent(String.self, forKey: .email) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name)
        avatarURL = try container.decodeIfPresent(String.self, forKey: .avatarURL)
        settings = try container.decodeIfPresent(Settings.self, forKey: .settings) ?? Settings()
    }
}

/// «Тело и цели»: те же поля и границы, что в вебе.
public struct BodyGoalsDraft: Equatable, Sendable {
    public static let heightRange = 50.0...300.0
    public static let targetWeightRange = 20.0...500.0

    public var birthDate: String?
    public var sex: String?
    public var height: String
    public var targetWeight: String
    public var activity: String?
    public var goal: String?

    public init(settings: UserProfile.Settings) {
        birthDate = settings.birthDate
        sex = settings.biologicalSex
        height = settings.height.map(NumberText.oneDecimal) ?? ""
        targetWeight = settings.targetWeight.map(NumberText.oneDecimal) ?? ""
        activity = settings.activityLevel
        goal = settings.fitnessGoal
    }

    static func number(_ text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : Double(trimmed.replacingOccurrences(of: ",", with: "."))
    }

    /// Ошибки по полям; пустое поле — не ошибка (не заполнено).
    public var problems: [String: String] {
        var problems: [String: String] = [:]
        if !height.trimmingCharacters(in: .whitespaces).isEmpty {
            if let value = Self.number(height), Self.heightRange.contains(value) {} else { problems["height"] = "Рост — от 50 до 300 см" }
        }
        if !targetWeight.trimmingCharacters(in: .whitespaces).isEmpty {
            if let value = Self.number(targetWeight), Self.targetWeightRange.contains(value) {} else {
                problems["targetWeight"] = "Целевой вес — от 20 до 500 кг"
            }
        }
        return problems
    }

    public var isValid: Bool { problems.isEmpty }

    /// Тело `PUT /users/settings`: заполненные поля; очищенные — `null`.
    public var body: [String: SettingValue] {
        [
            "birth_date": birthDate.map(SettingValue.string) ?? .null,
            "biological_sex": sex.map(SettingValue.string) ?? .null,
            "height": Self.number(height).map(SettingValue.number) ?? .null,
            "target_weight": Self.number(targetWeight).map(SettingValue.number) ?? .null,
            "activity_level": activity.map(SettingValue.string) ?? .null,
            "fitness_goal": goal.map(SettingValue.string) ?? .null,
        ]
    }

    public static let sexes = [("male", "Мужской"), ("female", "Женский")]
    public static let activities = [("sedentary", "Сидячий образ жизни"), ("light", "Лёгкая активность"),
                                    ("moderate", "Умеренная активность"), ("active", "Высокая активность")]
    public static let goals = [("loss", "Снизить вес"), ("maintain", "Поддерживать вес"), ("gain", "Набрать вес")]
}

/// Значение частичного `PUT /users/settings`: явный `null` очищает поле.
public enum SettingValue: Encodable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case null

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

/// Запросы профиля и настроек — те же, что в вебе (`docs/ios/README.md`).
public struct ProfileService: Sendable {
    let api: APIClient

    public init(api: APIClient) {
        self.api = api
    }

    public func profile() async throws -> UserProfile {
        struct Answer: Decodable, Sendable { let profile: UserProfile }
        return try await api.send(.get("/api/v1/users/profile"), as: Answer.self).profile
    }

    public func saveName(_ name: String) async throws {
        _ = try await api.send(try .put("/api/v1/users/profile", body: ["name": name]), as: EmptyResponse.self)
    }

    public func saveSettings(_ body: [String: SettingValue]) async throws {
        _ = try await api.send(try .put("/api/v1/users/settings", body: body), as: EmptyResponse.self)
    }

    /// «Тело и цели»: `PUT /users/settings`, затем `POST /nutrition-calc/recalculate`.
    /// Возвращает текст итога: «Нормы пересчитаны» или почему не пересчитались.
    public func saveBodyGoals(_ draft: BodyGoalsDraft) async throws -> String {
        try await saveSettings(draft.body)
        struct Recalculated: Decodable, Sendable {
            let calories: Double?
            let message: String?
        }
        let result = try await api.send(Endpoint(method: .post, path: "/api/v1/nutrition-calc/recalculate"), as: Recalculated.self)
        if result.calories != nil { return "Нормы пересчитаны" }
        return result.message ?? "Сохранено. Норма появится, когда будет известен вес."
    }

    public func uploadAvatar(jpeg: Data) async throws -> String? {
        struct Answer: Decodable, Sendable {
            let avatarURL: String?
            enum CodingKeys: String, CodingKey { case avatarURL = "avatar_url" }
        }
        let form = MultipartForm(fields: [:], file: (name: "avatar", filename: "avatar.jpg", mime: "image/jpeg", data: jpeg))
        let endpoint = Endpoint(method: .post, path: "/api/v1/users/avatar", body: form.body, contentType: form.contentType)
        return try await api.send(endpoint, as: Answer.self).avatarURL
    }

    public func deleteAvatar() async throws {
        _ = try await api.send(.delete("/api/v1/users/avatar"), as: EmptyResponse.self)
    }
}

// MARK: Уведомления

/// Разрешение iOS на уведомления.
public enum NotificationPermission: Equatable, Sendable {
    case notDetermined
    case denied
    case authorized
    /// «Тихая доставка» (provisional) и временное — пуши доходят.
    case provisional
}

/// Колонка «Пуш» матрицы доставки при данном разрешении системы.
public enum PushColumn: Equatable, Sendable {
    case enabled
    /// Разрешение не спрашивали: «Разрешить» показывает системный запрос.
    case askPermission
    /// Запрещено ранее: «Открыть настройки» ведёт в настройки приложения.
    case openSettings

    public init(_ permission: NotificationPermission) {
        switch permission {
        case .authorized, .provisional: self = .enabled
        case .notDetermined: self = .askPermission
        case .denied: self = .openSettings
        }
    }

    public var isEnabled: Bool { self == .enabled }

    public var buttonTitle: String? {
        switch self {
        case .enabled: return nil
        case .askPermission: return "Разрешить"
        case .openSettings: return "Открыть настройки"
        }
    }
}

/// `GET/PUT /notifications/delivery-preferences`.
public struct DeliveryPreferences: Codable, Sendable, Equatable {
    public struct TypeChannels: Codable, Sendable, Equatable {
        public var type: String
        public var push: Bool
        /// Нет — для типа почта не предлагается (сообщения чата).
        public var email: Bool?

        public init(type: String, push: Bool, email: Bool? = nil) {
            self.type = type
            self.push = push
            self.email = email
        }
    }

    public var types: [TypeChannels]
    public var quietHoursStart: Int?
    public var quietHoursEnd: Int?
    public var emailUnsubscribed: Bool
    public var showMessageText: Bool

    public init(types: [TypeChannels], quietHoursStart: Int? = nil, quietHoursEnd: Int? = nil, emailUnsubscribed: Bool = false,
                showMessageText: Bool = true) {
        self.types = types
        self.quietHoursStart = quietHoursStart
        self.quietHoursEnd = quietHoursEnd
        self.emailUnsubscribed = emailUnsubscribed
        self.showMessageText = showMessageText
    }

    enum CodingKeys: String, CodingKey {
        case types, quietHoursStart, quietHoursEnd, emailUnsubscribed, showMessageText
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        types = try container.decodeIfPresent([TypeChannels].self, forKey: .types) ?? []
        quietHoursStart = try container.decodeIfPresent(Int.self, forKey: .quietHoursStart)
        quietHoursEnd = try container.decodeIfPresent(Int.self, forKey: .quietHoursEnd)
        emailUnsubscribed = try container.decodeIfPresent(Bool.self, forKey: .emailUnsubscribed) ?? false
        showMessageText = try container.decodeIfPresent(Bool.self, forKey: .showMessageText) ?? true
    }

    /// PUT заменяет матрицу и тихое время целиком — отправляется всё.
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(types, forKey: .types)
        try container.encode(quietHoursStart, forKey: .quietHoursStart)
        try container.encode(quietHoursEnd, forKey: .quietHoursEnd)
        try container.encode(emailUnsubscribed, forKey: .emailUnsubscribed)
        try container.encode(showMessageText, forKey: .showMessageText)
    }

    /// Подпись типа по-русски.
    public static func title(_ type: String) -> String {
        switch type {
        case "chat_message": return "Сообщения куратора"
        case "trainer_feedback", "feedback_received": return type == "feedback_received" ? "Отзыв на недельный отчёт" : "Отзыв куратора"
        case "task_assigned": return "Новая задача"
        case "task_overdue": return "Задача просрочена"
        case "plan_updated": return "План обновлён"
        case "reminder": return "Напоминания"
        case "export_ready": return "Выгрузка данных готова"
        case "achievement": return "Достижения"
        case "new_content": return "Новые статьи"
        case "system_update": return "Обновления сервиса"
        case "new_feature": return "Новые возможности"
        case "general": return "Общие"
        case "curator_access_ending": return "Доступ к куратору заканчивается"
        case "curator_access_ended": return "Доступ к куратору закончился"
        default: return type
        }
    }

    /// Типы, которые клиенту есть смысл настраивать (кураторские — нет).
    public var clientTypes: [TypeChannels] {
        let hidden: Set<String> = ["client_left", "support_escalated", "curator_requested"]
        return types.filter { !hidden.contains($0.type) }
    }
}

// MARK: Часовой пояс

/// Предложение «Сменить часовой пояс на {пояс}?» (`ios-client-settings`):
/// пояс устройства отличается от профиля больше суток подряд; один раз на пояс.
public struct TimeZoneSuggestion: Codable, Equatable, Sendable {
    /// С какого момента устройство в этом поясе, а профиль — в другом.
    public var mismatchZone: String?
    public var mismatchSince: Date?
    /// Пояса, о которых уже спросили (ответ «Сменить» или «Оставить»).
    public var answered: Set<String>

    public init(mismatchZone: String? = nil, mismatchSince: Date? = nil, answered: Set<String> = []) {
        self.mismatchZone = mismatchZone
        self.mismatchSince = mismatchSince
        self.answered = answered
    }

    /// Новое состояние и пояс, который пора предложить.
    public func evaluate(profile: String, device: String, now: Date) -> (state: TimeZoneSuggestion, suggest: String?) {
        var state = self
        guard profile != device else {
            state.mismatchZone = nil
            state.mismatchSince = nil
            return (state, nil)
        }
        if state.mismatchZone != device {
            state.mismatchZone = device
            state.mismatchSince = now
        }
        guard !state.answered.contains(device), let since = state.mismatchSince, now.timeIntervalSince(since) > 86_400 else {
            return (state, nil)
        }
        return (state, device)
    }

    /// Человек ответил — больше об этом поясе не спрашивать.
    public func answering(_ zone: String) -> TimeZoneSuggestion {
        var state = self
        state.answered.insert(zone)
        return state
    }

    /// «Екатеринбург (UTC+5)» — подпись пояса.
    public static func title(_ identifier: String, at date: Date = Date()) -> String {
        let city = identifier.split(separator: "/").last.map { $0.replacingOccurrences(of: "_", with: " ") } ?? identifier
        let names = ["Moscow": "Москва", "Yekaterinburg": "Екатеринбург", "Novosibirsk": "Новосибирск", "Kaliningrad": "Калининград",
                     "Samara": "Самара", "Omsk": "Омск", "Krasnoyarsk": "Красноярск", "Irkutsk": "Иркутск", "Yakutsk": "Якутск",
                     "Vladivostok": "Владивосток", "Magadan": "Магадан", "Kamchatka": "Камчатка", "Volgograd": "Волгоград"]
        guard let zone = TimeZone(identifier: identifier) else { return names[city] ?? city }
        let seconds = zone.secondsFromGMT(for: date)
        let hours = seconds / 3600
        let minutes = abs(seconds % 3600) / 60
        let offset = minutes == 0 ? String(format: "%+d", hours) : String(format: "%+d:%02d", hours, minutes)
        return "\(names[city] ?? city) (UTC\(offset))"
    }
}

/// Хранилище состояния предложения — в каталоге аккаунта.
public protocol TimeZoneSuggestionStore: Sendable {
    func load() -> TimeZoneSuggestion
    func save(_ state: TimeZoneSuggestion)
}

public final class InMemoryTimeZoneSuggestionStore: TimeZoneSuggestionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var state = TimeZoneSuggestion()

    public init() {}

    public func load() -> TimeZoneSuggestion { lock.withLock { state } }
    public func save(_ state: TimeZoneSuggestion) { lock.withLock { self.state = state } }
}

// MARK: Оформление

/// «Оформление»: хранится на устройстве, применяется сразу.
public enum Appearance: String, CaseIterable, Sendable, Identifiable {
    case auto, light, dark

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .auto: return "Авто"
        case .light: return "Светлая"
        case .dark: return "Тёмная"
        }
    }
}
