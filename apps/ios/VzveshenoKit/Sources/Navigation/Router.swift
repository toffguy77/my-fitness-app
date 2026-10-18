import Foundation

/// Способ записи еды из ссылки `add=`.
public enum AddMethod: String, Sendable, Hashable, CaseIterable {
    case search, barcode, photo, manual
}

/// Экран внутри вкладки — элемент пути навигации.
public enum Destination: Hashable, Sendable {
    case article(slug: String)
    /// «Сегодня» с подсвеченной задачей.
    case task(id: String)
    /// «Дневник» на дате (`yyyy-MM-dd`) и, если задан, лист записи нужным способом.
    case diaryDay(date: String?, add: AddMethod?)
    /// Переписка клиента с куратором (значок в шапке).
    case curatorChat
    /// Профиль клиента (аватар в шапке «Сегодня»): профиль, настройки, «Здоровье».
    case profile
    /// «Профиль → Здоровье» (`healthkit-client`).
    case health
    case notifications
    case weeklyFeedback(reportID: String)
    case plan
    case export
    /// Куратор: карточка клиента на вкладке.
    case client(id: String, tab: String?)
    /// Куратор: переписка с клиентом.
    case conversation(id: String)
    case supportConversation(id: String)
    case lead(id: String)
}

/// Куда перейти: вкладка и путь внутри неё.
public struct NavigationTarget: Equatable, Sendable {
    public let tab: AppTab?
    public let path: [Destination]

    public init(tab: AppTab?, path: [Destination] = []) {
        self.tab = tab
        self.path = path
    }
}

/// Ссылка, которую приложение умеет открыть, ещё без привязки к роли.
public enum ScreenLink: Equatable, Sendable {
    case article(slug: String)
    case dashboard(task: String?)
    case foodTracker(date: String?, add: AddMethod?)
    case chat
    case notifications
    case weeklyFeedback(reportID: String)
    case plan
    case export
    case curatorHome
    case curatorClient(id: String, tab: String?)
    case curatorChats
    case curatorConversation(id: String)
    case curatorSupport(conversation: String?)
    case curatorLeads(lead: String?)
    /// Ссылка на наш сайт, которой приложение не знает: корень роли.
    case unknown
}

/// Ссылки, которые обрабатываются без сессии.
public enum AuthLink: Equatable, Sendable {
    case magicLink(token: String)
    case resetPassword(token: String)
    /// Возврат входа через Яндекс или VK: код обмена или причина отказа.
    case providerComplete(code: String?, error: String?)
}

public enum DeepLink: Equatable, Sendable {
    case auth(AuthLink)
    case screen(ScreenLink)
}

/// `target` пуша и уведомления: `{kind, ids}` (`notification-targets`).
public struct PushTarget: Decodable, Equatable, Sendable {
    public let kind: String
    public let ids: [String: String]

    public init(kind: String, ids: [String: String] = [:]) {
        self.kind = kind
        self.ids = ids
    }

    enum CodingKeys: String, CodingKey { case kind, ids }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(String.self, forKey: .kind)
        // Идентификаторы приходят числами и строками — храним строкой.
        let raw = try container.decodeIfPresent([String: LooseID].self, forKey: .ids) ?? [:]
        ids = raw.mapValues(\.value)
    }

    private struct LooseID: Decodable {
        let value: String
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let int = try? container.decode(Int64.self) {
                value = String(int)
            } else {
                value = try container.decode(String.self)
            }
        }
    }
}

/// Команда App Intent, открывающая экран.
public enum IntentRoute: Equatable, Sendable {
    case openToday
    case openDiary(add: AddMethod?)
    case openChat
}

/// Один маршрутизатор для universal link, `target` пуша и App Intent
/// (`ios-deep-links`).
public enum Router {
    /// Хосты, чьи ссылки открывает приложение (AASA обоих стендов).
    public static let hosts: Set<String> = ["burcev.team", "www.burcev.team", "new.burcev.team"]

    // MARK: Разбор

