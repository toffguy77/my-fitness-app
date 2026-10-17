import Foundation
import TestSupport
import XCTest

/// Тексты экрана «Подключение Здоровья» — в String Catalog приложения и
/// совпадают с тем, что обещают спека и руководство пользователя.
final class HealthStringsTests: XCTestCase {
    func testHealthStringsAreInTheCatalogue() throws {
        let catalog = try StringCatalog(relativePath: "apps/ios/Vzvesheno/Resources/Localizable.xcstrings")
        let keys = [
            "health.title", "health.connect.title", "health.connect.intro", "health.connect.reads.title",
            "health.connect.reads", "health.connect.writes.title", "health.connect.writes", "health.connect.manualWins",
            "health.connect.continue", "health.connect.notNow", "health.connect.failed", "health.unavailable",
            "health.connected.title", "health.connected.body", "health.disconnect", "health.disconnect.note",
            "health.hint.noData", "health.hint.openSettings",
        ]
        for key in keys {
            XCTAssertNotNil(catalog.value(key), "нет строки \(key)")
        }
        XCTAssertEqual(catalog.value("health.connect.title"), "Подключение Здоровья")
        XCTAssertEqual(catalog.value("health.connect.continue"), "Продолжить")
        XCTAssertEqual(catalog.value("health.connect.notNow"), "Не сейчас")
        XCTAssertEqual(catalog.value("health.hint.noData"), "Нет данных из Здоровья за 3 дня — проверьте доступ")
    }

    /// Руководство пользователя (из него отвечает бот поддержки) называет
    /// кнопки так же, как экран.
    func testUserGuideNamesTheSameButtons() throws {
        let guide = try RepositoryFiles.read("docs/user-guide/07-настройка-профиля.md")
        XCTAssertTrue(guide.contains("«Продолжить»"))
        XCTAssertTrue(guide.contains("«Не сейчас»"))
    }
}
