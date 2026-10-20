import Client
import DesignSystem
import Foundation

/// Переписка в списке куратора (`GET /conversations`, `GET /conversations/by-participant/:userId`).
public struct CuratorConversation: Decodable, Sendable, Equatable, Identifiable {
    public struct LastMessage: Decodable, Sendable, Equatable {
        public var type: String
        public var content: String?
        public var createdAt: Date

        public init(type: String, content: String?, createdAt: Date) {
            self.type = type
            self.content = content
            self.createdAt = createdAt
        }

        enum CodingKeys: String, CodingKey {
            case type, content
            case createdAt = "created_at"
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            type = try container.decodeIfPresent(String.self, forKey: .type) ?? "text"
            content = try container.decodeIfPresent(String.self, forKey: .content)
            createdAt = ServerDate.parse(try container.decodeIfPresent(String.self, forKey: .createdAt) ?? "")
                ?? Date(timeIntervalSince1970: 0)
        }
    }

    public var id: String
    public var clientID: Int64
    public var curatorID: Int64
    public var unreadCount: Int
    public var participantName: String
    public var lastMessage: LastMessage?

    public init(id: String, clientID: Int64, curatorID: Int64 = 0, unreadCount: Int = 0, participantName: String,
                lastMessage: LastMessage? = nil) {
        self.id = id
        self.clientID = clientID
        self.curatorID = curatorID
        self.unreadCount = unreadCount
        self.participantName = participantName
        self.lastMessage = lastMessage
    }

    enum CodingKeys: String, CodingKey {
        case id, participant
        case clientID = "client_id"
        case curatorID = "curator_id"
        case unreadCount = "unread_count"
        case lastMessage = "last_message"
    }

    struct Participant: Decodable { let name: String? }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        clientID = try container.decodeIfPresent(Int64.self, forKey: .clientID) ?? 0
        curatorID = try container.decodeIfPresent(Int64.self, forKey: .curatorID) ?? 0
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
        participantName = (try container.decodeIfPresent(Participant.self, forKey: .participant))?.name ?? ""
        lastMessage = try container.decodeIfPresent(LastMessage.self, forKey: .lastMessage)
    }

    public var displayName: String { participantName.isEmpty ? "Без имени" : participantName }

    public var preview: String { CuratorText.preview(type: lastMessage?.type, content: lastMessage?.content) }
}

public enum ConversationOrder {
    /// Порядок «Чатов», как в вебе: с непрочитанным — первыми, затем по
    /// времени последнего сообщения, переписки без сообщений — в конце по имени.
    public static func sorted(_ list: [CuratorConversation]) -> [CuratorConversation] {
        list.sorted { lhs, rhs in
            let lUnread = lhs.unreadCount > 0
            let rUnread = rhs.unreadCount > 0
            if lUnread != rUnread { return lUnread }
            switch (lhs.lastMessage, rhs.lastMessage) {
            case let (left?, right?):
                if left.createdAt != right.createdAt { return left.createdAt > right.createdAt }
            case (.some, .none): return true
            case (.none, .some): return false
            case (.none, .none): break
            }
            return lhs.displayName.localizedCompare(rhs.displayName) == .orderedAscending
        }
    }
}

// MARK: Заявки

/// Заявка в очереди (`GET /curator/leads`).
public struct Lead: Decodable, Sendable, Equatable, Identifiable {
    public struct Parameters: Decodable, Sendable, Equatable {
        public var heightCm: Double?
        public var weightKg: Double?
        public var goal: String?

        public init(heightCm: Double? = nil, weightKg: Double? = nil, goal: String? = nil) {
            self.heightCm = heightCm
            self.weightKg = weightKg
            self.goal = goal
        }

        enum CodingKeys: String, CodingKey {
            case goal
            case heightCm = "height_cm"
            case weightKg = "weight_kg"
        }
    }

    public struct Attribution: Decodable, Sendable, Equatable {
        public var utmSource: String?
        public var utmMedium: String?
        public var utmCampaign: String?
        public var referrer: String?

        public init(utmSource: String? = nil, utmMedium: String? = nil, utmCampaign: String? = nil, referrer: String? = nil) {
            self.utmSource = utmSource
            self.utmMedium = utmMedium
            self.utmCampaign = utmCampaign
            self.referrer = referrer
        }

        enum CodingKeys: String, CodingKey {
            case referrer
            case utmSource = "utm_source"
            case utmMedium = "utm_medium"
            case utmCampaign = "utm_campaign"
        }
    }

    public var id: String
    public var email: String
    public var name: String?
    public var parameters: Parameters
    public var calories: Double?
    public var lastStep: String
    public var attribution: Attribution
    public var handled: Bool
    public var ageDays: Int
    public var reminderSent: Bool
    public var contactAllowed: Bool
    public var conversationID: String?

    public init(id: String, email: String, name: String? = nil, parameters: Parameters = Parameters(), calories: Double? = nil,
                lastStep: String = "contact", attribution: Attribution = Attribution(), handled: Bool = false, ageDays: Int = 0,
                reminderSent: Bool = false, contactAllowed: Bool = true, conversationID: String? = nil) {
        self.id = id
        self.email = email
        self.name = name
        self.parameters = parameters
        self.calories = calories
        self.lastStep = lastStep
        self.attribution = attribution
        self.handled = handled
        self.ageDays = ageDays
        self.reminderSent = reminderSent
        self.contactAllowed = contactAllowed
        self.conversationID = conversationID
    }

