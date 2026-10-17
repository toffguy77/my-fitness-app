import Foundation

/// Удаление аккаунта запрошено: `pending_deletion` из ответа входа.
public struct PendingDeletion: Codable, Sendable, Equatable {
    public let requestedAt: String?
    public let scheduledFor: String

    public init(requestedAt: String? = nil, scheduledFor: String) {
        self.requestedAt = requestedAt
        self.scheduledFor = scheduledFor
    }

    enum CodingKeys: String, CodingKey {
        case requestedAt = "requested_at"
        case scheduledFor = "scheduled_for"
    }

    /// «Аккаунт будет удалён 17 ноября».
    public var title: String {
        let months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября",
                      "ноября", "декабря"]
        let parts = scheduledFor.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return "Аккаунт будет удалён" }
        return "Аккаунт будет удалён \(parts[2]) \(months[parts[1] - 1])"
    }
}

/// Политика пароля сервера: 8–128 символов, заглавная, строчная, цифра,
/// спецсимвол (`ios-auth-flows`, «Сброс пароля»).
public enum PasswordRule: String, CaseIterable, Sendable {
    case length, uppercase, lowercase, digit, special

    public var title: String {
        switch self {
        case .length: return "от 8 до 128 символов"
        case .uppercase: return "заглавная буква"
        case .lowercase: return "строчная буква"
        case .digit: return "цифра"
        case .special: return "спецсимвол"
        }
    }

    public func isSatisfied(by password: String) -> Bool {
        switch self {
        case .length: return (8...128).contains(password.count)
        case .uppercase: return password.contains { $0.isUppercase }
        case .lowercase: return password.contains { $0.isLowercase }
        case .digit: return password.contains { $0.isNumber }
        case .special: return password.contains { !$0.isLetter && !$0.isNumber && !$0.isWhitespace }
        }
    }
}

public enum PasswordPolicy {
    /// Неподходящие пункты политики.
    public static func unmet(_ password: String) -> [PasswordRule] {
        PasswordRule.allCases.filter { !$0.isSatisfied(by: password) }
    }

    public static func isValid(_ password: String) -> Bool { unmet(password).isEmpty }
}

/// Код подтверждения почты: 6 цифр одним полем; проверка — сразу после
/// шестой цифры, без кнопки.
public enum VerificationCode {
    public static let length = 6

    /// Из вставленного текста остаются цифры, не больше шести.
    public static func sanitize(_ text: String) -> String {
        String(text.filter { $0.isASCII && $0.isNumber }.prefix(length))
    }

    public static func isComplete(_ code: String) -> Bool { code.count == length }
}

/// «Отправить повторно» доступна через 60 секунд после отправки.
public struct ResendCountdown: Sendable, Equatable {
    public static let interval: TimeInterval = 60

    public let sentAt: Date

    public init(sentAt: Date) { self.sentAt = sentAt }

    /// Целые секунды до разрешения, 0 — можно.
    public func remaining(now: Date) -> Int {
        max(0, Int((Self.interval - now.timeIntervalSince(sentAt)).rounded(.up)))
    }

    public func canResend(now: Date) -> Bool { remaining(now: now) == 0 }

    /// «Отправить повторно через 0:30» / «Отправить повторно».
    public func title(now: Date) -> String {
        let left = remaining(now: now)
        guard left > 0 else { return "Отправить повторно" }
        return String(format: "Отправить повторно через %d:%02d", left / 60, left % 60)
    }
}
