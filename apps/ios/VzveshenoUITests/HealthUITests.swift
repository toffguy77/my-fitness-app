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
        // «Профиль → Здоровье»: аватар в шапке «Сегодня».
        XCTAssertTrue(app.buttons["header.profile"].waitForExistence(timeout: 10))
        app.buttons["header.profile"].tap()
        XCTAssertTrue(app.buttons["profile.health"].waitForExistence(timeout: 5))
        app.buttons["profile.health"].tap()
        XCTAssertTrue(app.staticTexts["health.connect.title"].waitForExistence(timeout: 5))
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

        XCTAssertTrue(app.buttons["profile.health"].waitForExistence(timeout: 5), "экран закрыт")
        XCTAssertEqual(authorizationRequests(app), "health.authRequests=0")

        app.buttons["profile.health"].tap()
        XCTAssertTrue(app.staticTexts["health.connect.title"].waitForExistence(timeout: 5), "экран открывается снова")
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

        app.buttons["profile.health"].tap()
        XCTAssertTrue(app.buttons["health.disconnect"].waitForExistence(timeout: 5))
        app.buttons["health.disconnect"].tap()
        XCTAssertTrue(app.buttons["health.continue"].waitForExistence(timeout: 5))
    }

    // «Продолжить» и «Не сейчас» видны и нажимаются без прокрутки при любом
    // размере текста: таббара на экране нет, панель «Записать еду» и таббар
    // их не закрывают, кнопки — внутри окна над нижним краем.
    func testActionsStayAboveTabBarAtAnyTextSize() {
        let sizes = [("стандартный", [String]()),
                     ("AX5", ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])]
        for (size, arguments) in sizes {
            // Экран открывается сразу (`-uiTestShot health`): на AX5 пункт
            // «Здоровье» в профиле пришлось бы искать прокруткой.
            let app = XCUIApplication()
            app.launchArguments = ["-uiTestScenario", "client", "-uiTestShot", "health", "-AppleLanguages", "(ru)",
                                   "-AppleLocale", "ru_RU"] + arguments
            app.launch()
            XCTAssertTrue(app.otherElements["screen.health"].waitForExistence(timeout: 10)
                          || app.buttons["health.continue"].waitForExistence(timeout: 5), "\(size): нет экрана Здоровья")
            let window = app.windows.firstMatch.frame
            for id in ["health.continue", "health.notNow"] {
                let button = app.buttons[id]
                XCTAssertTrue(button.waitForExistence(timeout: 5), "\(size): нет \(id)")
                XCTAssertTrue(button.isHittable, "\(size): \(id) не нажимается")
                XCTAssertTrue(window.contains(button.frame), "\(size): \(id) за краем окна: \(button.frame)")
                let tabBar = app.tabBars.firstMatch
                if tabBar.exists && tabBar.isHittable {
                    XCTAssertFalse(tabBar.frame.intersects(button.frame), "\(size): таббар закрывает \(id)")
                }
                let accessory = app.otherElements["accessory.foodLog"]
                if accessory.exists {
                    XCTAssertFalse(accessory.frame.intersects(button.frame), "\(size): «Записать еду» закрывает \(id)")
                }
            }
            let tabBar = app.tabBars.firstMatch
            XCTAssertFalse(tabBar.exists && tabBar.isHittable, "\(size): таббар на подключении Здоровья")
            app.terminate()
        }
    }
}
