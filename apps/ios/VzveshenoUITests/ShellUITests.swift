import XCTest

@MainActor
final class ShellUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ scenario: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", scenario, "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        return app
    }

    private func tabTitles(_ app: XCUIApplication) -> [String] {
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10), "нет таббара")
        return app.tabBars.firstMatch.buttons.allElementsBoundByIndex.map(\.label)
    }

    // ios-role-shell: четыре роли на заглушках /auth/me.
    func testClientShell() {
        let app = launch("client")
        XCTAssertEqual(tabTitles(app), ["Сегодня", "Дневник", "Меню", "Ещё"])
        XCTAssertTrue(app.buttons["header.chat"].exists, "чат с куратором — значок в шапке")
    }

    func testCoordinatorShell() {
        XCTAssertEqual(tabTitles(launch("coordinator")), ["Клиенты", "Чаты", "Заявки", "Обращения"])
    }

    func testSuperAdminShell() {
        XCTAssertEqual(tabTitles(launch("super_admin")), ["Заявки", "Обращения"])
    }

    func testUnknownRoleGetsWebOnlyScreen() {
        let app = launch("nutritionist")
        XCTAssertTrue(app.staticTexts["Этот раздел доступен в веб-версии"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.tabBars.firstMatch.exists)
        XCTAssertTrue(app.buttons["Выйти"].exists)
    }

    // Сценарий «Версия ниже минимальной».
    func testUpdateRequiredBlocks() {
        let app = launch("update")
        XCTAssertTrue(app.staticTexts["Обновите приложение"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Открыть App Store"].exists)
        XCTAssertFalse(app.tabBars.firstMatch.exists)
    }

    // Сценарий «Нет сети, есть кэш профиля».
    func testOfflineWithCachedProfile() {
        let app = launch("offlineClient")
        XCTAssertEqual(tabTitles(app), ["Сегодня", "Дневник", "Меню", "Ещё"])
        XCTAssertTrue(app.staticTexts["Нет подключения"].waitForExistence(timeout: 5))
    }

    // 3.3: справочник открывается и показывает все компоненты.
    func testCatalogueShowsEveryComponent() {
        let app = launch("client")
        XCTAssertTrue(app.tabBars.buttons["Ещё"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Ещё"].tap()
        app.buttons["more.catalogue"].tap()
        let entries = ["card", "coachCard", "progressArc", "progressBar", "macroRemaining", "weekDots", "quickAdd",
                       "quickAddBar", "buttons", "offlineBanner", "spinner", "nutritionCard"]
        let scroll = app.scrollViews.firstMatch
        XCTAssertTrue(scroll.waitForExistence(timeout: 5))
        for entry in entries {
            let element = app.descendants(matching: .any)["catalogue.\(entry)"]
            var swipes = 0
            while !element.exists && swipes < 25 {
                scroll.swipeUp()
                swipes += 1
            }
            XCTAssertTrue(element.exists, "нет компонента \(entry)")
        }
    }

    // Выход возвращает на экран входа.
    func testSignOut() {
        let app = launch("client")
        XCTAssertTrue(app.tabBars.buttons["Ещё"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Ещё"].tap()
        app.buttons["more.signOut"].tap()
        XCTAssertTrue(app.otherElements["screen.signIn"].waitForExistence(timeout: 5)
                      || app.scrollViews["screen.signIn"].waitForExistence(timeout: 1))
    }
}

/// ios-platform-compliance: аудит доступности на экранах, которые уже есть.
@MainActor
final class AccessibilityAuditUITests: XCTestCase {
    private func launch(_ scenario: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", scenario, "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        return app
    }

    func testSignInScreen() throws {
        let app = launch("signedOut")
        XCTAssertTrue(app.buttons["signIn.submit"].waitForExistence(timeout: 10))
        try app.performAccessibilityAudit()
    }

    func testClientShell() throws {
        let app = launch("client")
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        try app.performAccessibilityAudit()
    }

    func testCuratorShell() throws {
        let app = launch("coordinator")
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        try app.performAccessibilityAudit()
    }

    func testComponentCatalogue() throws {
        let app = launch("client")
        XCTAssertTrue(app.tabBars.buttons["Ещё"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Ещё"].tap()
        app.buttons["more.catalogue"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["catalogue.nutritionCard"].waitForExistence(timeout: 5)
                      || app.scrollViews.firstMatch.exists)
        try app.performAccessibilityAudit()
    }
}