    public static func parse(_ url: URL) -> DeepLink? {
        if let host = url.host?.lowercased(), !hosts.contains(host) { return nil }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let query = Dictionary((components?.queryItems ?? []).compactMap { item in
            item.value.map { (item.name, $0) }
        }, uniquingKeysWith: { first, _ in first })
        let segments = url.path.split(separator: "/").map(String.init)
        return parse(segments: segments, query: query)
    }

    static func parse(segments: [String], query: [String: String]) -> DeepLink {
        switch segments {
        case ["auth", "link", "consume"]:
            if let token = query["token"], !token.isEmpty { return .auth(.magicLink(token: token)) }
            return .screen(.unknown)
        case ["reset-password"]:
            if let token = query["token"], !token.isEmpty { return .auth(.resetPassword(token: token)) }
            return .screen(.unknown)
        case ["auth", "native-complete"]:
            return .auth(.providerComplete(code: query["code"], error: query["error"]))
        case let path where path.count == 2 && path[0] == "content":
            return .screen(.article(slug: path[1]))
        case ["dashboard"]:
            return .screen(.dashboard(task: query["task"]))
        case ["food-tracker"]:
            return .screen(.foodTracker(date: validDate(query["date"]), add: query["add"].flatMap(AddMethod.init(rawValue:))))
        case ["chat"]:
            return .screen(.chat)
        case ["notifications"]:
            return .screen(.notifications)
        case ["curator"], ["curator", "clients"]:
            return .screen(.curatorHome)
        case let path where path.count == 3 && path[0] == "curator" && path[1] == "clients":
            return .screen(.curatorClient(id: path[2], tab: query["tab"]))
        case ["curator", "chat"]:
            return .screen(.curatorChats)
        case let path where path.count == 3 && path[0] == "curator" && path[1] == "chat":
            return .screen(.curatorConversation(id: path[2]))
        case ["curator", "support"]:
            return .screen(.curatorSupport(conversation: query["conversation"]))
        case ["curator", "leads"]:
            return .screen(.curatorLeads(lead: query["lead"]))
        default:
            return .screen(.unknown)
        }
    }

    /// Пуш с неизвестным `kind` открывает уведомления.
    public static func link(for target: PushTarget) -> ScreenLink {
        let ids = target.ids
        switch target.kind {
        case "chat":
            if let conversation = ids["conversation_id"] { return .curatorConversation(id: conversation) }
            return .chat
        case "task":
            return .dashboard(task: ids["task_id"])
        case "weekly_feedback":
            if let report = ids["report_id"] { return .weeklyFeedback(reportID: report) }
            return .notifications
        case "plan":
            return .plan
        case "client":
            if let client = ids["client_id"] { return .curatorClient(id: client, tab: ids["tab"]) }
            return .curatorHome
        case "support_conversation":
            return .curatorSupport(conversation: ids["conversation_id"])
        case "lead":
            return .curatorLeads(lead: ids["lead_id"])
        case "article":
            if let slug = ids["slug"] ?? ids["article_id"] { return .article(slug: slug) }
            return .notifications
        case "export":
            return .export
        default:
            return .notifications
        }
    }

    public static func link(for intent: IntentRoute) -> ScreenLink {
        switch intent {
        case .openToday: return .dashboard(task: nil)
        case let .openDiary(add): return .foodTracker(date: nil, add: add)
        case .openChat: return .chat
        }
    }

    // MARK: Привязка к роли

    /// Путь навигации текущей оболочки. Ссылка чужой роли — корень своей.
    public static func target(for link: ScreenLink, shell: Shell) -> NavigationTarget {
        let root = NavigationTarget(tab: shell.rootTab)
        switch shell {
        case .webOnly:
            return root
        case .client:
            return clientTarget(link) ?? root
        case .curator:
            return curatorTarget(link) ?? root
        case .admin:
            return adminTarget(link) ?? root
        }
    }

