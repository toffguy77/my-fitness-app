import Foundation

/// Вкладка карточки клиента (`ios-curator-client-card`). Ссылка и пуш
/// передают её в `tab=overview|plan|tasks|reports`; незнакомое и пустое —
/// «Обзор».
public enum ClientCardTab: String, CaseIterable, Sendable, Hashable, Identifiable {
    case overview, plan, tasks, reports

    public var id: String { rawValue }

    public init(link: String?) {
        self = link.flatMap { ClientCardTab(rawValue: $0.lowercased()) } ?? .overview
    }

    public var title: String {
        switch self {
        case .overview: return "Обзор"
        case .plan: return "План"
        case .tasks: return "Задачи"
        case .reports: return "Отчёты"
        }
    }
}
