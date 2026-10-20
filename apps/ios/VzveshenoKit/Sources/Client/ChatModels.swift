import Foundation

/// `GET /conversations/access`: доступ к куратору, купленный на сайте.
public struct CuratorChatAccess: Decodable, Sendable, Equatable {
    public var allowed: Bool
    public var expired: Bool
    /// Последний день доступа, `yyyy-MM-dd` (по Москве); нет — бессрочно или доступа не было.
    public var expiresAt: String?
    /// Последняя переписка — читается и без доступа.
    public var conversationID: String?

    public init(allowed: Bool, expired: Bool = false, expiresAt: String? = nil, conversationID: String? = nil) {
        self.allowed = allowed
        self.expired = expired
        self.expiresAt = expiresAt
        self.conversationID = conversationID
    }

    enum CodingKeys: String, CodingKey {
        case allowed, expired
        case expiresAt = "expires_at"
        case conversationID = "conversation_id"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        allowed = try container.decodeIfPresent(Bool.self, forKey: .allowed) ?? false
        expired = try container.decodeIfPresent(Bool.self, forKey: .expired) ?? false
        expiresAt = try container.decodeIfPresent(String.self, forKey: .expiresAt)
        conversationID = try container.decodeIfPresent(String.self, forKey: .conversationID)
    }
}

/// Элемент `GET /conversations`.
public struct Conversation: Decodable, Sendable, Equatable, Identifiable {
    public struct Participant: Decodable, Sendable, Equatable {
        public var id: Int64
        public var name: String
        public var avatarURL: String?

        public init(id: Int64, name: String, avatarURL: String? = nil) {
            self.id = id
            self.name = name
            self.avatarURL = avatarURL
        }

        enum CodingKeys: String, CodingKey {
            case id, name
            case avatarURL = "avatar_url"
        }
    }

    public var id: String
    public var unreadCount: Int
    public var participant: Participant?

    public init(id: String, unreadCount: Int = 0, participant: Participant? = nil) {
        self.id = id
        self.unreadCount = unreadCount
        self.participant = participant
    }

    enum CodingKeys: String, CodingKey {
        case id, participant
        case unreadCount = "unread_count"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
        participant = try container.decodeIfPresent(Participant.self, forKey: .participant)
    }
}

/// Вложение сообщения.
public struct ChatAttachment: Decodable, Sendable, Equatable {
    public var id: String
    public var fileURL: String
    public var fileName: String
    public var fileSize: Int
    public var mimeType: String

    public init(id: String, fileURL: String, fileName: String, fileSize: Int, mimeType: String) {
        self.id = id
        self.fileURL = fileURL
        self.fileName = fileName
        self.fileSize = fileSize
        self.mimeType = mimeType
    }

    enum CodingKeys: String, CodingKey {
        case id
        case fileURL = "file_url"
        case fileName = "file_name"
        case fileSize = "file_size"
        case mimeType = "mime_type"
    }
}

/// Карточка «Записано в дневник» (`food_entry`), её создаёт куратор.
public struct FoodEntryCard: Decodable, Sendable, Equatable {
    public var foodName: String
    public var mealType: String
    public var weight: Double
    public var calories: Double
    public var protein: Double
    public var fat: Double
    public var carbs: Double

    public init(foodName: String, mealType: String, weight: Double, calories: Double, protein: Double, fat: Double, carbs: Double) {
        self.foodName = foodName
        self.mealType = mealType
        self.weight = weight
        self.calories = calories
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
    }

    enum CodingKeys: String, CodingKey {
        case weight, calories, protein, fat, carbs
        case foodName = "food_name"
        case mealType = "meal_type"
    }

    /// «Записано в дневник · обед».
    public var caption: String {
        let meal = MealType(rawValue: mealType)?.title.lowercased() ?? mealType
        return "Записано в дневник · \(meal)"
    }

    /// «Куриная грудка, 150 г».
    public var title: String { "\(foodName), \(NumberText.grouped(NumberText.jsRound(weight))) г" }
}

/// Сообщение переписки.
public struct ChatMessage: Decodable, Sendable, Equatable, Identifiable {
    public enum Kind: String, Sendable, Equatable {
        case text, image, file
        case foodEntry = "food_entry"
    }

    public var id: String
    public var conversationID: String
    public var senderID: Int64
    public var kind: Kind
    public var content: String?
    public var foodEntry: FoodEntryCard?
    public var attachments: [ChatAttachment]
    public var createdAt: Date

