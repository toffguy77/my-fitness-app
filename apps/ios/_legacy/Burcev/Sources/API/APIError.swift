import Foundation

/// Ошибка обращения к API в том виде, в каком её показывать и обрабатывать.
///
/// Сервер отвечает ошибкой `{"status":"error","code":…,"message":…}`. Различать
/// случаи нужно по `code`, а не по тексту: текст — для человека и может
/// поменяться.
enum APIError: Error, Equatable, LocalizedError {
    /// Сессии нет или она истекла и не обновилась — нужен вход.
    case unauthorized
    /// Сервер отказал с кодом и, возможно, текстом для человека.
    case server(status: Int, code: String?, message: String?)
    /// Ответ пришёл, но не разобрался — расхождение контракта.
    case decoding(String)
    /// Сеть недоступна или запрос не дошёл.
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Нужно войти заново."
        case let .server(_, _, message?) where !message.isEmpty:
            return message
        case let .server(status, _, _):
            return status >= 500
                ? "Сервер временно недоступен. Попробуйте позже."
                : "Не получилось выполнить запрос."
        case .decoding:
            return "Приложение не поняло ответ сервера. Обновите приложение."
        case .transport:
            return "Нет связи с сервером. Проверьте интернет."
        }
    }
}
