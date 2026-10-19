import Foundation

/// День как строка `yyyy-MM-dd` — так его понимает сервер. Календарь —
/// григорианский с понедельника, в поясе профиля (сутки шагов и дата
/// взвешивания считаются по нему, а не по поясу телефона).
public struct DayCalendar: Sendable, Equatable {
    public let timeZone: TimeZone

    public init(timeZone: TimeZone = .current) {
        self.timeZone = timeZone
    }

    public var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.firstWeekday = 2
        calendar.locale = Locale(identifier: "ru_RU")
        return calendar
    }

    /// День момента `date`.
    public func key(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Полночь дня `key`.
    public func date(_ key: String) -> Date? {
        let parts = key.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    public func adding(days: Int, to key: String) -> String {
        guard let date = date(key), let shifted = calendar.date(byAdding: .day, value: days, to: date) else { return key }
        return self.key(shifted)
    }

    /// Понедельник недели дня.
    public func weekStart(of key: String) -> String {
        guard let date = date(key) else { return key }
        let weekday = calendar.component(.weekday, from: date)
        let offset = (weekday + 5) % 7
        return adding(days: -offset, to: key)
    }

    /// Пн…Вс недели дня.
    public func week(of key: String) -> [String] {
        let monday = weekStart(of: key)
        return (0..<7).map { adding(days: $0, to: monday) }
    }

    /// 1 — понедельник … 7 — воскресенье.
    public func isoWeekday(_ key: String) -> Int {
        guard let date = date(key) else { return 1 }
        let weekday = calendar.component(.weekday, from: date)
        return weekday == 1 ? 7 : weekday - 1
    }

    /// Неделя ISO 8601 «2026-W42» — `week_identifier` фото недели, как в вебе.
    public func isoWeekIdentifier(_ key: String) -> String {
        var iso = Calendar(identifier: .iso8601)
        iso.timeZone = timeZone
        guard let date = date(key) else { return "" }
        let parts = iso.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return String(format: "%04d-W%02d", parts.yearForWeekOfYear ?? 0, parts.weekOfYear ?? 0)
    }

    /// Начало дня в поясе профиля — RFC 3339 для `week_start` и `week_end` отчёта.
    public func rfc3339(_ key: String) -> String {
        guard let date = date(key) else { return key }
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = timeZone
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}

public enum DayKey {
    /// `2026-10-17T00:00:00Z` → `2026-10-17`.
    public static func of(_ raw: String) -> String {
        String(raw.prefix(10))
    }
}

/// Подписи дат по-русски.
public enum DayText {
    private static let weekdays = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
    private static let shortWeekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    private static let monthsGenitive = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
                                         "сентября", "октября", "ноября", "декабря"]

    static func parts(_ key: String) -> (year: Int, month: Int, day: Int)? {
        let parts = key.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return nil }
        return (parts[0], parts[1], parts[2])
    }

    /// «17 октября».
    public static func dayMonth(_ key: String) -> String {
        guard let parts = parts(key) else { return key }
        return "\(parts.day) \(monthsGenitive[parts.month - 1])"
    }

    /// «пятница, 17 октября».
    public static func full(_ key: String, calendar: DayCalendar) -> String {
        "\(weekdays[calendar.isoWeekday(key) - 1]), \(dayMonth(key))"
    }

    /// «Пт».
    public static func short(_ key: String, calendar: DayCalendar) -> String {
        shortWeekdays[calendar.isoWeekday(key) - 1]
    }

    /// Число месяца: «17».
    public static func dayNumber(_ key: String) -> String {
        parts(key).map { String($0.day) } ?? ""
    }
}
