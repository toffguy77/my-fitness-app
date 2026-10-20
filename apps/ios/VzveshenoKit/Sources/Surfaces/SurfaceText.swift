import DesignSystem
import Foundation

/// Числа и фразы виджетов и голосовых ответов.
///
/// Разряды — неразрывным пробелом, как `NumberText` в `Client` (расширение
/// его не подключает): у `NumberFormatter` русской локали разделитель на
/// разных системах разный, а фразы сверяются со спеками побайтно.
public enum SurfaceText {
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
        let whole = grouped(tenths / 10)
        return tenths % 10 == 0 ? whole : "\(whole),\(tenths % 10)"
    }

    /// «1 923 килокалории».
    public static func kilocalories(_ value: Int) -> String {
        DS.Plural.format("plural.kcal %lld", value, numberText: grouped(value))
    }

    /// «49 граммов».
    public static func grams(_ value: Int) -> String {
        DS.Plural.format("plural.grams %lld", value, numberText: grouped(value))
    }

    /// «из 8 стаканов».
    public static func ofGlasses(_ value: Int) -> String {
        DS.Plural.format("plural.of_glasses %lld", value, numberText: grouped(value))
    }
}

/// Ответ «Сколько калорий осталось» (`ios-app-intents`).
public enum RemainingCaloriesAnswer {
    public static let noData = "Откройте Взвешено, чтобы обновить данные за сегодня"
    public static let noNorm = "Норма ещё не посчитана. Откройте Взвешено, чтобы заполнить профиль"

    /// Фраза по снимку дня; без снимка за сегодня — просьба открыть приложение.
    public static func text(_ snapshot: DaySnapshot?, now: Date) -> String {
        guard let snapshot, snapshot.isCurrent(at: now), let nutrition = snapshot.nutrition else { return noData }
        guard let remaining = nutrition.remainingKcal else { return noNorm }
        let head = remaining >= 0
            ? "Осталось \(SurfaceText.kilocalories(remaining))"
            : "Сверх нормы \(SurfaceText.kilocalories(-remaining))"
        guard let protein = nutrition.protein else { return head }
        let tail = protein.left >= 0
            ? "Белки — \(SurfaceText.grams(protein.left))"
            : "Белки — сверх нормы \(SurfaceText.grams(-protein.left))"
        return "\(head). \(tail)"
    }
}
