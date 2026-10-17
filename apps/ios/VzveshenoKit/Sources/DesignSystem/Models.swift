import Foundation

/// Нутриент — белки, жиры, углеводы. Цвет опознаёт, а не оценивает.
public enum Macro: String, CaseIterable, Sendable, Hashable {
    case protein, fat, carbs

    public var title: String {
        switch self {
        case .protein: return "Белки"
        case .fat: return "Жиры"
        case .carbs: return "Углеводы"
        }
    }

    public var fillRole: DS.ColorRole {
        switch self {
        case .protein: return .macroProtein
        case .fat: return .macroFat
        case .carbs: return .macroCarbs
        }
    }

    public var textRole: DS.ColorRole {
        switch self {
        case .protein: return .macroProteinFg
        case .fat: return .macroFatFg
        case .carbs: return .macroCarbsFg
        }
    }
}

/// Остаток по нутриенту — главное число («осталось 49 г»), съеденное — подпись.
///
/// Без нормы — съеденное без доли; превышение — словом и знаком «+», без
/// перекраски (docs/design-system, §1).
public struct MacroRemainingValue: Equatable, Sendable {
    public enum State: Equatable, Sendable {
        case left
        case over
        case noGoal
    }

    public let macro: Macro
    public let eaten: Int
    public let goal: Int?

    public init(macro: Macro, eaten: Double, goal: Double?) {
        self.macro = macro
        self.eaten = Int(eaten.rounded())
        let roundedGoal = goal.map { Int($0.rounded()) }
        self.goal = (roundedGoal ?? 0) > 0 ? roundedGoal : nil
    }

    public var state: State {
        guard let goal else { return .noGoal }
        return eaten > goal ? .over : .left
    }

    /// Главное число: «49», «+12» или съеденное без нормы.
    public var headline: String {
        switch state {
        case .noGoal: return "\(eaten)"
        case .left: return "\((goal ?? 0) - eaten)"
        case .over: return "+\(eaten - (goal ?? 0))"
        }
    }

    /// Подпись под числом.
    public var caption: String {
        switch state {
        case .noGoal: return "съедено"
        case .left: return "осталось"
        case .over: return "сверх нормы"
        }
    }

    /// «91 из 140 г»; без нормы — нет.
    public var ofGoal: String? {
        goal.map { "\(eaten) из \($0) г" }
    }

    /// Текст для VoiceOver.
    public var accessibilityLabel: String {
        switch state {
        case .noGoal:
            return "\(macro.title): съедено \(eaten) г, норма не задана"
        case .left:
            return "\(macro.title): осталось \((goal ?? 0) - eaten) г, съедено \(eaten) из \(goal ?? 0) г"
        case .over:
            return "\(macro.title): сверх нормы на \(eaten - (goal ?? 0)) г, съедено \(eaten) из \(goal ?? 0) г"
        }
    }

    /// Доля полосы: > 100% не заполняется дальше и не перекрашивается.
    public var fraction: Double {
        guard let goal, goal > 0 else { return 0 }
        return min(max(Double(eaten) / Double(goal), 0), 1)
    }
}

/// День недели для недельных точек: отклонение от нормы долей (0.08 = +8%).
public struct WeekDay: Equatable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let deviation: Double?
    public let isToday: Bool

    public init(date: String, label: String, deviation: Double?, isToday: Bool = false) {
        self.id = date
        self.label = label
        self.deviation = deviation
        self.isToday = isToday
    }

    public func isInside(tolerance: Double = 0.05) -> Bool {
        guard let deviation, !isToday else { return false }
        return abs(deviation) <= tolerance
    }

    public func stateText(tolerance: Double = 0.05) -> String {
        if isToday { return "сегодня, день ещё идёт" }
        guard let deviation else { return "нет данных" }
        if abs(deviation) <= tolerance { return "в пределах нормы" }
        let percent = Int((abs(deviation) * 100).rounded())
        return deviation > 0 ? "выше нормы на \(percent)%" : "ниже нормы на \(percent)%"
    }

    public var accessibilityLabel: String { "\(label): \(stateText())" }
}

public enum WeekSummary {
    /// «5 из 6 в норме»: сегодняшний день и дни без данных не считаются.
    public static func count(_ days: [WeekDay], tolerance: Double = 0.05) -> (inside: Int, total: Int) {
        let counted = days.filter { $0.deviation != nil && !$0.isToday }
        return (counted.filter { $0.isInside(tolerance: tolerance) }.count, counted.count)
    }
}

/// Калории дня для дуги: остаток — главное число.
public struct EnergySummary: Equatable, Sendable {
    public let eaten: Int
    public let goal: Int?

    public init(eaten: Int, goal: Int?) {
        self.eaten = eaten
        self.goal = (goal ?? 0) > 0 ? goal : nil
    }

    public var remaining: Int? { goal.map { $0 - eaten } }

    public var fraction: Double {
        guard let goal else { return 0 }
        return min(max(Double(eaten) / Double(goal), 0), 1)
    }

    /// «Съедено 549 из 2 472 килокалорий».
    public var accessibilityLabel: String {
        guard let goal else { return "Съедено \(DS.Plural.grouped(eaten)) ккал, норма не задана" }
        return "Съедено \(DS.Plural.grouped(eaten)) \(DS.Plural.format("plural.of_kcal %lld", goal))"
    }
}
