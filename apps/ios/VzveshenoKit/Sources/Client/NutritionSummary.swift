import Foundation

/// Числа на экране: целые, разряды — неразрывным пробелом («2 472»),
/// дробная часть — запятой («78,4»). Свой форматтер, а не `NumberFormatter`:
/// разделитель разрядов у русской локали на разных системах разный
/// (U+00A0 или U+202F), а тексты сверяются с вебом и спеками побайтно.
public enum NumberText {
    public static let nbsp = "\u{00A0}"

    public static func grouped(_ value: Int) -> String {
        let digits = String(abs(value))
        var groups: [Substring] = []
        var end = digits.endIndex
        while end > digits.startIndex {
            let start = digits.index(end, offsetBy: -3, limitedBy: digits.startIndex) ?? digits.startIndex
            groups.insert(digits[start..<end], at: 0)
            end = start
        }
        return (value < 0 ? "−" : "") + groups.joined(separator: nbsp)
    }

    /// Один знак после запятой без лишнего нуля: 78.4 → «78,4», 78.0 → «78».
    public static func oneDecimal(_ value: Double) -> String {
        let tenths = Int((abs(value) * 10).rounded())
        let sign = value < 0 && tenths > 0 ? "−" : ""
        let whole = grouped(tenths / 10)
        return tenths % 10 == 0 ? sign + whole : "\(sign)\(whole),\(tenths % 10)"
    }

    /// Округление, как `Math.round` в вебе: половина — вверх.
    public static func jsRound(_ value: Double) -> Int {
        Int((value + 0.5).rounded(.down))
    }
}

/// Откуда норма: план куратора или расчёт сервера.
public enum NormSource: String, Sendable, Equatable {
    case curator
    case calculated

    public var label: String {
        switch self {
        case .curator: return "норма куратора"
        case .calculated: return "рассчитано автоматически"
        }
    }
}

/// Норма дня. Каждое поле — из плана куратора, а без него — из расчёта:
/// так же, как `NutritionBlock` веба (`weeklyPlan?.x || calcTargets?.x`).
public struct DailyNorm: Sendable, Equatable {
    public let calories: Int
    public let protein: Int?
    public let fat: Int?
    public let carbs: Int?
    public let source: NormSource

    /// `nil` — нормы нет: ни плана, ни расчёта.
    public static func resolve(plan: WeeklyPlan?, targets: CalculatedTargets?) -> DailyNorm? {
        func pick(_ planned: Int?, _ calculated: Double?) -> Double? {
            if let planned, planned != 0 { return Double(planned) }
            if let calculated, calculated != 0 { return calculated }
            return nil
        }
        guard let calories = pick(plan?.caloriesGoal, targets?.calories) else { return nil }
        let fromPlan = (plan?.caloriesGoal ?? 0) != 0
        return DailyNorm(
            calories: NumberText.jsRound(calories),
            protein: pick(plan?.proteinGoal, targets?.protein).map(NumberText.jsRound),
            fat: pick(plan?.fatGoal, targets?.fat).map(NumberText.jsRound),
            carbs: pick(plan?.carbsGoal, targets?.carbs).map(NumberText.jsRound),
            source: fromPlan ? .curator : .calculated
        )
    }

    /// Остаток по макросам показывается, только когда заданы все три нормы.
    public var hasMacroGoals: Bool {
        (protein ?? 0) > 0 && (fat ?? 0) > 0 && (carbs ?? 0) > 0
    }
}

/// Остаток по макросу: «49» осталось или «+12» сверх нормы.
public struct MacroLeft: Sendable, Equatable {
    public enum Macro: String, Sendable, CaseIterable {
        case protein, fat, carbs

        public var title: String {
            switch self {
            case .protein: return "Белки"
            case .fat: return "Жиры"
            case .carbs: return "Углеводы"
            }
        }
    }

    public let macro: Macro
    public let eaten: Int
    public let goal: Int

    public var isOver: Bool { eaten > goal }
    /// Главное число без единицы: «49», «+12».
    public var headline: String {
        isOver ? "+\(NumberText.grouped(eaten - goal))" : NumberText.grouped(goal - eaten)
    }

    /// Доля полосы: дальше 100 % не заполняется.
    public var fraction: Double {
        goal > 0 ? min(max(Double(eaten) / Double(goal), 0), 1) : 0
    }

