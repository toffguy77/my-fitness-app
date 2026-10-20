import XCTest

/// «Сегодня» на заглушке API (задачи 2.2–2.3).
@MainActor
final class TodayUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", "client", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        return app
    }

    func testTodayShowsTheDay() {
        let app = launch()
        let summary = app.descendants(matching: .any)["nutrition.summary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertTrue(summary.label.hasPrefix("Осталось 1\u{00A0}923 ккал"), summary.label)
        XCTAssertEqual(app.staticTexts["today.title"].label, "Сегодня")
    }

    /// «Стакан воды»: счётчик растёт сразу.
    func testGlassOfWater() {
        let app = launch()
        let count = app.staticTexts["water.count"]
        XCTAssertTrue(count.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(count.label, "5")
        app.buttons["water.add"].tap()
        XCTAssertEqual(count.label, "6")
    }

    /// «Задача-тренировка»: лист вида и длительности, задача выполнена, тренировка дня обновлена.
    func testWorkoutTaskAsksForKindAndDuration() {
        let app = launch()
        let task = app.buttons["task.t1"]
        var swipes = 0
        while !task.waitForExistence(timeout: 2) && swipes < 6 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(task.exists, app.screenSummary)
        task.tap()
        let kind = app.descendants(matching: .any)["editor.kind"].firstMatch
        XCTAssertTrue(kind.waitForExistence(timeout: 5))
        kind.tap()
        app.buttons["Силовая"].firstMatch.tap()
        let minutes = app.textFields["editor.value"]
        minutes.tap()
        minutes.typeText("45")
        app.buttons["editor.save"].tap()
        XCTAssertTrue(app.buttons["task.t1"].waitForExistence(timeout: 10))
        let done = NSPredicate(format: "isSelected == true")
        expectation(for: done, evaluatedWith: app.buttons["task.t1"])
        waitForExpectations(timeout: 10)
        let workout = app.buttons["today.workout"]
        var tries = 0
        while !workout.label.contains("45") && tries < 20 {
            Thread.sleep(forTimeInterval: 0.25)
            tries += 1
        }
        XCTAssertTrue(workout.label.contains("45"), workout.label)
    }
}
