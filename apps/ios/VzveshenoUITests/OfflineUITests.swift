import XCTest

/// `ios-offline-outbox`, «Быстрый запуск» и «Открытие без сети»: первый
/// запуск с сетью наполняет кэш, второй — без сети — сразу показывает
/// сохранённое с плашкой «Нет подключения · Обновлено в …».
@MainActor
final class OfflineUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ scenario: String, store: String, offline: Bool) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", scenario, "-uiTestStore", store, "-AppleLanguages", "(ru)",
                               "-AppleLocale", "ru_RU"] + (offline ? ["-uiTestOffline"] : ["-uiTestResetStore"])
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func wait(_ app: XCUIApplication, _ identifier: String, timeout: TimeInterval = 10) -> XCUIElement {
        let found = element(app, identifier)
        XCTAssertTrue(found.waitForExistence(timeout: timeout), "нет \(identifier): \(app.screenSummary)")
        return found
    }

    private func openTab(_ app: XCUIApplication, _ title: String) {
        let tab = app.tabBars.buttons[title]
        XCTAssertTrue(tab.waitForExistence(timeout: 10), app.screenSummary)
        tab.tap()
    }

    /// Плашка без сети с подписью времени сохранённого ответа — по тексту на
    /// экране: идентификатор контейнера экрана («screen.hub») SwiftUI отдаёт и
    /// вложенным элементам, и `banner.offline` там не виден.
    private func assertOfflineWithLabel(_ app: XCUIApplication, _ screen: String) {
        let offline = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Нет подключения")).firstMatch
        XCTAssertTrue(offline.waitForExistence(timeout: 10), "\(screen): нет плашки: \(app.screenSummary)")
        let updated = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Обновлено")).firstMatch
        XCTAssertTrue(updated.exists, "\(screen): нет подписи «Обновлено»: \(app.screenSummary)")
    }

    private func back(_ app: XCUIApplication) {
        let button = app.navigationBars.buttons.firstMatch
        if button.waitForExistence(timeout: 3) { button.tap() }
    }

    func testClientScreensOpenFromCacheWithoutNetwork() {
        let online = launch("client", store: "offline-client", offline: false)
        _ = wait(online, "today.nutrition")
        openTab(online, "Дневник")
        XCTAssertTrue(online.buttons["entry.Овсянка на молоке"].waitForExistence(timeout: 10), online.screenSummary)
        openTab(online, "Статьи")
        _ = wait(online, "article.a1")
        openTab(online, "Сегодня")
        let chat = wait(online, "header.chat")
        chat.tap()
        _ = wait(online, "message.m1")
        online.terminate()

        let app = launch("client", store: "offline-client", offline: true)
        // Оболочка и «Сегодня» — без спиннера загрузки.
        _ = wait(app, "today.nutrition", timeout: 5)
        XCTAssertFalse(element(app, "launch.loading").exists)
        assertOfflineWithLabel(app, "Сегодня")
        openTab(app, "Дневник")
        XCTAssertTrue(app.buttons["entry.Овсянка на молоке"].waitForExistence(timeout: 5), app.screenSummary)
        assertOfflineWithLabel(app, "Дневник")
        openTab(app, "Статьи")
        _ = wait(app, "article.a1", timeout: 5)
        assertOfflineWithLabel(app, "Статьи")
        openTab(app, "Сегодня")
        wait(app, "header.chat").tap()
        _ = wait(app, "message.m1", timeout: 5)
        assertOfflineWithLabel(app, "Переписка")
    }

    /// «Нет сети и нет кэша»: понятное пустое состояние, а не вечная загрузка.
    func testNoNetworkAndNoCacheShowsOfflineState() {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", "client", "-uiTestStore", "offline-empty", "-uiTestResetStore", "-uiTestOffline",
                               "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        _ = wait(app, "state.offlineEmpty")
        openTab(app, "Дневник")
        _ = wait(app, "state.offlineEmpty")
    }

    func testCuratorClientsAndChatsOpenFromCacheWithoutNetwork() {
        let online = launch("coordinator", store: "offline-curator", offline: false)
        _ = wait(online, "attention.11")
        openTab(online, "Чаты")
        wait(online, "conversation.11").tap()
        _ = wait(online, "message.k1")
        online.terminate()

        let app = launch("coordinator", store: "offline-curator", offline: true)
        _ = wait(app, "attention.11", timeout: 5)
        XCTAssertFalse(element(app, "curator.loadFailed").exists)
        assertOfflineWithLabel(app, "Клиенты")
        openTab(app, "Чаты")
        let row = wait(app, "conversation.11", timeout: 5)
        assertOfflineWithLabel(app, "Чаты")
        row.tap()
        _ = wait(app, "message.k1", timeout: 5)
        assertOfflineWithLabel(app, "Переписка куратора")
    }
}
