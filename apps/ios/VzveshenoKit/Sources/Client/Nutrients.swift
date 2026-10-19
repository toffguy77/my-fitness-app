import API
import DesignSystem
import Foundation
import Observation

/// Единица нутриента: на проводе `g|mg|mcg|IU`, на экране — по-русски.
public enum NutrientUnit: String, Codable, Sendable, CaseIterable, Identifiable {
    case g, mg, mcg
    case iu = "IU"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .g: return "г"
        case .mg: return "мг"
        case .mcg: return "мкг"
        case .iu: return "МЕ"
        }
    }

    public static func title(_ raw: String) -> String { NutrientUnit(rawValue: raw)?.title ?? raw }
}

/// Рекомендация по нутриенту (строка списка и основа деталей).
public struct NutrientRecommendation: Decodable, Sendable, Hashable, Identifiable {
    public struct Source: Decodable, Sendable, Hashable {
        public var foodName: String
        public var amount: Double
        public var unit: String

        public init(foodName: String, amount: Double, unit: String) {
            self.foodName = foodName
            self.amount = amount
            self.unit = unit
        }

        enum CodingKeys: String, CodingKey {
            case amount, unit
            case foodName = "food_name"
        }
    }

    public var id: String
    public var name: String
    public var category: String
    public var unit: String
    public var isWeekly: Bool
    public var description: String?
    public var benefits: String?
    public var effects: String?
    /// `nil` — норма зависит от пола и возраста, которых нет в профиле.
    public var dailyTarget: Double?
    public var normSource: String?
    public var normNeedsProfile: Bool
    /// `nil` — потребление не считается.
    public var currentIntake: Double?
    public var percentage: Double?
    public var countedEntries: Int?
    public var totalEntries: Int?
    public var isTracked: Bool
    public var sources: [Source]

    public init(id: String, name: String, category: String, unit: String, isWeekly: Bool = false, description: String? = nil,
                benefits: String? = nil, effects: String? = nil, dailyTarget: Double?, normSource: String? = nil,
                normNeedsProfile: Bool = false, currentIntake: Double? = nil, percentage: Double? = nil,
                countedEntries: Int? = nil, totalEntries: Int? = nil, isTracked: Bool = true, sources: [Source] = []) {
        self.id = id
        self.name = name
        self.category = category
        self.unit = unit
        self.isWeekly = isWeekly
        self.description = description
        self.benefits = benefits
        self.effects = effects
        self.dailyTarget = dailyTarget
        self.normSource = normSource
        self.normNeedsProfile = normNeedsProfile
        self.currentIntake = currentIntake
        self.percentage = percentage
        self.countedEntries = countedEntries
        self.totalEntries = totalEntries
        self.isTracked = isTracked
        self.sources = sources
    }

    enum CodingKeys: String, CodingKey {
        case id, name, category, unit, description, benefits, effects, percentage, sources
        case isWeekly = "is_weekly"
        case dailyTarget = "daily_target"
        case normSource = "norm_source"
        case normNeedsProfile = "norm_needs_profile"
        case currentIntake = "current_intake"
        case countedEntries = "intake_counted_entries"
        case totalEntries = "intake_total_entries"
        case isTracked = "is_tracked"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        category = try container.decodeIfPresent(String.self, forKey: .category) ?? "custom"
        unit = try container.decodeIfPresent(String.self, forKey: .unit) ?? "mg"
        isWeekly = try container.decodeIfPresent(Bool.self, forKey: .isWeekly) ?? false
        description = try container.decodeIfPresent(String.self, forKey: .description)
        benefits = try container.decodeIfPresent(String.self, forKey: .benefits)
        effects = try container.decodeIfPresent(String.self, forKey: .effects)
        dailyTarget = try container.decodeIfPresent(Double.self, forKey: .dailyTarget)
        normSource = try container.decodeIfPresent(String.self, forKey: .normSource)
        normNeedsProfile = try container.decodeIfPresent(Bool.self, forKey: .normNeedsProfile) ?? false
        currentIntake = try container.decodeIfPresent(Double.self, forKey: .currentIntake)
        percentage = try container.decodeIfPresent(Double.self, forKey: .percentage)
        countedEntries = try container.decodeIfPresent(Int.self, forKey: .countedEntries)
        totalEntries = try container.decodeIfPresent(Int.self, forKey: .totalEntries)
        isTracked = try container.decodeIfPresent(Bool.self, forKey: .isTracked) ?? true
        sources = try container.decodeIfPresent([Source].self, forKey: .sources) ?? []
    }

    public var unitTitle: String { NutrientUnit.title(unit) }

    /// «Норма: 15 мкг в день», без нормы — почему её нет.
    public var normText: String {
        guard let dailyTarget else {
            return normNeedsProfile ? "Норма зависит от пола и возраста — укажите их в профиле." : "Норма не задана."
        }
        return "Норма: \(Self.number(dailyTarget)) \(unitTitle) в \(isWeekly ? "неделю" : "день")"
    }

    /// «12 из 15 мкг» или «не считается».
    public var progressText: String {
        guard let currentIntake else {
            return dailyTarget.map { "\(Self.number($0)) \(unitTitle) · потребление не считается" } ?? "потребление не считается"
        }
        guard let dailyTarget else { return "\(Self.number(currentIntake)) \(unitTitle)" }
        return "\(Self.number(currentIntake)) из \(Self.number(dailyTarget)) \(unitTitle)"
    }

