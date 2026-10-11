import Foundation

/// Форматы дат, в которых говорит API.
enum APIDates {
    /// Календарный день `2006-01-02` — в путях и параметрах запросов.
    ///
    /// День считается в часовом поясе устройства: «сегодня» для человека — это
    /// его сегодня, а не сегодня по Гринвичу.
    static func day(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Время `15:04` — так сервер принимает время записи в дневнике.
    static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    /// Разбор отметки времени RFC 3339 с долями секунды и без них.
    static func timestamp(_ raw: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: raw)
    }
}
