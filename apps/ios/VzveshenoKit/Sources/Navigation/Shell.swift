import Foundation

/// Роль из `GET /auth/me`. Неизвестная роль — не клиент: она получает
/// экран «доступно в веб-версии», а не чужой интерфейс.
public enum Role: Equatable, Sendable, Codable {
    case client
    case coordinator
    case superAdmin
    case other(String)

    public init(_ raw: String) {
        switch raw {
        case "client": self = .client
        case "coordinator": self = .coordinator
        case "super_admin": self = .superAdmin
        default: self = .other(raw)
        }
    }

    public var rawValue: String {
        switch self {
        case .client: return "client"
        case .coordinator: return "coordinator"
        case .superAdmin: return "super_admin"
        case let .other(raw): return raw
        }
    }

    public init(from decoder: Decoder) throws {
        self.init(try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// Вкладка таббара.
public enum Tab: String, CaseIterable, Sendable, Hashable {
    // Клиент.
    case today, diary, menu, more
    // Куратор.
    case clients, chats
    // Куратор и суперадмин.
    case leads, support

    /// Подпись вкладки — ключ каталога строк приложения.
    public var titleKey: String { "tab.\(rawValue)" }
}

/// Оболочка, выбранная по роли (`ios-role-shell`).
public enum Shell: Equatable, Sendable {
    /// Клиент: «Сегодня», «Дневник», «Меню», «Ещё»; переписка с куратором —
    /// значок в шапке рядом с профилем, а не вкладка.
    case client
    /// Куратор: «Клиенты», «Чаты», «Заявки», «Обращения».
    case curator
    /// Суперадмин: «Заявки», «Обращения»; остальное — в вебе.
    case admin
    /// Роль, которой приложение не знает: «Этот раздел доступен в веб-версии».
    case webOnly

    public init(role: Role) {
        switch role {
        case .client: self = .client
        case .coordinator: self = .curator
        case .superAdmin: self = .admin
        case .other: self = .webOnly
        }
    }

    public var tabs: [Tab] {
        switch self {
        case .client: return [.today, .diary, .menu, .more]
        case .curator: return [.clients, .chats, .leads, .support]
        case .admin: return [.leads, .support]
        case .webOnly: return []
        }
    }

    /// Корневая вкладка роли.
    public var rootTab: Tab? { tabs.first }
}

/// Что показывать вместо оболочки, пока она не выбрана.
public enum LaunchState: Equatable, Sendable {
    /// Профиля ещё нет ни с сервера, ни из кэша: экран загрузки, без таббара.
    case loading
    case signedOut
    /// Версия ниже минимальной: блокирующий экран «Обновите приложение».
    case updateRequired
    case shell(Shell, offline: Bool)

    /// Решение по входным данным запуска.
    public static func resolve(isSignedIn: Bool, serverRole: Role?, cachedRole: Role?,
                               serverUnreachable: Bool, updateRequired: Bool) -> LaunchState {
        if updateRequired { return .updateRequired }
        guard isSignedIn else { return .signedOut }
        if let serverRole { return .shell(Shell(role: serverRole), offline: false) }
        if let cachedRole { return .shell(Shell(role: cachedRole), offline: serverUnreachable) }
        return .loading
    }
}
