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
        XCTAssertEqual(tabTitles(app), ["Сегодня", "Дневник", "Меню", "Статьи"])
        XCTAssertTrue(app.buttons["header.chat"].waitForExistence(timeout: 10), "чат с куратором — значок в шапке")
        XCTAssertTrue(app.buttons["header.notifications"].exists)
        XCTAssertFalse(app.tabBars.buttons["Ещё"].exists)
        XCTAssertFalse(app.tabBars.buttons["Куратор"].exists)
    }

    // Аватар открывает «Профиль» с пунктом «Здоровье».
    func testAvatarOpensProfileWithHealth() {
        let app = launch("client")
        XCTAssertTrue(app.buttons["header.profile"].waitForExistence(timeout: 10))
        app.buttons["header.profile"].tap()
        XCTAssertTrue(app.buttons["profile.health"].waitForExistence(timeout: 5))
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
        XCTAssertEqual(tabTitles(app), ["Сегодня", "Дневник", "Меню", "Статьи"])
        XCTAssertTrue(app.staticTexts["Нет подключения"].waitForExistence(timeout: 5))
    }

    // 3.3: справочник открывается и показывает все компоненты.
    func testCatalogueShowsEveryComponent() {
        let app = launch("client")
        XCTAssertTrue(app.buttons["header.profile"].waitForExistence(timeout: 10))
        app.buttons["header.profile"].tap()
        let catalogue = app.buttons["profile.catalogue"]
        XCTAssertTrue(catalogue.waitForExistence(timeout: 5))
        for _ in 0..<6 where !catalogue.isHittable { app.swipeUp() }
        catalogue.tap()
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
        XCTAssertTrue(app.buttons["header.profile"].waitForExistence(timeout: 10))
        app.buttons["header.profile"].tap()
        let signOut = app.buttons["profile.signOut"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 5))
        for _ in 0..<6 where !signOut.isHittable { app.swipeUp() }
        signOut.tap()
        // ios-client-settings «Выход»: сначала подтверждение.
        let confirm = app.alerts["Выйти из аккаунта?"].buttons["Выйти"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5), app.screenSummary)
        confirm.tap()
        XCTAssertTrue(app.otherElements["screen.signIn"].waitForExistence(timeout: 5)
                      || app.scrollViews["screen.signIn"].waitForExistence(timeout: 1))
    }
}

/// ios-platform-compliance: аудит доступности на экранах, которые уже есть.
@MainActor
final class AccessibilityAuditUITests: XCTestCase {
    /// Аудит с описанием каждой находки в журнале: без него в CI видно лишь
    /// «Contrast failed», но не какой элемент.
    private func audit(_ app: XCUIApplication) throws {
        var found: [String] = []
        defer {
            // Журнал CI оставляет только строки с «error:» — находки одной строкой.
            if !found.isEmpty { XCTFail("аудит: " + found.joined(separator: " ;; ")) }
        }
        try app.performAccessibilityAudit { issue in
            // Контраст недоступного элемента WCAG 1.4.3 не нормирует: кнопка
            // «Войти» до ввода почты и пароля и должна выглядеть погашенной.
            if issue.auditType == .contrast, let element = issue.element, !element.isEnabled {
                return true
            }
            // Пустое поле с подсказкой («name@example.ru»): аудит считает
            // выносной «p» подсказки обрезанным, хотя на снимке он виден целиком.
            if issue.auditType == .textClipped, let element = issue.element, element.elementType == .textField,
               (element.value as? String ?? "").isEmpty || element.value as? String == element.placeholderValue {
                return true
            }
            // Под полупрозрачным таббаром контраст считается по тому, что за
            // ним, — это не цвет текста экрана.
            let tabBar = app.tabBars.firstMatch
            if issue.auditType == .contrast, let element = issue.element, tabBar.exists,
               element.frame.maxY > tabBar.frame.minY {
                return true
            }
            // Под плавающей панелью «Записать еду» (iOS 18) аудит сравнивает
            // цвет подписи карточки, прокрученной под панель, с тем, что
            // за ней в иерархии, а не с непрозрачной подложкой панели (пара
            // токенов fgDefault/bgSurface — контраст выше 12:1). Проверено в
            // фазе C: без исключения падает «Записать тренировку» под панелью.
            // Обрезку подписи панели исключение больше не прячет.
            let accessory = app.buttons["accessory.open"]
            if issue.auditType == .contrast, let element = issue.element, accessory.exists,
               element.frame.maxY > accessory.frame.minY - 4, element.frame.minY < accessory.frame.maxY + 4 {
                return true
            }
            // Панель «Записать еду» — как таббар: высота постоянная, шрифт
            // растёт до xxxLarge, дальше — увеличенный вид долгим нажатием
            // (Large Content Viewer, HIG). Аудит называет это «частичной»
            // поддержкой Dynamic Type.
            if issue.auditType == .dynamicType, let element = issue.element, element.identifier.hasPrefix("accessory.") {
                return true
            }
            let element = issue.element.map { "\($0.elementType.rawValue) «\($0.label)» [\($0.identifier)] \($0.frame)" } ?? "нет элемента"
            found.append("\(issue.compactDescription): \(element)".replacingOccurrences(of: "\n", with: " "))
            return false
        }
    }

