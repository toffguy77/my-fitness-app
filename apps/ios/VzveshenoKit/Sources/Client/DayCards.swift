import Foundation

/// День в полосе недели: три точки — питание, вес, активность.
public struct WeekStripDay: Sendable, Equatable, Identifiable {
    public let day: String
    public let weekday: String
    public let number: String
    public let nutrition: Bool
    public let weight: Bool
    public let activity: Bool
    public let isSelected: Bool
    public let isToday: Bool
    public let isFuture: Bool

    public var id: String { day }

    public var accessibilityLabel: String {
        let marks = [nutrition ? "питание записано" : nil, weight ? "вес записан" : nil, activity ? "есть активность" : nil]
            .compactMap { $0 }
        return "\(weekday) \(number)" + (marks.isEmpty ? ", нет записей" : ", " + marks.joined(separator: ", "))
    }
}

public enum WeekStrip {
    /// Семь дней недели выбранного дня. `GET /dashboard/week` отдаёт только
    /// дни, у которых есть строка, — неделя строится от дат, а не от ответа.
    public static func days(selected: String, today: String, metrics: [DailyMetrics], calendar: DayCalendar) -> [WeekStripDay] {
        let byDay = Dictionary(metrics.map { ($0.day, $0) }, uniquingKeysWith: { _, last in last })
        return calendar.week(of: selected).map { day in
            let metric = byDay[day]
            return WeekStripDay(
                day: day,
                weekday: DayText.short(day, calendar: calendar),
                number: DayText.dayNumber(day),
                nutrition: (metric?.calories ?? 0) > 0,
                weight: metric?.weight != nil,
                activity: (metric?.steps ?? 0) > 0 || (metric?.workoutCompleted ?? false),
                isSelected: day == selected,
                isToday: day == today,
                isFuture: day > today
            )
        }
    }
}

/// Подпись источника под значением дня.
public enum SourceLabel {
    public static func text(_ source: MetricSource?) -> String? {
        source == .healthkit ? "из Здоровья" : nil
    }
}

/// Карточка «Шаги»: цель — `stepsGoal` плана, иначе 10 000.
public struct StepsCard: Sendable, Equatable {
    public static let defaultGoal = 10_000

    public let steps: Int
    public let goal: Int
    public let source: MetricSource?

    public init(day: DailyMetrics, plan: WeeklyPlan?) {
        steps = day.steps
        let planned = plan?.stepsGoal ?? 0
        goal = planned > 0 ? planned : Self.defaultGoal
        source = day.stepsSource
    }

    public var value: String { NumberText.grouped(steps) }
    public var fraction: Double { min(max(Double(steps) / Double(goal), 0), 1) }
    /// «из Здоровья · цель 10 000» / «цель 10 000».
    public var caption: String {
        let goalText = "цель \(NumberText.grouped(goal))"
        return SourceLabel.text(source).map { "\($0) · \(goalText)" } ?? goalText
    }
}

/// Карточка «Вода»: нет цели куратора (`enabled == false`) — нет карточки.
public struct WaterCard: Sendable, Equatable {
    public let glasses: Int
    public let goal: Int

    public init?(water: WaterDay?) {
        guard let water, water.enabled else { return nil }
        glasses = water.glasses
        goal = water.goal
    }

    public init(glasses: Int, goal: Int) {
        self.glasses = glasses
        self.goal = goal
    }

    public var value: String { NumberText.grouped(glasses) }
    /// «из 8 стаканов».
    public var caption: String { "из \(Plural.ofGlasses(goal))" }
    public var accessibilityLabel: String { "Вода: \(glasses) из \(Plural.ofGlasses(goal))" }
}

/// Карточка «Вес»: последнее значение до выбранного дня и изменение за неделю.
public struct WeightCard: Sendable, Equatable {
    public let weight: Double?
    /// Изменение за 7 дней: последнее минус значение неделей раньше.
    public let weeklyChange: Double?
    public let source: MetricSource?
    /// «07:42» — время записи из Здоровья в поясе профиля.
    public let time: String?

    public init(weight: Double?, weeklyChange: Double?, source: MetricSource?, time: String? = nil) {
        self.weight = weight
        self.weeklyChange = weeklyChange
        self.source = source
        self.time = time
    }

    /// Вес дня, иначе последний из тренда до этого дня; изменение — от
    /// последнего замера не позже, чем за 7 дней до него.
    public init(day: DailyMetrics, trend: [ProgressData.Point], selected: String, calendar: DayCalendar) {
        let points = trend.map { (day: DayKey.of($0.date), weight: $0.weight) }
            .filter { $0.day <= selected }
            .sorted { $0.day < $1.day }
        let latest: (day: String, weight: Double)? = day.weight.map { (selected, $0) } ?? points.last
        weight = latest?.weight
        if let latest {
            let weekAgo = calendar.adding(days: -7, to: latest.day)
            let previous = points.last { $0.day <= weekAgo }
            weeklyChange = previous.map { latest.weight - $0.weight }
        } else {
            weeklyChange = nil
        }
        source = day.weight != nil ? day.weightSource : nil
        time = nil
    }

    public var value: String? { weight.map(NumberText.oneDecimal) }

