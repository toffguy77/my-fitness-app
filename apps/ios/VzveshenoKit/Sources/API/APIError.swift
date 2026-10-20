import Foundation

/// Ошибка обращения к API в том виде, в каком её обрабатывать.
///
/// Различать случаи — по `code`, а не по тексту сервера: текст сервера
/// пользователю не показывается вовсе.
public enum APIError: Error, Sendable, Equatable {
    /// Сервер ответил ошибкой: HTTP-статус, машинный код и параметры текста.
    case server(status: Int, code: String?, params: [String: ParamValue])
    /// Запрос не дошёл или ответ не получен.
    case network
    /// Ответ пришёл, но не совпал с моделью — расхождение контракта.
    case decoding(String)
    /// Сессия закончена сервером (`session_ended`) или её нет — нужен вход.
    case sessionEnded

    public var status: Int? {
        if case let .server(status, _, _) = self { return status }
        return nil
    }

    public var code: String? {
        if case let .server(_, code, _) = self { return code }
        return nil
    }
}

/// Тексты ошибок по коду из каталога строк модуля API.
///
/// Ключ текста — `error.<code>`; `{name}` в тексте заменяется параметром
/// `name` из ответа. Для неизвестного кода — общий текст по HTTP-статусу.
public struct ErrorMessages: Sendable {
    /// Ищет перевод по ключу; `nil`, если ключа нет.
    public typealias Lookup = @Sendable (String) -> String?

    private let lookup: Lookup

    public init(lookup: @escaping Lookup = ErrorMessages.bundleLookup) {
        self.lookup = lookup
    }

    public func message(for error: Error) -> String {
        guard let error = error as? APIError else {
            return text("error.generic")
        }
        switch error {
        case .network:
            return text("error.network")
        case .sessionEnded:
            return text("error.session_ended_sign_in")
        case .decoding:
            return text("error.decoding")
        case let .server(status, code, params):
            if let code, let template = lookup("error.\(code)") {
                return Self.substitute(template, params: params)
            }
            if status >= 500 { return text("error.server") }
            return text("error.generic")
        }
    }

    private func text(_ key: String) -> String {
        lookup(key) ?? key
    }

    static func substitute(_ template: String, params: [String: ParamValue]) -> String {
        params.reduce(template) { result, param in
            result.replacingOccurrences(of: "{\(param.key)}", with: param.value.description)
        }
    }

    /// Каталог `Localizable.xcstrings` модуля. На Linux его некому
    /// скомпилировать — там тесты подставляют свой `Lookup` из JSON каталога.
    public static let bundleLookup: Lookup = { key in
        let value = Bundle.module.localizedString(forKey: key, value: missingMarker, table: nil)
        return value == missingMarker ? nil : value
    }

    private static let missingMarker = "\u{1}missing"
}