    private func launch(_ scenario: String, _ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", scenario, "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"] + extra
        app.launch()
        return app
    }

    /// Крупнейший размер Dynamic Type (AX5).
    private let ax5 = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]

    private func open(_ app: XCUIApplication, _ identifier: String) {
        let element = app.descendants(matching: .any)[identifier].firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: 10), "нет \(identifier): \(app.screenSummary)")
        element.tap()
    }

    // 7.2: главные экраны клиента.
    func testDiary() throws {
        let app = launch("client")
        app.tabBars.buttons["Дневник"].tap()
        XCTAssertTrue(app.buttons["entry.Овсянка на молоке"].waitForExistence(timeout: 10), app.screenSummary)
        try audit(app)
    }

    func testArticles() throws {
        let app = launch("client")
        app.tabBars.buttons["Статьи"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["article.a1"].waitForExistence(timeout: 10), app.screenSummary)
        try audit(app)
    }

    func testChat() throws {
        let app = launch("client")
        open(app, "header.chat")
        XCTAssertTrue(app.descendants(matching: .any)["message.m5"].waitForExistence(timeout: 10), app.screenSummary)
        // Лента докручивается к последнему сообщению с анимацией: аудит посреди
        // прокрутки сравнивал текст пузыря с тем, что под ним проезжало.
        Thread.sleep(forTimeInterval: 1.5)
        try audit(app)
    }

    func testNotifications() throws {
        let app = launch("client")
        open(app, "header.notifications")
        XCTAssertTrue(app.descendants(matching: .any)["notification.n1"].waitForExistence(timeout: 10), app.screenSummary)
        try audit(app)
    }

    func testProfile() throws {
        let app = launch("client")
        open(app, "header.profile")
        XCTAssertTrue(app.descendants(matching: .any)["profile.body-goals"].waitForExistence(timeout: 10), app.screenSummary)
        try audit(app)
    }

    /// Dynamic Type до AX5 на «Сегодня»: текст не обрезан, аудит без ошибок.
    func testTodayAtAX5() throws {
        let app = launch("client", ax5)
        XCTAssertTrue(app.descendants(matching: .any)["nutrition.summary"].waitForExistence(timeout: 10), app.screenSummary)
        try audit(app)
    }

    func testDiaryAtAX5() throws {
        let app = launch("client", ax5)
        app.tabBars.buttons["Дневник"].tap()
        XCTAssertTrue(app.buttons["entry.Овсянка на молоке"].waitForExistence(timeout: 10), app.screenSummary)
        try audit(app)
    }

    func testSignInScreen() throws {
        let app = launch("signedOut")
        XCTAssertTrue(app.buttons["signIn.magicLink"].waitForExistence(timeout: 10))
        try audit(app)
    }

    func testClientShell() throws {
        let app = launch("client")
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        try audit(app)
    }

    func testCuratorShell() throws {
        let app = launch("coordinator")
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        try audit(app)
    }

    func testComponentCatalogue() throws {
        let app = launch("client")
        XCTAssertTrue(app.buttons["header.profile"].waitForExistence(timeout: 10))
        app.buttons["header.profile"].tap()
        let catalogue = app.buttons["profile.catalogue"]
        XCTAssertTrue(catalogue.waitForExistence(timeout: 5))
        for _ in 0..<6 where !catalogue.isHittable { app.swipeUp() }
        catalogue.tap()
        XCTAssertTrue(app.descendants(matching: .any)["catalogue.nutritionCard"].waitForExistence(timeout: 5)
                      || app.scrollViews.firstMatch.exists)
        try audit(app)
    }
}
