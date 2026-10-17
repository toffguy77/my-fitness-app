import API
import Foundation

/// Шаг онбординга клиента (`ios-onboarding`).
public enum OnboardingStep: Int, CaseIterable, Sendable {
    /// Язык, единицы, часовой пояс — с устройства.
    case settings
    /// Дата рождения, пол, текущий вес, рост, активность, цель — всё необязательно.
    case body
    /// «Подключить Здоровье»: «Подключить» или «Позже».
    case health

    public var title: String {
        switch self {
        case .settings: return "Настройки"
        case .body: return "Тело и цели"
        case .health: return "Подключить Здоровье"
        }
    }
}

public enum BiologicalSex: String, CaseIterable, Sendable {
    case male, female

    public var title: String { self == .male ? "Мужской" : "Женский" }
}

public enum ActivityLevel: String, CaseIterable, Sendable {
    case sedentary, light, moderate, active

    public var title: String {
        switch self {
        case .sedentary: return "Сидячий образ жизни"
        case .light: return "Лёгкая активность"
        case .moderate: return "Умеренная активность"
        case .active: return "Высокая активность"
        }
    }
}

public enum FitnessGoal: String, CaseIterable, Sendable {
    case loss, maintain, gain

    public var title: String {
        switch self {
        case .loss: return "Снизить вес"
        case .maintain: return "Держать вес"
        case .gain: return "Набрать вес"
        }
    }
}

/// Ответы онбординга. Пустое поле не отправляется.
public struct OnboardingDraft: Sendable, Equatable {
    public var language: String
    public var units: String
    public var timezone: String
    /// Шаг «Настройки» пропущен — ничего не отправляется.
    public var settingsSkipped = false

    public var birthDate: String?
    public var sex: BiologicalSex?
    /// Текущий вес — это замер за сегодня, а не цель (в вебе — ошибка).
    public var currentWeight: Double?
    public var height: Double?
    public var activity: ActivityLevel?
    public var goal: FitnessGoal?

    /// Предзаполнение с устройства: язык (`ru`, иначе `en`), метрическая
    /// система, часовой пояс устройства.
    public init(locale: Locale = .current, timeZone: TimeZone = .current) {
        let code = locale.language.languageCode?.identifier ?? "ru"
        language = code == "en" ? "en" : "ru"
        units = "metric"
        timezone = timeZone.identifier
    }

    public mutating func skipBody() {
        birthDate = nil
        sex = nil
        currentWeight = nil
        height = nil
        activity = nil
        goal = nil
    }

    /// Запросы завершения по порядку: настройки (если не пропущены), тело
    /// и цели, вес за сегодня, `PUT /users/onboarding/complete`.
    public func requests(today: String) throws -> [Endpoint] {
        var result: [Endpoint] = []
        var settings: [String: SettingValue] = [:]
        if !settingsSkipped {
            settings["language"] = .string(language)
            settings["units"] = .string(units)
            settings["timezone"] = .string(timezone)
        }
        if let birthDate { settings["birth_date"] = .string(birthDate) }
        if let sex { settings["biological_sex"] = .string(sex.rawValue) }
        if let height { settings["height"] = .number(height) }
        if let activity { settings["activity_level"] = .string(activity.rawValue) }
        if let goal { settings["fitness_goal"] = .string(goal.rawValue) }
        // target_weight здесь не бывает: текущий вес — замер ниже.
        if !settings.isEmpty {
            result.append(try .put("/api/v1/users/settings", body: settings))
        }
        if let currentWeight {
            let body = WeightMeasurement(date: today, metric: .init(type: "weight", data: ["weight": currentWeight]))
            result.append(try .post("/api/v1/dashboard/daily", body: body))
        }
        result.append(Endpoint(method: .put, path: "/api/v1/users/onboarding/complete"))
        return result
    }

    enum SettingValue: Encodable, Sendable {
        case string(String)
        case number(Double)

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self {
            case let .string(value): try container.encode(value)
            case let .number(value): try container.encode(value)
            }
        }
    }

    struct WeightMeasurement: Encodable, Sendable {
        struct Metric: Encodable, Sendable {
            let type: String
            let data: [String: Double]
        }
        let date: String
        let metric: Metric
    }
}

/// Онбординг: отправка ответов и завершение.
public struct OnboardingService: Sendable {
    let api: APIClient

    public init(api: APIClient) { self.api = api }

    /// Отправляет ответы по порядку. Ошибка — останавливает: онбординг не
    /// помечается пройденным, пока не сохранено то, что человек ввёл.
    public func complete(_ draft: OnboardingDraft, today: String) async throws {
        for endpoint in try draft.requests(today: today) {
            let raw = try await api.sendRaw(endpoint)
            guard (200..<300).contains(raw.status) else { throw raw.apiError }
        }
    }
}

/// Поля «Тела и целей» — границы как в профиле веба.
public enum BodyInput {
    public static let height = 50.0...300.0

    public static func height(_ text: String) -> Double? {
        guard let value = Double(text.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)),
              height.contains(value) else { return nil }
        return value
    }
}