    /// «посчитано по 3 из 5 записей».
    public var coverageText: String? {
        guard let countedEntries, let totalEntries, totalEntries > 0 else { return nil }
        return "посчитано по \(countedEntries) \(DS.Plural.format("plural.of_records %lld", totalEntries))"
    }

    public var fraction: Double {
        guard let currentIntake, let dailyTarget, dailyTarget > 0 else { return 0 }
        return min(max(currentIntake / dailyTarget, 0), 1)
    }

    static func number(_ value: Double) -> String {
        value >= 10 ? NumberText.grouped(value.jsRounded) : NumberText.oneDecimal(value)
    }

}

/// `GET /food-tracker/recommendations`.
public struct RecommendationsAnswer: Decodable, Sendable, Equatable {
    public var daily: [String: [NutrientRecommendation]]
    public var weekly: [NutrientRecommendation]

    public init(daily: [String: [NutrientRecommendation]], weekly: [NutrientRecommendation] = []) {
        self.daily = daily
        self.weekly = weekly
    }

    enum CodingKeys: String, CodingKey { case daily, weekly }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        daily = try container.decodeIfPresent([String: [NutrientRecommendation]].self, forKey: .daily) ?? [:]
        weekly = try container.decodeIfPresent([NutrientRecommendation].self, forKey: .weekly) ?? []
    }

    public static let categoryOrder = ["vitamins", "minerals", "lipids", "fiber", "plant", "custom"]

    public static func categoryTitle(_ key: String) -> String {
        switch key {
        case "vitamins": return "Витамины"
        case "minerals": return "Минералы"
        case "lipids": return "Липиды"
        case "fiber": return "Клетчатка"
        case "plant": return "Растительность"
        case "custom": return "Свои"
        case "weekly": return "За неделю"
        default: return key
        }
    }

    /// Непустые категории по порядку, недельные — последними.
    public var sections: [(key: String, items: [NutrientRecommendation])] {
        var result = Self.categoryOrder.compactMap { key -> (String, [NutrientRecommendation])? in
            guard let items = daily[key], !items.isEmpty else { return nil }
            return (key, items)
        }
        if !weekly.isEmpty { result.append(("weekly", weekly)) }
        return result.map { (key: $0.0, items: $0.1) }
    }

    public var all: [NutrientRecommendation] { daily.values.flatMap { $0 } + weekly }
}

/// Своя рекомендация: название 2–50 символов, норма больше нуля, единица
/// г, мг, мкг или МЕ — границы веба.
public enum CustomRecommendationForm {
    public static func validate(name: String, target: String) -> (String, Double)? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (2...50).contains(trimmed.count),
              let value = Double(target.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")),
              value > 0, value <= 100_000 else { return nil }
        return (trimmed, value)
    }
}

/// Вкладка «Нутриенты» (`ios-food-diary`).
@MainActor
@Observable
public final class NutrientsModel {
    public private(set) var answer: RecommendationsAnswer?
    public private(set) var error: String?
    public private(set) var details: [String: NutrientRecommendation] = [:]

    private let api: APIClient

    public init(api: APIClient) {
        self.api = api
    }

    public func load() async {
        do {
            answer = try await api.send(.get("/api/v1/food-tracker/recommendations"), as: RecommendationsAnswer.self)
            error = nil
        } catch {
            self.error = "Не удалось загрузить рекомендации."
        }
    }

    public func loadDetail(_ id: String) async -> NutrientRecommendation? {
        if let cached = details[id] { return cached }
        guard let detail = try? await api.send(.get("/api/v1/food-tracker/recommendations/\(id)"),
                                               as: NutrientRecommendation.self) else { return nil }
        details[id] = detail
        return detail
    }

    /// «Настроить список»: весь список отслеживаемых, не пустой.
    @discardableResult
    public func saveTracked(_ ids: Set<String>) async -> Bool {
        guard !ids.isEmpty,
              let endpoint = try? Endpoint.put("/api/v1/food-tracker/recommendations/preferences",
                                               body: ["nutrient_ids": ids.sorted()]) else { return false }
        do {
            let raw = try await api.sendRaw(endpoint)
            guard (200..<300).contains(raw.status) else { return false }
            await load()
            return true
        } catch {
            return false
        }
    }

    /// «Добавить рекомендацию».
    @discardableResult
    public func addCustom(name: String, target: String, unit: NutrientUnit) async -> Bool {
        guard let (title, value) = CustomRecommendationForm.validate(name: name, target: target) else { return false }
        struct Body: Encodable, Sendable {
            let name: String
            let dailyTarget: Double
            let unit: String
            enum CodingKeys: String, CodingKey {
                case name, unit
                case dailyTarget = "daily_target"
            }
        }
        guard let endpoint = try? Endpoint.post("/api/v1/food-tracker/recommendations/custom",
                                                body: Body(name: title, dailyTarget: value, unit: unit.rawValue)) else { return false }
        do {
            let raw = try await api.sendRaw(endpoint)
            guard (200..<300).contains(raw.status) else { return false }
            await load()
            return true
        } catch {
            return false
        }
    }
}
