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
    private func audit(_ app: XCUIApplication, _ screen: String = "") throws {
        var found: [String] = []
        defer {
            // Журнал CI оставляет только строки с «error:» — находки одной строкой.
            if !found.isEmpty { XCTFail("аудит \(screen): " + found.joined(separator: " ;; ")) }
        }
        try app.performAccessibilityAudit { issue in
            if Self.isExcluded(issue, in: app) { return true }
            found.append(Self.describe(issue))
            return false
        }
    }

    /// Находка одной строкой: тип, элемент, рамка и подробности аудита
    /// (у контраста — измеренные цвета).
    static func describe(_ issue: XCUIAccessibilityAuditIssue) -> String {
        let element = issue.element.map { "\($0.elementType.rawValue) «\($0.label)» [\($0.identifier)] \($0.frame)" } ?? "нет элемента"
        return "\(issue.compactDescription): \(element) — \(issue.detailedDescription)"
            .replacingOccurrences(of: "\n", with: " ")
    }

    /// Исключения аудита, каждое с причиной; всё остальное чинится в коде.
    /// Общие для всех экранов и для стенда обрезки (`TruncationProbeUITests`):
    /// стенд проверяет, что настоящую обрезку они не прячут.
    static func isExcluded(_ issue: XCUIAccessibilityAuditIssue, in app: XCUIApplication) -> Bool {
        // Контраст недоступного элемента WCAG 1.4.3 не нормирует: кнопка
        // «Войти» до ввода почты и пароля и должна выглядеть погашенной.
        if issue.auditType == .contrast, let element = issue.element, !element.isEnabled {
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
        return isJustifiedException(issue, in: app)
    }

    /// Однострочные поля, проверенные по записям CI (см. `isJustifiedException`).
    static let singleLineFields: Set<String> = ["signIn.email", "name.field", "password.current",
                                                "search.field", "food.name"]

    /// Исключения, найденные аудитом новых экранов (C7) и разобранные по
    /// снимкам CI.
    static func isJustifiedException(_ issue: XCUIAccessibilityAuditIssue, in app: XCUIApplication) -> Bool {
        // «Text clipped» у однострочных полей ввода. Аудит перерисовывает экран
        // на крупных размерах Dynamic Type; на записях этих прогонов (run
        // 39370996550) подсказка и значение полей видны целиком на каждом
        // размере — «name@example.ru», «гр», «Например, омлет» (имя и пароль —
        // то же поле DSField, что почта). Однострочное
        // поле не переносит текст, а прокручивает его; находка — о поле как
        // классе, а не об этих экранах. Только эти поля, по идентификатору.
        if issue.auditType == .textClipped, let element = issue.element,
           [.textField, .secureTextField].contains(element.elementType),
           singleLineFields.contains(element.identifier) {
            return true
        }
        // Подписи в панели навигации («Шаг 1 из 3», «Написать» в карточке):
        // панель не растёт с Dynamic Type, крупную подпись показывает Large
        // Content Viewer долгим нажатием (accessibilityShowsLargeContentViewer).
        let bar = app.navigationBars.firstMatch
        if issue.auditType == .dynamicType, let element = issue.element, bar.exists,
           bar.frame.intersects(element.frame) {
            return true
        }
        // «Potentially inaccessible text» без элемента: аудит распознаёт текст
        // на пикселях (фото клиента в переписке), а не элемент интерфейса —
        // указать, что чинить, он не может.
        if issue.element == nil, issue.compactDescription.contains("Potentially inaccessible text") { return true }
        return false
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
        // Через 2 с на экране n1 и n2 становятся прочитанными: «Основные · 2»
        // превращается в «Основные», и «Контент · 1» сдвигается влево на ширину
        // счётчика. Аудит, снявший экран до сдвига, а рамку — после, мерил
        // тёмную подпись «Контента» по тёмному хвосту выбранной вкладки
        // («Contrast failed»). Аудит — по экрану после отметки прочитанным.
        let main = app.buttons["notifications.tab.main"]
        let settled = expectation(for: NSPredicate(format: "label == %@", "Основные"), evaluatedWith: main)
        wait(for: [settled], timeout: 10)
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

    // MARK: Экраны клиента и куратора (ios-client-app 7.x, ios-curator-app)

    private func wait(_ app: XCUIApplication, _ identifier: String, timeout: TimeInterval = 10) -> XCUIElement {
        let element = app.descendants(matching: .any)[identifier].firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "нет \(identifier): \(app.screenSummary)")
        return element
    }

    private func scrollTo(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        let element = app.descendants(matching: .any)[identifier].firstMatch
        var swipes = 0
        while !(element.exists && element.isHittable) && swipes < 10 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(element.exists, "нет \(identifier): \(app.screenSummary)")
        return element
    }

    /// Лист «Записать еду»: поиск с результатами, затем порция.
    func testAddFoodSearchAndPortion() throws {
        let app = launch("client")
        wait(app, "accessory.search").tap()
        let field = app.textFields["search.field"]
        XCTAssertTrue(field.waitForExistence(timeout: 5), app.screenSummary)
        field.tap()
        // Перевод строки убирает клавиатуру: аудит — экрана, а не клавиатуры.
        field.typeText("гр\n")
        _ = wait(app, "food.p1", timeout: 5)
        // Лист и выдача ещё анимируются — аудит по устоявшемуся экрану.
        Thread.sleep(forTimeInterval: 1.5)
        try audit(app, "поиск")
        app.buttons["food.p1"].tap()
        _ = wait(app, "portion.card", timeout: 5)
        Thread.sleep(forTimeInterval: 1)
        try audit(app, "порция")
    }

    /// #279: шапка листа «Записать еду» на крупном тексте. Аудит наложения
    /// не видит — заголовок поверх «Отмены» и «Завтрака» он не находил, —
    /// поэтому рамки сверяются прямо: «Отмена», заголовок и выбор приёма не
    /// пересекаются и не выходят за ширину окна ни на одном размере.
    func testAddFoodHeaderAtLargeText() throws {
        let sizes = [("по умолчанию", [String]()),
                     ("xxxLarge", ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryXXXL"]),
                     ("AX1", ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityM"]),
                     ("AX5", ax5)]
        for (size, arguments) in sizes {
            let app = launch("client", arguments)
            wait(app, "accessory.search").tap()
            let cancel = wait(app, "addFood.cancel", timeout: 5)
            let title = wait(app, "addFood.title", timeout: 5)
            let meal = wait(app, "addFood.meal", timeout: 5)
            // Лист ещё выезжает — рамки по устоявшемуся экрану.
            Thread.sleep(forTimeInterval: 1.5)
            // У «Отмены» рамка VoiceOver расширена на 14 pt во все стороны
            // (`touchTarget`); сама подпись — внутри.
            let frames = [("«Отмена»", cancel.frame.insetBy(dx: 14, dy: 14)), ("заголовок", title.frame),
                          ("приём пищи", meal.frame)]
            let window = app.windows.firstMatch.frame
            for (index, (name, frame)) in frames.enumerated() {
                XCTAssertFalse(frame.isEmpty, "\(size): у \(name) пустая рамка")
                XCTAssertTrue(window.contains(frame), "\(size): \(name) \(frame) выходит за окно \(window)")
                for (other, otherFrame) in frames[(index + 1)...] {
                    XCTAssertFalse(frame.intersects(otherFrame),
                                   "\(size): \(name) \(frame) наезжает на \(other) \(otherFrame)")
                }
            }
            if size == "AX5" {
                // На размерах доступности приём пищи — своей строкой под заголовком.
                XCTAssertGreaterThanOrEqual(meal.frame.minY, title.frame.maxY, "\(size): приём пищи не под заголовком")
                // Поле поиска получает фокус при открытии: клавиатура закрывает
                // выдачу, и аудит мерил бы контраст строк под ней и пустые
                // ячейки подсказок клавиатуры. Перевод строки её убирает.
                if app.keyboards.firstMatch.exists { app.textFields["search.field"].typeText("\n") }
                Thread.sleep(forTimeInterval: 1)
                try audit(app, "шапка «Записать еду» на AX5")
            }
            app.terminate()
        }
    }

    /// Результат распознавания фото.
    func testPhotoResult() throws {
        let app = launch("client")
        wait(app, "accessory.photo").tap()
        wait(app, "photo.camera").tap()
        _ = wait(app, "photo.apply.0")
        Thread.sleep(forTimeInterval: 1.5)
        try audit(app, "результат фото")
    }

    func testMenu() throws {
        let app = launch("client")
        app.tabBars.buttons["Меню"].tap()
        _ = wait(app, "menu.dish.breakfast")
        try audit(app, "меню")
    }

    /// Онбординг: все три шага.
    func testOnboarding() throws {
        let app = launch("newClient")
        _ = wait(app, "onboarding.skip")
        try audit(app, "онбординг: настройки")
        app.buttons["onboarding.skip"].tap()
        _ = wait(app, "screen.onboarding.body", timeout: 5)
        try audit(app, "онбординг: тело")
        app.buttons["onboarding.skip"].tap()
        _ = wait(app, "health.notNow", timeout: 5)
        // «Подключить» внизу прокрутки уходит под край экрана; аудит
        // контраста частично невидимой кнопки мерит пиксели за краем
        // («Contrast failed» при 6:1 по токенам) — аудит по видимой кнопке.
        let connect = app.buttons["health.continue"]
        let window = app.windows.firstMatch.frame
        for _ in 0..<4 where connect.frame.maxY > window.maxY - 34 { app.swipeUp() }
        Thread.sleep(forTimeInterval: 1)
        try audit(app, "онбординг: Здоровье")
    }

    /// Каждый раздел профиля.
    func testSettingsSections() throws {
        for section in ["name", "body-goals", "locale", "notifications", "telegram", "password", "sign-in", "export", "delete"] {
            // Каждый раздел — с нового запуска: без догадок о кнопке «Назад».
            let app = launch("client")
            wait(app, "header.profile").tap()
            scrollTo(app, "profile.\(section)").tap()
            // Раздел грузит данные: аудит — по загруженному экрану.
            Thread.sleep(forTimeInterval: 1.5)
            try audit(app, "настройки: \(section)")
            app.terminate()
        }
    }

    func testCuratorClientCard() throws {
        let app = launch("coordinator", ["-uiTestOpenURL", "https://new.burcev.team/curator/clients/11"])
        _ = wait(app, "card.name")
        Thread.sleep(forTimeInterval: 1)
        try audit(app, "карточка клиента")
    }

    /// Переписка куратора и лист КБЖУ по фото.
    func testCuratorConversationAndFoodSheet() throws {
        let app = launch("coordinator", ["-uiTestOpenURL", "https://new.burcev.team/curator/chat/11"])
        _ = wait(app, "conversation.name")
        // Лента докручивается к последнему сообщению с анимацией.
        Thread.sleep(forTimeInterval: 1.5)
        try audit(app, "переписка куратора")
        wait(app, "food.enter.k2").tap()
        _ = wait(app, "sheet.foodEntry", timeout: 5)
        Thread.sleep(forTimeInterval: 1.5)
        try audit(app, "лист КБЖУ")
    }

    func testCuratorLeads() throws {
        let app = launch("coordinator")
        app.tabBars.buttons["Заявки"].tap()
        _ = wait(app, "lead.l1")
        try audit(app, "заявки")
    }

    func testCuratorSupportThread() throws {
        let app = launch("coordinator")
        app.tabBars.buttons["Обращения"].tap()
        wait(app, "support.s1").tap()
        _ = wait(app, "support.reply")
        try audit(app, "тред обращения")
    }
}
