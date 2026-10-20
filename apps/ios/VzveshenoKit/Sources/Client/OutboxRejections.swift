import API
import Foundation
import Outbox

/// Чьё изменение отвергнуто — кто откатывает оптимистичный результат и
/// показывает сообщение. Отказ приходит из любой досылки: своей у экрана,
/// фоновой, по появлению сети, из пуша и из расширения виджетов.
public enum OutboxRejectionOwner: Equatable, Sendable {
    /// Запись еды, правка, удаление, вода дневника, «Съел».
    case diary
    /// Вес, шаги, тренировка, задача, вода «Сегодня», виджеты и голос.
    case today
    case chat
    /// Здоровье и прочее без своего экрана — общее сообщение приложения.
    case app

    public init(kind: String) {
        switch kind.split(separator: ".").first.map(String.init) ?? "" {
        case "diary", "menu": self = .diary
        case "today", "surface": self = .today
        case "push": self = kind == "push.task" ? .today : .app
        case "chat": self = .chat
        default: self = .app
        }
    }

    /// Что сказать человеку: что не сохранилось и почему (текст по коду ошибки).
    public func message(for error: APIError, messages: ErrorMessages = ErrorMessages()) -> String {
        let what: String
        switch self {
        case .diary: what = "Запись дневника не сохранилась"
        case .today: what = "Изменение дня не сохранилось"
        case .chat: what = "Сообщение не отправлено"
        case .app: what = "Изменение не сохранилось"
        }
        return "\(what): \(messages.message(for: error))"
    }
}

extension TodayModel {
    /// Отказ из любой досылки: день перечитывается без отвергнутого изменения.
    public func outboxRejected(_ item: OutboxItem, error: APIError) async {
        notice = OutboxRejectionOwner.today.message(for: error)
        await load()
    }
}

extension DiaryModel {
    /// Отказ из любой досылки: строка «ждёт отправки» уходит, день перечитывается.
    public func outboxRejected(_ item: OutboxItem, error: APIError) async {
        forgetQueued(item.id)
        notice = OutboxRejectionOwner.diary.message(for: error)
        await load()
    }
}

extension ChatModel {
    /// Отказ из любой досылки: сообщение остаётся на экране как неотправленное.
    public func outboxRejected(_ item: OutboxItem, error: APIError) {
        markFailed(item.id)
        notice = OutboxRejectionOwner.chat.message(for: error)
    }
}
