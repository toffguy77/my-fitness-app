import Foundation

/// Запись пачки `POST /api/v1/health/import` (`health-import`).
///
/// Поля как их ждёт `apps/api/internal/modules/dashboard/health_import.go`:
/// `steps {date, value}`, `weight {date, value_kg}`,
/// `workout {external_id, date, started_at, type, duration_min}`,
/// `workout_deleted {external_id}`. Пустые поля не кодируются.
public struct HealthImportItem: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case steps
        case weight
        case workout
        case workoutDeleted = "workout_deleted"
    }

    public var kind: Kind
    public var date: String?
    public var value: Double?
    public var valueKg: Double?
    public var externalID: String?
    public var startedAt: String?
    public var type: String?
    public var durationMin: Double?

    enum CodingKeys: String, CodingKey {
        case kind, date, value, type
        case valueKg = "value_kg"
        case externalID = "external_id"
        case startedAt = "started_at"
        case durationMin = "duration_min"
    }

    public static func steps(date: String, value: Int) -> HealthImportItem {
        HealthImportItem(kind: .steps, date: date, value: Double(value))
    }

    public static func weight(date: String, kilograms: Double) -> HealthImportItem {
        HealthImportItem(kind: .weight, date: date, valueKg: (kilograms * 100).rounded() / 100)
    }

    public static func workout(id: UUID, date: String, startedAt: String, type: String, minutes: Int) -> HealthImportItem {
        HealthImportItem(kind: .workout, date: date, externalID: id.uuidString, startedAt: startedAt, type: type,
                         durationMin: Double(minutes))
    }

    public static func workoutDeleted(id: UUID) -> HealthImportItem {
        HealthImportItem(kind: .workoutDeleted, externalID: id.uuidString)
    }

    /// Несёт ли запись данные шагов или веса — по ним видно, что Здоровье
    /// отдаёт данные (`HealthAccessHint`). Ноль шагов сервер считает
    /// отсутствием значения.
    public var carriesStepsOrWeight: Bool {
        switch kind {
        case .steps: return (value ?? 0) > 0
        case .weight: return valueKg != nil
        case .workout, .workoutDeleted: return false
        }
    }
}

/// Тело пачки.
public struct HealthImportBatch: Codable, Equatable, Sendable {
    public var items: [HealthImportItem]

    public init(items: [HealthImportItem]) {
        self.items = items
    }
}

/// Границы импорта — те же, что проверяет сервер.
public enum HealthImportLimits {
    public static let path = "/api/v1/health/import"
    /// Больше 500 записей сервер отклоняет целиком.
    public static let maxItemsPerBatch = 500
    /// Первая загрузка — не глубже 90 дней.
    public static let backfillDays = 90
    /// Вес вне 20–500 кг сервер отклоняет: весы, подхватившие ребёнка или
    /// питомца, не должны сбивать тренд.
    public static let weightRange: ClosedRange<Double> = 20...500
    public static let workoutMinutes: ClosedRange<Int> = 1...600

    /// Разбивает записи на пачки не больше `size`, сохраняя порядок.
    public static func chunk(_ items: [HealthImportItem], size: Int = maxItemsPerBatch) -> [[HealthImportItem]] {
        guard size > 0 else { return [items] }
        return stride(from: 0, to: items.count, by: size).map { Array(items[$0..<min($0 + size, items.count)]) }
    }
}

/// Календарь дат профиля: `YYYY-MM-DD` и границы суток в поясе профиля,
/// а не устройства (`health-import`: дата — в часовом поясе профиля).
public struct ProfileCalendar: Sendable {
    public let timeZone: TimeZone
    public let calendar: Calendar

    public init(timeZone: TimeZone) {
        self.timeZone = timeZone
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = Locale(identifier: "en_US_POSIX")
        self.calendar = calendar
    }

    public func dateString(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    public func startOfDay(_ date: Date) -> Date {
        calendar.startOfDay(for: date)
    }

    public func day(after date: Date) -> Date {
        calendar.date(byAdding: .day, value: 1, to: startOfDay(date)) ?? date.addingTimeInterval(86_400)
    }

    /// Начало первого дня первой загрузки: сегодня и ещё `days - 1` дней назад.
    public func backfillStart(now: Date, days: Int = HealthImportLimits.backfillDays) -> Date {
        calendar.date(byAdding: .day, value: -(days - 1), to: startOfDay(now)) ?? startOfDay(now)
    }

    /// Каждый день `[from, to]` — начала суток.
    public func days(from: Date, through: Date) -> [Date] {
        var result: [Date] = []
        var day = startOfDay(from)
        let last = startOfDay(through)
        while day <= last {
            result.append(day)
            day = self.day(after: day)
        }
        return result
    }
}

/// Строит записи импорта из того, что отдало Здоровье. Только Foundation:
/// проверяется на фикстурах образцов и на Linux.
public struct HealthRecordBuilder: Sendable {
    public let profile: ProfileCalendar

    public init(timeZone: TimeZone) {
        profile = ProfileCalendar(timeZone: timeZone)
    }

    /// Шаги: сумма дня из статистики Здоровья, как есть.
    ///
    /// `includeZero` — для дней, где образцы изменились: ноль снимает у
    /// сервера прежнее импортированное значение. При первой загрузке пустые
    /// дни не отправляются.
    public func stepItems(days: [Date], totals: [Date: Double], includeZero: Bool) -> [HealthImportItem] {
        let byDay = Dictionary(totals.map { (profile.dateString($0.key), $0.value) }, uniquingKeysWith: +)
        var seen = Set<String>()
        return days.sorted().compactMap { day in
            let date = profile.dateString(day)
            guard seen.insert(date).inserted else { return nil }
            let steps = Int((byDay[date] ?? 0).rounded())
            guard steps > 0 || includeZero else { return nil }
            return .steps(date: date, value: steps)
        }
    }

    /// Вес: самое раннее взвешивание даты профиля (`design.md`: вечерний вес
    /// после еды искажает тренд). Взвешивания вне 20–500 кг пропускаются,
    /// и ранним становится следующее — иначе ребёнок на весах в 7:00 стёр бы
    /// взрослое взвешивание в 7:05.
    public func weightItems(for dates: Set<String>, samples: [WeightSample]) -> [HealthImportItem] {
        var earliest: [String: WeightSample] = [:]
        for sample in samples where HealthImportLimits.weightRange.contains(sample.kilograms) {
            let date = profile.dateString(sample.date)
            guard dates.contains(date) else { continue }
            if let current = earliest[date], current.date <= sample.date { continue }
            earliest[date] = sample
        }
        return earliest.keys.sorted().compactMap { date in
            earliest[date].map { .weight(date: date, kilograms: $0.kilograms) }
        }
    }

    /// Тренировки и удаления. Дата — день начала в поясе профиля.
    /// Тренировка вне 1–600 минут не отправляется: сервер её отклонит.
    public func workoutItems(added: [WorkoutSample], deleted: [UUID]) -> [HealthImportItem] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let workouts = added.sorted { $0.start < $1.start }.compactMap { workout -> HealthImportItem? in
            let minutes = Int((workout.duration / 60).rounded())
            guard HealthImportLimits.workoutMinutes.contains(minutes) else { return nil }
            return .workout(id: workout.id, date: profile.dateString(workout.start),
                            startedAt: formatter.string(from: workout.start), type: workout.activity, minutes: minutes)
        }
        return workouts + deleted.map { .workoutDeleted(id: $0) }
    }
}
