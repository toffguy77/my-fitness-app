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
public enum AppTab: String, CaseIterable, Sendable, Hashable {
    // Клиент.
    case today, diary, menu, articles
    // Куратор.
    case clients, chats
    // Куратор и суперадмин.
    case leads, support

    /// Подпись вкладки — ключ каталога строк приложения.
    public var titleKey: String { "tab.\(rawValue)" }
}

/// Оболочка, выбранная по роли (`ios-role-shell`).
public enum Shell: Equatable, Sendable {
    /// Клиент: «Сегодня», «Дневник», «Меню», «Статьи»; переписка с
    /// куратором, уведомления и профиль — кнопки шапки «Сегодня», а не вкладки.
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

    public var tabs: [AppTab] {
        switch self {
        case .client: return [.today, .diary, .menu, .articles]
        case .curator: return [.clients, .chats, .leads, .support]
        case .admin: return [.leads, .support]
        case .webOnly: return []
        }
    }

    /// Корневая вкладка роли.
    public var rootTab: AppTab? { tabs.first }
}

/// Что показывать вместо оболочки, пока она не выбрана.
public enum LaunchState: Equatable, Sendable {
    /// Профиля ещё нет ни с сервера, ни из кэша: экран загрузки, без таббара.
    case loading
    case signedOut
    /// Версия ниже минимальной: блокирующий экран «Обновите приложение».
    case updateRequired
    /// Вход успешен, но удаление аккаунта запрошено: «Аккаунт будет удалён».
    case pendingDeletion
    /// Почта не подтверждена: экран кода из письма.
    case verifyEmail
    /// Клиент ещё не прошёл онбординг.
    case onboarding
    case shell(Shell, offline: Bool)

    /// Решение по входным данным запуска и маршрут после входа
    /// (`ios-auth-flows`): удаление → подтверждение почты → онбординг
    /// клиента → оболочка роли. `nil` у признаков — неизвестно (старая
    /// сессия), такой человек не задерживается.
    public static func resolve(isSignedIn: Bool, serverRole: Role?, cachedRole: Role?,
                               serverUnreachable: Bool, updateRequired: Bool,
                               pendingDeletion: Bool = false, emailVerified: Bool? = nil,
                               onboardingCompleted: Bool? = nil) -> LaunchState {
        if updateRequired { return .updateRequired }
        guard isSignedIn else { return .signedOut }
        if pendingDeletion { return .pendingDeletion }
        if emailVerified == false { return .verifyEmail }
        let role = serverRole ?? cachedRole
        if role == .client, onboardingCompleted == false { return .onboarding }
        if let serverRole { return .shell(Shell(role: serverRole), offline: false) }
        if let cachedRole { return .shell(Shell(role: cachedRole), offline: serverUnreachable) }
        return .loading
    }
}