    public var accessibilityLabel: String {
        isOver
            ? "\(macro.title): сверх нормы на \(eaten - goal) г, съедено \(eaten) из \(goal) г"
            : "\(macro.title): осталось \(goal - eaten) г, съедено \(eaten) из \(goal) г"
    }
}

/// Карточка «Питание» (`ios-client-today`, задача 2.1).
public struct NutritionSummary: Sendable, Equatable {
    public enum State: Sendable, Equatable {
        /// Есть норма: остаток или превышение.
        case norm(DailyNorm)
        /// «Норма не посчитана»: чего не хватает.
        case noNorm(MissingTargetInputs?)
    }

    public let state: State
    public let eaten: Int
    public let macros: [MacroLeft]?
    /// Съеденные граммы без нормы.
    public let eatenMacros: (protein: Int, fat: Int, carbs: Int)

    public init(day: DailyMetrics, plan: WeeklyPlan?, targets: TargetsAnswer?) {
        eaten = day.calories
        eatenMacros = (day.protein, day.fat, day.carbs)
        if let norm = DailyNorm.resolve(plan: plan, targets: targets?.targets) {
            state = .norm(norm)
            if norm.hasMacroGoals, let protein = norm.protein, let fat = norm.fat, let carbs = norm.carbs {
                macros = [
                    MacroLeft(macro: .protein, eaten: day.protein, goal: protein),
                    MacroLeft(macro: .fat, eaten: day.fat, goal: fat),
                    MacroLeft(macro: .carbs, eaten: day.carbs, goal: carbs),
                ]
            } else {
                macros = nil
            }
        } else {
            state = .noNorm(targets?.missing)
            macros = nil
        }
    }

    public static func == (lhs: NutritionSummary, rhs: NutritionSummary) -> Bool {
        lhs.state == rhs.state && lhs.eaten == rhs.eaten && lhs.macros == rhs.macros
            && lhs.eatenMacros == rhs.eatenMacros
    }

    public var norm: DailyNorm? {
        if case let .norm(norm) = state { return norm }
        return nil
    }

    public var isOver: Bool { norm.map { eaten > $0.calories } ?? false }

    /// Остаток со знаком: отрицательный — превышение; без нормы — `nil`.
    public var remaining: Int? { norm.map { $0.calories - eaten } }

    /// Главное число: «1 923», «+128»; без нормы — съеденное.
    public var headline: String {
        guard let norm else { return NumberText.grouped(eaten) }
        return isOver ? "+\(NumberText.grouped(eaten - norm.calories))" : NumberText.grouped(norm.calories - eaten)
    }

    /// «ккал осталось · съедено 549 из 2 472» / «ккал сверх нормы · …».
    public var caption: String {
        guard let norm else { return "ккал съедено" }
        let tail = "съедено \(NumberText.grouped(eaten)) из \(NumberText.grouped(norm.calories))"
        return (isOver ? "ккал сверх нормы · " : "ккал осталось · ") + tail
    }

    /// Подпись источника нормы.
    public var sourceLabel: String? { norm?.source.label }

    public var fraction: Double {
        guard let norm, norm.calories > 0 else { return 0 }
        return min(max(Double(eaten) / Double(norm.calories), 0), 1)
    }

    /// Чего не хватает для расчёта нормы: «рост, пол и дата рождения», «вес».
    public var missingItems: [String] {
        guard case let .noNorm(missing) = state else { return [] }
        guard let missing else { return ["данные профиля", "вес"] }
        var items: [String] = []
        if missing.profile { items.append("пол, дата рождения и рост") }
        if missing.weight { items.append("вес") }
        return items.isEmpty ? ["данные профиля", "вес"] : items
    }

    public var accessibilityLabel: String {
        guard let norm else { return "Съедено \(NumberText.grouped(eaten)) ккал, норма не посчитана" }
        let eatenText = "съедено \(NumberText.grouped(eaten)) из \(NumberText.grouped(norm.calories)) ккал"
        return isOver
            ? "Сверх нормы на \(NumberText.grouped(eaten - norm.calories)) ккал, \(eatenText)"
            : "Осталось \(NumberText.grouped(norm.calories - eaten)) ккал, \(eatenText)"
    }
}
