import XCTest

/// Аудит обрезки текста ловит настоящую обрезку и после исключений
/// `AccessibilityAuditUITests.isExcluded`: стенд `TruncationProbeView` с
/// заведомо обрезанными подписями и контролями рядом.
@MainActor
final class TruncationProbeUITests: XCTestCase {
    /// Находки «Text clipped» по идентификатору элемента — после исключений аудита.
    private func clipped(_ app: XCUIApplication) throws -> (ids: Set<String>, log: String) {
        var ids: Set<String> = []
        var lines: [String] = []
        try app.performAccessibilityAudit(for: .textClipped) { issue in
            lines.append(AccessibilityAuditUITests.describe(issue))
            if AccessibilityAuditUITests.isExcluded(issue, in: app) { return true }
            if let id = issue.element?.identifier { ids.insert(id) }
            return true
        }
        return (ids, lines.joined(separator: " ;; "))
    }

    func testAuditReportsDeliberateTruncation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", "truncationProbe", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["probe.truncated"].waitForExistence(timeout: 10), app.screenSummary)
        let (ids, log) = try clipped(app)
        // Журнал CI оставляет только строки с «error:»: все находки — в сообщении.
        XCTAssertTrue(ids.contains("probe.truncated"), "обрезка по ширине не найдена: \(log)")
        XCTAssertTrue(ids.contains("probe.clippedHeight"), "обрезка по высоте не найдена: \(log)")
        let controls = ["probe.sys", "probe.golos", "probe.golosRegular", "probe.golosV1", "probe.golosV3", "probe.golosH2",
                        "probe.golosClean", "probe.literata", "probe.caption", "probe.cardStyle", "probe.btnLimit",
                        "probe.btnScale", "probe.btnPlain", "probe.btnSystem", "probe.fieldGolos", "probe.fieldSystem",
                        "probe.Обзор", "probe.План", "probe.Задачи", "probe.Отчёты"]
        let falsePositives = controls.filter(ids.contains)
        XCTAssertTrue(falsePositives.isEmpty, "контроли без обрезки: \(falsePositives) — \(log)")
    }
}