    public init(id: String, conversationID: String = "c1", senderID: Int64, kind: Kind = .text, content: String?,
                foodEntry: FoodEntryCard? = nil, attachments: [ChatAttachment] = [], createdAt: Date) {
        self.id = id
        self.conversationID = conversationID
        self.senderID = senderID
        self.kind = kind
        self.content = content
        self.foodEntry = foodEntry
        self.attachments = attachments
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case id, content, metadata, attachments
        case conversationID = "conversation_id"
        case senderID = "sender_id"
        case kind = "type"
        case createdAt = "created_at"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        conversationID = try container.decodeIfPresent(String.self, forKey: .conversationID) ?? ""
        senderID = try container.decodeIfPresent(Int64.self, forKey: .senderID) ?? 0
        kind = Kind(rawValue: try container.decodeIfPresent(String.self, forKey: .kind) ?? "text") ?? .text
        content = try container.decodeIfPresent(String.self, forKey: .content)
        foodEntry = kind == .foodEntry ? try? container.decodeIfPresent(FoodEntryCard.self, forKey: .metadata) : nil
        attachments = try container.decodeIfPresent([ChatAttachment].self, forKey: .attachments) ?? []
        let raw = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        createdAt = ServerDate.parse(raw) ?? Date(timeIntervalSince1970: 0)
    }

    /// Адрес вложения — только проверенный (`TrustedMedia`). Веб загружает
    /// файл, затем шлёт его адрес текстом сообщения (сервер вложение к
    /// сообщению не привязывает), поэтому текст — второй источник, но тоже
    /// только после проверки: чужой адрес не загружается вовсе.
    public var fileURL: URL? {
        if let attachment = attachments.first { return TrustedMedia.url(attachment.fileURL) }
        guard kind == .image || kind == .file else { return nil }
        return content.flatMap(TrustedMedia.url)
    }

    /// Имя файла для пузыря «Файл».
    public var fileName: String {
        AccountFiles.safeName(attachments.first?.fileName ?? fileURL?.lastPathComponent ?? "") ?? "Файл"
    }
}

/// Время сервера в RFC 3339 — с долями секунды и без.
public enum ServerDate {
    public static func parse(_ raw: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw)
    }
}

/// Строка ленты переписки: разделитель дня или сообщение.
public enum ChatTimelineItem: Equatable, Sendable, Identifiable {
    case day(key: String, title: String)
    case message(ChatMessage)

    public var id: String {
        switch self {
        case let .day(key, _): return "day-\(key)"
        case let .message(message): return message.id
        }
    }
}

public enum ChatTimeline {
    /// Сообщения по порядку с разделителями «Сегодня», «Вчера», «17 октября».
    public static func items(_ messages: [ChatMessage], calendar: DayCalendar, now: Date) -> [ChatTimelineItem] {
        let today = calendar.key(now)
        let yesterday = calendar.adding(days: -1, to: today)
        var result: [ChatTimelineItem] = []
        var lastDay: String?
        for message in messages {
            let day = calendar.key(message.createdAt)
            if day != lastDay {
                let title = day == today ? "Сегодня" : day == yesterday ? "Вчера" : DayText.dayMonth(day)
                result.append(.day(key: day, title: title))
                lastDay = day
            }
            result.append(.message(message))
        }
        return result
    }

    /// «08:15» в поясе профиля.
    public static func time(_ date: Date, calendar: DayCalendar) -> String {
        let parts = calendar.calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }
}

/// Вложение, выбранное человеком: камера, Фото или Файлы.
public struct AttachmentDraft: Sendable, Equatable {
    /// Сервер принимает до 10 МБ.
    public static let maxBytes = 10 * 1024 * 1024
    public static let tooLargeMessage = "Файл больше 10 МБ"

    public var data: Data
    public var fileName: String
    public var mimeType: String

    public init(data: Data, fileName: String, mimeType: String) {
        self.data = data
        self.fileName = fileName
        self.mimeType = mimeType
    }

    public var isImage: Bool { mimeType.hasPrefix("image/") }

    /// Проверка до отправки: больше лимита — текст отказа.
    public var rejection: String? {
        data.count > Self.maxBytes ? Self.tooLargeMessage : nil
    }
}

/// Сообщение, ждущее отправки через очередь.
public struct PendingChatMessage: Equatable, Sendable, Identifiable {
    public enum Status: Equatable, Sendable {
        /// Нет сети — «ждёт отправки».
        case waiting
        /// Сервер отказал окончательно.
        case failed(String)
    }

    public let id: UUID
    public var text: String
    public var status: Status
    public var createdAt: Date

    public init(id: UUID, text: String, status: Status = .waiting, createdAt: Date) {
        self.id = id
        self.text = text
        self.status = status
        self.createdAt = createdAt
    }
}
