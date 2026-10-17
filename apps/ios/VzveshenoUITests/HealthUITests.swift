import XCTest

/// healthkit-client: экран «Подключение Здоровья» на подделке Здоровья
/// (сценарий `client`: `InMemoryHealthStore` считает системные запросы).
@MainActor
final class HealthUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func openHealth() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", "client", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Ещё"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Ещё"].tap()
        XCTAssertTrue(app.buttons["more.health"].waitForExistence(timeout: 5))
        app.buttons["more.health"].tap()
        XCTAssertTrue(app.staticTexts["Подключение Здоровья"].waitForExistence(timeout: 5))
        return app
    }

    private func authorizationRequests(_ app: XCUIApplication) -> String {
        let marker = app.staticTexts["uitest.health.authRequests"]
        XCTAssertTrue(marker.waitForExistence(timeout: 5), "нет счётчика запросов Здоровья")
        return marker.label
    }

    // Сценарий «Отказ от подключения»: «Не сейчас» не вызывает
    // requestAuthorization, и экран можно открыть снова.
    func testNotNowDoesNotRequestAuthorization() {
        let app = openHealth()
        XCTAssertTrue(app.buttons["health.continue"].exists)
        app.buttons["health.notNow"].tap()

        XCTAssertTrue(app.buttons["more.health"].waitForExistence(timeout: 5), "экран закрыт")
        XCTAssertEqual(authorizationRequests(app), "health.authRequests=0")

        app.buttons["more.health"].tap()
        XCTAssertTrue(app.staticTexts["Подключение Здоровья"].waitForExistence(timeout: 5), "экран открывается снова")
        XCTAssertTrue(app.buttons["health.continue"].exists)
    }

    // «Продолжить» — системный запрос (подделка) и состояние «подключено»;
    // «Отключить» возвращает экран подключения.
    func testContinueConnectsAndDisconnectReturnsExplainer() {
        let app = openHealth()
        app.buttons["health.continue"].tap()
        XCTAssertTrue(app.staticTexts["health.connected"].waitForExistence(timeout: 10))

        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertEqual(authorizationRequests(app), "health.authRequests=1")

        app.buttons["more.health"].tap()
        XCTAssertTrue(app.buttons["health.disconnect"].waitForExistence(timeout: 5))
        app.buttons["health.disconnect"].tap()
        XCTAssertTrue(app.buttons["health.continue"].waitForExistence(timeout: 5))
    }
}