    enum CodingKeys: String, CodingKey {
        case id, email, name, parameters, result, attribution
        case lastStep = "last_step"
        case handledAt = "handled_at"
        case ageDays = "age_days"
        case reminderSent = "reminder_sent"
        case contactAllowed = "contact_allowed"
        case conversationID = "conversation_id"
    }

    struct Result: Decodable { let calories: Double? }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        email = try container.decodeIfPresent(String.self, forKey: .email) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name)
        parameters = try container.decodeIfPresent(Parameters.self, forKey: .parameters) ?? Parameters()
        calories = (try container.decodeIfPresent(Result.self, forKey: .result))?.calories
        lastStep = try container.decodeIfPresent(String.self, forKey: .lastStep) ?? "contact"
        attribution = try container.decodeIfPresent(Attribution.self, forKey: .attribution) ?? Attribution()
        handled = (try container.decodeIfPresent(String.self, forKey: .handledAt)) != nil
        ageDays = try container.decodeIfPresent(Int.self, forKey: .ageDays) ?? 0
        reminderSent = try container.decodeIfPresent(Bool.self, forKey: .reminderSent) ?? false
        // Без признака согласия — писать нельзя: молчание не согласие.
        contactAllowed = try container.decodeIfPresent(Bool.self, forKey: .contactAllowed) ?? false
        conversationID = try container.decodeIfPresent(String.self, forKey: .conversationID)
    }

    public var title: String {
        let trimmed = name?.trimmingCharacters(in: .whitespaces) ?? ""
        return trimmed.isEmpty ? "Без имени" : trimmed
    }

    /// «остановился: увидел расчёт» — шаги, как в вебе.
    public var stepLine: String { "остановился: \(Self.stepTitle(lastStep))" }

    public static func stepTitle(_ step: String) -> String {
        switch step {
        case "goal": return "выбор цели"
        case "body": return "параметры"
        case "activity": return "активность"
        case "result": return "увидел расчёт"
        case "contact": return "оставил контакт"
        case "registration": return "форма регистрации"
        case "bot": return "писал боту"
        default: return step
        }
    }

    /// «Снижение · 168 см · 74 кг · 1 780 ккал» или «Параметры не заполнены».
    public var parametersLine: String {
        var parts: [String] = []
        switch parameters.goal {
        case "loss": parts.append("Снижение")
        case "maintain": parts.append("Удержание")
        case "gain": parts.append("Набор")
        default: break
        }
        if let height = parameters.heightCm { parts.append("\(NumberText.oneDecimal(height)) см") }
        if let weight = parameters.weightKg { parts.append("\(NumberText.oneDecimal(weight)) кг") }
        if let calories, calories > 0 { parts.append("\(NumberText.grouped(NumberText.jsRound(calories))) ккал") }
        return parts.isEmpty ? "Параметры не заполнены" : parts.joined(separator: " · ")
    }

    public var hasParameters: Bool { parametersLine != "Параметры не заполнены" }

    /// «ждёт 3 дня» или «сегодня».
    public var waitingLine: String { ageDays <= 0 ? "сегодня" : DS.Plural.format("plural.waiting_days %lld", ageDays) }

    /// utm через « · », иначе хост адреса перехода, иначе «Источник перехода неизвестен».
    public var sourceLine: String {
        let utm = [attribution.utmSource, attribution.utmMedium, attribution.utmCampaign]
            .compactMap { $0?.isEmpty == false ? $0 : nil }
        if !utm.isEmpty { return utm.joined(separator: " · ") }
        if let referrer = attribution.referrer, let host = URL(string: referrer)?.host, !host.isEmpty { return host }
        return "Источник перехода неизвестен"
    }
}

/// Страница `{items, total}`.
public struct Page<Item: Decodable & Sendable>: Decodable, Sendable {
    public var items: [Item]
    public var total: Int

    public init(items: [Item], total: Int) {
        self.items = items
        self.total = total
    }

    enum CodingKeys: String, CodingKey { case items, total }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        items = try container.decodeIfPresent([Item].self, forKey: .items) ?? []
        total = try container.decodeIfPresent(Int.self, forKey: .total) ?? items.count
    }
}

// MARK: Обращения

