import Foundation

/// Компоненты справочника — по одному на роль из
/// apps/web/src/shared/components/ui. UI-тест находит каждый.
public enum CatalogueEntry: String, CaseIterable, Sendable, Identifiable {
    case card, coachCard, progressArc, progressBar, macroRemaining, weekDots, quickAdd, quickAddBar, buttons
    case offlineBanner, spinner, nutritionCard

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .card: return "Card"
        case .coachCard: return "CoachCard"
        case .progressArc: return "ProgressArc"
        case .progressBar: return "ProgressBar"
        case .macroRemaining: return "MacroRemaining"
        case .weekDots: return "WeekDots"
        case .quickAdd: return "QuickAdd"
        case .quickAddBar: return "QuickAddBar"
        case .buttons: return "Кнопки"
        case .offlineBanner: return "OfflineBanner"
        case .spinner: return "Spinner"
        case .nutritionCard: return "Карточка «Питание»"
        }
    }

    /// Идентификатор для UI-тестов.
    public var accessibilityID: String { "catalogue.\(rawValue)" }
}

/// Данные образцов справочника и снапшотов.
public enum CatalogueSamples {
    public static let energy = EnergySummary(eaten: 549, goal: 2_472)
    public static let eaten: [Macro: Double] = [.protein: 91, .fat: 70, .carbs: 120]
    public static let goal: [Macro: Double] = [.protein: 140, .fat: 58, .carbs: 260]
    public static let week: [WeekDay] = [
        WeekDay(date: "2026-10-12", label: "Пн", deviation: 0.02),
        WeekDay(date: "2026-10-13", label: "Вт", deviation: -0.12),
        WeekDay(date: "2026-10-14", label: "Ср", deviation: 0.04),
        WeekDay(date: "2026-10-15", label: "Чт", deviation: nil),
        WeekDay(date: "2026-10-16", label: "Пт", deviation: 0.18),
        WeekDay(date: "2026-10-17", label: "Сб", deviation: -0.01),
        WeekDay(date: "2026-10-18", label: "Вс", deviation: nil, isToday: true),
    ]
}
