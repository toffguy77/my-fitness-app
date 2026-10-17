@testable import API
import Foundation
import TestSupport
import XCTest

final class ErrorMessagesTests: XCTestCase {
    private static let catalogPath = "apps/ios/VzveshenoKit/Sources/API/Localizable.xcstrings"

    private func catalog() throws -> StringCatalog {
        try StringCatalog(relativePath: Self.catalogPath)
    }

    /// Тексты из JSON каталога — на Linux каталог не компилируется.
    private func messages() throws -> ErrorMessages {
        let catalog = try catalog()
        return ErrorMessages { catalog.value($0) }
    }

    /// Коды ошибок, которые может вернуть сервер: все `Code… = "…"` из codes.go.
    static func serverCodes() throws -> [String] {
        let source = try RepositoryFiles.read("apps/api/internal/shared/apperrors/codes.go")
        let regex = try NSRegularExpression(pattern: #"\bCode[A-Za-z]+\s*=\s*"([a-z_]+)""#)
        let range = NSRange(source.startIndex..., in: source)
        return regex.matches(in: source, range: range).compactMap {
            Range($0.range(at: 1), in: source).map { String(source[$0]) }
        }
    }

    // ios-api-client: Тест полноты каталога.
    func testEveryServerCodeHasText() throws {
        let codes = try Self.serverCodes()
        XCTAssertGreaterThan(codes.count, 30, "codes.go не разобрался — проверка пустая")
        let catalog = try catalog()
        let missing = codes.filter { catalog.value("error.\($0)")?.isEmpty ?? true }
        XCTAssertEqual(missing, [], "нет текста в \(Self.catalogPath)")
    }

    func testServerMessageIsNeverShown() throws {
        let error = APIError.server(status: 429, code: "too_many_attempts", params: [:])
        let text = try messages().message(for: error)
        XCTAssertEqual(text, "Слишком много попыток. Попробуйте позже.")
        XCTAssertFalse(text.contains("текст сервера"))
    }

    func testParamsAreSubstituted() {
        let messages = ErrorMessages { key in key == "error.rate_limited" ? "Подождите {seconds} с" : nil }
        let error = APIError.server(status: 429, code: "rate_limited", params: ["seconds": .number(30)])
        XCTAssertEqual(messages.message(for: error), "Подождите 30 с")
    }

    func testUnknownCodeFallsBackByStatus() throws {
        let messages = try messages()
        XCTAssertEqual(messages.message(for: APIError.server(status: 503, code: "brand_new", params: [:])),
                       "Сервис временно недоступен")
        XCTAssertEqual(messages.message(for: APIError.server(status: 500, code: nil, params: [:])),
                       "Сервис временно недоступен")
        XCTAssertEqual(messages.message(for: APIError.network), "Проверьте подключение к интернету")
        XCTAssertEqual(messages.message(for: APIError.server(status: 418, code: "brand_new", params: [:])),
                       "Не получилось выполнить запрос. Попробуйте ещё раз.")
    }

    // ios-api-client: «Сессия завершена, войдите снова».
    func testSessionEndedText() throws {
        XCTAssertEqual(try messages().message(for: APIError.sessionEnded), "Сессия завершена, войдите снова")
    }

    #if canImport(Darwin)
    /// На симуляторе — тот же текст из скомпилированного каталога модуля.
    func testCompiledCatalogIsBundled() {
        let error = APIError.server(status: 429, code: "too_many_attempts", params: [:])
        XCTAssertEqual(ErrorMessages().message(for: error), "Слишком много попыток. Попробуйте позже.")
    }
    #endif
}