/// Обращение в поддержку (`GET /curator/support/conversations`).
public struct SupportConversation: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    /// `telegram` или `web`.
    public var channel: String
    /// `open`, `escalated`, `closed`.
    public var status: String
    public var username: String?
    public var name: String?
    public var escalationReason: String?
    public var escalatedAt: Date?
    public var lastMessageAt: Date?

    public init(id: String, channel: String = "telegram", status: String, username: String? = nil, name: String? = nil,
                escalationReason: String? = nil, escalatedAt: Date? = nil, lastMessageAt: Date? = nil) {
        self.id = id
        self.channel = channel
        self.status = status
        self.username = username
        self.name = name
        self.escalationReason = escalationReason
        self.escalatedAt = escalatedAt
        self.lastMessageAt = lastMessageAt
    }

    enum CodingKeys: String, CodingKey {
        case id, channel, status
        case username = "telegram_username"
        case name = "telegram_name"
        case escalationReason = "escalation_reason"
        case escalatedAt = "escalated_at"
        case lastMessageAt = "last_message_at"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        channel = try container.decodeIfPresent(String.self, forKey: .channel) ?? "telegram"
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "open"
        username = try container.decodeIfPresent(String.self, forKey: .username)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        escalationReason = try container.decodeIfPresent(String.self, forKey: .escalationReason)
        escalatedAt = (try container.decodeIfPresent(String.self, forKey: .escalatedAt)).flatMap(ServerDate.parse)
        lastMessageAt = (try container.decodeIfPresent(String.self, forKey: .lastMessageAt)).flatMap(ServerDate.parse)
    }

    /// `telegram_name`, иначе `@telegram_username`, иначе «Без имени».
    public var title: String {
        if let name, !name.isEmpty { return name }
        if let username, !username.isEmpty { return "@\(username)" }
        return "Без имени"
    }

    public var statusTitle: String {
        switch status {
        case "escalated": return "Ждёт ответа"
        case "closed": return "Закрыто"
        default: return "Отвечает бот"
        }
    }

    public var isWeb: Bool { channel == "web" }

    /// Подпись поля ответа по каналу.
    public var replyPlaceholder: String { isWeb ? "Ответ увидит посетитель сайта" : "Ответ уйдёт в Telegram" }

    /// «Telegram · ждёт ответа 12 мин».
    public func subtitle(now: Date) -> String {
        let channelTitle = isWeb ? "Сайт" : "Telegram"
        guard status == "escalated", let since = escalatedAt ?? lastMessageAt else {
            return "\(channelTitle) · \(statusTitle.lowercased())"
        }
        let minutes = max(0, Int(now.timeIntervalSince(since) / 60))
        let wait: String
        if minutes < 60 {
            wait = "\(minutes) мин"
        } else if minutes < 24 * 60 {
            wait = "\(minutes / 60) ч"
        } else {
            wait = CuratorText.days(minutes / (24 * 60))
        }
        return "\(channelTitle) · ждёт ответа \(wait)"
    }
}

/// Сообщение обращения.
public struct SupportMessage: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    /// `user`, `bot`, `operator`.
    public var author: String
    public var text: String
    public var createdAt: Date
    /// Только у ответов в Telegram: `false` — Telegram не принял.
    public var delivered: Bool?

    public init(id: String, author: String, text: String, createdAt: Date, delivered: Bool? = nil) {
        self.id = id
        self.author = author
        self.text = text
        self.createdAt = createdAt
        self.delivered = delivered
    }

    enum CodingKeys: String, CodingKey {
        case id, author, text, delivered
        case createdAt = "created_at"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        author = try container.decodeIfPresent(String.self, forKey: .author) ?? "user"
        text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        createdAt = ServerDate.parse(try container.decodeIfPresent(String.self, forKey: .createdAt) ?? "") ?? Date(timeIntervalSince1970: 0)
        delivered = try container.decodeIfPresent(Bool.self, forKey: .delivered)
    }

    public var authorTitle: String {
        switch author {
        case "operator": return "Оператор"
        case "bot": return "Бот"
        default: return "Пользователь"
        }
    }

    public var isOutgoing: Bool { author == "operator" }
    public var undelivered: Bool { isOutgoing && delivered == false }
}

/// `GET /curator/support/conversations/:id`.
public struct SupportThread: Decodable, Sendable, Equatable {
    public struct LinkedLead: Decodable, Sendable, Equatable {
        public var id: String
        public var email: String
        public var lastStep: String?
        public var summary: String?

        public init(id: String, email: String, lastStep: String? = nil, summary: String? = nil) {
            self.id = id
            self.email = email
            self.lastStep = lastStep
            self.summary = summary
        }

        enum CodingKeys: String, CodingKey {
            case id, email, summary
            case lastStep = "last_step"
        }

        /// «n***@mail.ru · остановилась: оставила контакт · цель: loss».
        public var line: String {
            var parts = [email]
            if let lastStep, !lastStep.isEmpty { parts.append("остановился: \(Lead.stepTitle(lastStep))") }
            if let summary, !summary.isEmpty { parts.append(summary) }
            return parts.joined(separator: " · ")
        }
    }

    public var conversation: SupportConversation
    public var messages: [SupportMessage]
    public var lead: LinkedLead?

    public init(conversation: SupportConversation, messages: [SupportMessage], lead: LinkedLead? = nil) {
        self.conversation = conversation
        self.messages = messages
        self.lead = lead
    }

    enum CodingKeys: String, CodingKey { case conversation, messages, lead }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        conversation = try container.decode(SupportConversation.self, forKey: .conversation)
        messages = try container.decodeIfPresent([SupportMessage].self, forKey: .messages) ?? []
        lead = try? container.decodeIfPresent(LinkedLead.self, forKey: .lead)
    }
}