    /// «−0,3 кг за неделю».
    public var changeText: String? {
        guard let weeklyChange else { return nil }
        let rounded = (weeklyChange * 10).rounded() / 10
        if rounded == 0 { return "без изменений за неделю" }
        return (rounded > 0 ? "+" : "") + NumberText.oneDecimal(rounded) + " кг за неделю"
    }

    public var caption: String? {
        guard let label = SourceLabel.text(source) else { return nil }
        return time.map { "\(label) · \($0)" } ?? label
    }
}

/// Вид тренировки: код сервера и подпись.
public struct WorkoutKind: Sendable, Equatable, Hashable, Identifiable {
    public let code: String
    public let title: String

    public var id: String { code }

    /// Коды после миграции 062 (`nutrition-calc/types.go`).
    public static let all: [WorkoutKind] = [
        WorkoutKind(code: "strength", title: "Силовая"),
        WorkoutKind(code: "cardio", title: "Кардио"),
        WorkoutKind(code: "hiit", title: "Интервальная"),
        WorkoutKind(code: "yoga", title: "Йога"),
        WorkoutKind(code: "stretching", title: "Растяжка"),
        WorkoutKind(code: "swimming", title: "Плавание"),
        WorkoutKind(code: "running", title: "Бег"),
        WorkoutKind(code: "cycling", title: "Велосипед"),
    ]

    public static func title(for code: String) -> String {
        all.first { $0.code == code }?.title ?? "Тренировка"
    }
}

/// Карточка «Тренировка»: длительность, вид и прибавка к норме.
public struct WorkoutCard: Sendable, Equatable {
    public let minutes: Int?
    public let kinds: [String]
    public let bonus: Int
    public let source: MetricSource?

    public init(minutes: Int?, kinds: [String], bonus: Int, source: MetricSource?) {
        self.minutes = minutes
        self.kinds = kinds
        self.bonus = bonus
        self.source = source
    }

    public init(day: DailyMetrics, targets: CalculatedTargets?) {
        let durations = day.workoutTypeDurations ?? [:]
        let total = day.workoutDuration ?? (durations.isEmpty ? nil : durations.values.reduce(0, +))
        minutes = day.workoutCompleted ? total : nil
        kinds = day.workoutCompleted ? (day.workoutTypes ?? []) : []
        bonus = NumberText.jsRound(targets?.workoutBonus ?? 0)
        source = day.workoutCompleted ? day.workoutSource : nil
    }

    public var hasWorkout: Bool { minutes != nil || !kinds.isEmpty }
    public var value: String { minutes.map { NumberText.grouped($0) } ?? "—" }

    /// «Силовая · +210 ккал к норме».
    public var detail: String {
        guard hasWorkout else { return "не было" }
        let names = kinds.map(WorkoutKind.title(for:)).joined(separator: ", ")
        let bonusText = bonus > 0 ? "+\(NumberText.grouped(bonus)) ккал к норме" : nil
        return [names.isEmpty ? nil : names, bonusText].compactMap { $0 }.joined(separator: " · ")
    }
}

/// Границы ручного ввода — те же, что в вебе (`ios-client-today`).
public enum ManualInput {
    public static let steps = 0...100_000
    public static let weight = 0.1...500.0
    public static let workoutMinutes = 1...600

    /// Шаги: целое 0–100 000.
    public static func steps(_ text: String) -> Int? {
        guard let value = Int(text.filter { !$0.isWhitespace }), steps.contains(value) else { return nil }
        return value
    }

    /// Вес: 0,1–500 кг, не больше одного знака после запятой.
    public static func weight(_ text: String) -> Double? {
        let normalized = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !normalized.isEmpty, let value = Double(normalized), value.isFinite else { return nil }
        if let dot = normalized.firstIndex(of: "."), normalized[normalized.index(after: dot)...].count > 1 { return nil }
        guard weight.contains(value) else { return nil }
        return value
    }

    /// Тренировка: вид из списка и 1–600 минут.
    public static func workout(kind: String?, minutes text: String) -> (kind: String, minutes: Int)? {
        guard let kind, WorkoutKind.all.contains(where: { $0.code == kind }),
              let minutes = Int(text.trimmingCharacters(in: .whitespaces)), workoutMinutes.contains(minutes) else {
            return nil
        }
        return (kind, minutes)
    }
}

/// Склонения экрана «Сегодня» (без зависимости от каталога DesignSystem).
public enum Plural {
    static func form(_ number: Int, _ one: String, _ few: String, _ many: String) -> String {
        let value = abs(number)
        let mod10 = value % 10
        let mod100 = value % 100
        if mod10 == 1 && mod100 != 11 { return one }
        if (2...4).contains(mod10) && !(12...14).contains(mod100) { return few }
        return many
    }

    /// Родительный после «из»: «из 1 стакана», «из 8 стаканов».
    public static func ofGlasses(_ number: Int) -> String {
        "\(NumberText.grouped(number)) \(form(number, "стакана", "стаканов", "стаканов"))"
    }

    /// «3 дня».
    public static func days(_ number: Int) -> String {
        "\(number) \(form(number, "день", "дня", "дней"))"
    }
}