    private static func clientTarget(_ link: ScreenLink) -> NavigationTarget? {
        switch link {
        case let .article(slug): return NavigationTarget(tab: .articles, path: [.article(slug: slug)])
        case let .dashboard(task): return NavigationTarget(tab: .today, path: task.map { [.task(id: $0)] } ?? [])
        case let .foodTracker(date, add): return NavigationTarget(tab: .diary, path: [.diaryDay(date: date, add: add)])
        case .chat, .curatorConversation: return NavigationTarget(tab: .today, path: [.curatorChat])
        case .notifications: return NavigationTarget(tab: .today, path: [.notifications])
        case let .weeklyFeedback(report): return NavigationTarget(tab: .today, path: [.weeklyFeedback(reportID: report)])
        case .plan: return NavigationTarget(tab: .today, path: [.plan])
        case .export: return NavigationTarget(tab: .today, path: [.profile, .export])
        case .curatorHome, .curatorClient, .curatorChats, .curatorSupport, .curatorLeads, .unknown: return nil
        }
    }

    private static func curatorTarget(_ link: ScreenLink) -> NavigationTarget? {
        switch link {
        case .curatorHome: return NavigationTarget(tab: .clients)
        case let .curatorClient(id, tab): return NavigationTarget(tab: .clients, path: [.client(id: id, tab: tab)])
        case .curatorChats: return NavigationTarget(tab: .chats)
        case let .curatorConversation(id): return NavigationTarget(tab: .chats, path: [.conversation(id: id)])
        case let .curatorSupport(conversation):
            return NavigationTarget(tab: .support, path: conversation.map { [.supportConversation(id: $0)] } ?? [])
        case let .curatorLeads(lead): return NavigationTarget(tab: .leads, path: lead.map { [.lead(id: $0)] } ?? [])
        case .notifications: return NavigationTarget(tab: .clients, path: [.notifications])
        case let .article(slug): return NavigationTarget(tab: .clients, path: [.article(slug: slug)])
        case .export: return NavigationTarget(tab: .clients, path: [.export])
        case .dashboard, .foodTracker, .chat, .weeklyFeedback, .plan, .unknown: return nil
        }
    }

    private static func adminTarget(_ link: ScreenLink) -> NavigationTarget? {
        switch link {
        case let .curatorSupport(conversation):
            return NavigationTarget(tab: .support, path: conversation.map { [.supportConversation(id: $0)] } ?? [])
        case let .curatorLeads(lead): return NavigationTarget(tab: .leads, path: lead.map { [.lead(id: $0)] } ?? [])
        default: return nil
        }
    }

    private static func validDate(_ raw: String?) -> String? {
        guard let raw, raw.count == 10 else { return nil }
        let parts = raw.split(separator: "-")
        guard parts.count == 3, parts.allSatisfy({ Int($0) != nil }) else { return nil }
        return raw
    }
}

/// Ссылка, открытая без сессии: запоминается и открывается после входа.
public actor PendingLinkStore {
    private var pending: ScreenLink?

    public init() {}

    /// Ссылка без сессии. Вход по ссылке и сброс пароля сюда не попадают —
    /// они обрабатываются сразу.
    public func remember(_ link: ScreenLink) {
        pending = link
    }

    /// После успешного входа: отдаёт и забывает.
    public func take() -> ScreenLink? {
        defer { pending = nil }
        return pending
    }

    public func clear() { pending = nil }
}

/// Что делать со ссылкой входа (`ios-deep-links`).
///
/// Ссылка из письма при уже открытой сессии не заменяет её молча: иначе
/// чужая ссылка на свой аккаунт (login CSRF) уводила бы записи еды и
/// здоровья человека в чужой аккаунт.
public enum AuthLinkDecision: Equatable, Sendable {
    /// Обработать сразу.
    case handle
    /// Спросить: «Войти в другой аккаунт? Текущий сеанс завершится».
    case confirmSwitchingAccount

    public static func decide(_ link: AuthLink, hasSession: Bool) -> AuthLinkDecision {
        switch link {
        case .magicLink, .resetPassword:
            return hasSession ? .confirmSwitchingAccount : .handle
        case .providerComplete:
            // Возврат входа, начатого в этом приложении этим человеком
            // (код без verifier из памяти приложения ничего не даёт).
            return .handle
        }
    }
}
