import Client
import DesignSystem
import Foundation

/// Подписи экранов куратора, общие с вебом.
public enum CuratorText {
    /// Время последнего сообщения в списке переписок, как `formatRelativeTime`
    /// веба: «только что», «N мин назад», «N ч назад», «вчера», иначе «ДД.ММ.ГГГГ».
    public static func relative(_ date: Date, now: Date, calendar: DayCalendar) -> String {
        let seconds = now.timeIntervalSince(date)
        let minutes = Int((seconds / 60).rounded(.down))
        let hours = Int((seconds / 3600).rounded(.down))
        if minutes < 1 { return "только что" }
        if minutes < 60 { return DS.Plural.format("plural.minutes_ago %lld", minutes) }
        if hours < 24 { return "\(hours) ч назад" }
        let day = calendar.key(date)
        if day == calendar.adding(days: -1, to: calendar.key(now)) { return "вчера" }
        let parts = day.split(separator: "-")
        guard parts.count == 3 else { return day }
        return "\(parts[2]).\(parts[1]).\(parts[0])"
    }

    /// Превью последнего сообщения: текст до 50 символов, «Фото», «Файл», «КБЖУ запись».
    public static func preview(type: String?, content: String?) -> String {
        guard let type else { return "Нет сообщений" }
        switch type {
        case "image": return "Фото"
        case "file": return "Файл"
        case "food_entry": return "КБЖУ запись"
        default: return truncate(content ?? "", 50)
        }
    }

    static func truncate(_ text: String, _ limit: Int) -> String {
        guard text.count > limit else { return text }
        var cut = String(text.prefix(limit))
        while cut.last?.isWhitespace == true { cut.removeLast() }
        return cut + "..."
    }

    /// Инициалы: первая буква первого и последнего слова — «МК».
    public static func initials(_ name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace)
        guard let first = words.first?.first else { return "?" }
        guard words.count > 1, let last = words.last?.first else { return String(first).uppercased() }
        return (String(first) + String(last)).uppercased()
    }

    /// «32 года», «41 год», «25 лет».
    public static func years(_ age: Int) -> String {
        DS.Plural.format("plural.years %lld", age)
    }

    /// «3 дня», «1 день», «5 дней».
    public static func days(_ count: Int) -> String {
        DS.Plural.format("plural.days %lld", count)
    }
}
