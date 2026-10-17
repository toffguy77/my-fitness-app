import XCTest

final class SkeletonUITests: XCTestCase {
    @MainActor
    func testAppLaunches() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["Взвешено"].waitForExistence(timeout: 10))
    }
}
