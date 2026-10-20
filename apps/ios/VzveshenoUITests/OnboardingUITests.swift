import XCTest

/// `ios-onboarding` (задача 1.3).
@MainActor
final class OnboardingUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// «Пропуск всех полей»: онбординг завершён, открыт «Сегодня» с «Норма не посчитана».
    func testSkipEverything() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", "newClient", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        let skip = app.buttons["onboarding.skip"]
        XCTAssertTrue(skip.waitForExistence(timeout: 10))
        skip.tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen.onboarding.body"].waitForExistence(timeout: 5))
        app.buttons["onboarding.skip"].tap()
        let later = app.buttons["health.notNow"]
        XCTAssertTrue(later.waitForExistence(timeout: 5))
        XCTAssertEqual(later.label, "Позже")
        XCTAssertEqual(app.buttons["health.continue"].label, "Подключить")
        later.tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["nutrition.noNorm"].waitForExistence(timeout: 10), app.screenSummary)
    }
}
