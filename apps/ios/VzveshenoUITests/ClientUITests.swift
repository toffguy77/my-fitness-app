import XCTest

/// Общее для UI-тестов клиента: запуск сценария, поиск, прокрутка.
@MainActor
class ClientUITestCase: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", "client", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"] + extra
        app.launch()
        return app
    }

    func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    func tap(_ app: XCUIApplication, _ identifier: String, timeout: TimeInterval = 10) {
        let target = element(app, identifier)
        XCTAssertTrue(target.waitForExistence(timeout: timeout), "нет \(identifier): \(app.screenSummary)")
        scrollTo(app, target)
        target.tap()
    }

    func scrollTo(_ app: XCUIApplication, _ target: XCUIElement, swipes: Int = 8) {
        var count = 0
        while !(target.exists && target.isHittable) && count < swipes {
            app.swipeUp()
            count += 1
        }
    }

    func openChat(_ app: XCUIApplication) {
        tap(app, "header.chat")
    }

    func openProfileSection(_ app: XCUIApplication, _ section: String) {
        tap(app, "header.profile")
        tap(app, "profile.\(section)")
    }

    /// Поле ввода `DSField` с идентификатором (подпись поля несёт тот же).
    func field(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        let text = app.textFields[identifier]
        let secure = app.secureTextFields[identifier]
        XCTAssertTrue(text.waitForExistence(timeout: 10) || secure.exists, "нет поля \(identifier): \(app.screenSummary)")
        return text.exists ? text : secure
    }

    /// Текст есть где-нибудь на экране (тексты, кнопки, поля).
    func screenContains(_ app: XCUIApplication, _ fragment: String) -> Bool {
        let predicate = NSPredicate(format: "label CONTAINS[c] %@ OR value CONTAINS[c] %@", fragment, fragment)
        return app.descendants(matching: .any).matching(predicate).firstMatch.exists
    }
}

// MARK: 5.1–5.2 Переписка

final class ChatUITests: ClientUITestCase {
    /// Переписка открывается значком шапки, без таббара и панели «Записать еду».
    func testChatOpensFromHeaderWithoutTabBarAndAccessory() {
        let app = launch()
        openChat(app)
        XCTAssertTrue(element(app, "chat.curator").waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(element(app, "chat.curator").label, "Анна Смирнова")
        XCTAssertTrue(element(app, "message.m5").exists, app.screenSummary)
        XCTAssertFalse(app.tabBars.firstMatch.isHittable, "таббар скрыт")
        XCTAssertFalse(app.buttons["accessory.open"].exists, "панели «Записать еду» нет")
        XCTAssertTrue(app.textViews["chat.input"].exists || app.textFields["chat.input"].exists)
    }

    func testSendMessage() {
        let app = launch()
        openChat(app)
        let input = element(app, "chat.input")
        XCTAssertTrue(input.waitForExistence(timeout: 10), app.screenSummary)
        input.tap()
        input.typeText("Спасибо, учту!")
        app.buttons["chat.send"].tap()
        let sent = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Спасибо, учту!")).firstMatch
        XCTAssertTrue(sent.waitForExistence(timeout: 10), app.screenSummary)
    }

    // Сценарий «Файл 14 МБ».
    func testFileOverTenMegabytesIsRejected() {
        let app = launch(["-uiTestPickFile", "14mb"])
        openChat(app)
        tap(app, "chat.attach")
        let file = app.buttons["Файл"]
        XCTAssertTrue(file.waitForExistence(timeout: 5), app.screenSummary)
        file.tap()
        XCTAssertTrue(app.staticTexts["Файл больше 10 МБ"].waitForExistence(timeout: 5), app.screenSummary)
        app.buttons["OK"].tap()
        XCTAssertFalse(element(app, "message.m6").exists, "ничего не отправлено")
        XCTAssertFalse(element(app, "message.pending").exists, "ничего не ждёт отправки")
    }

    /// 5.2: на экранах без доступа нет цены, «стоит», заявки.
    func testNoAccessScreenHasNoPriceOrRequest() {
        for access in ["none", "noCurator", "expired"] {
            let app = launch(["-uiTestCuratorAccess", access])
            openChat(app)
            let shown = access == "expired" ? element(app, "chat.expired") : element(app, "curatorAccess.title")
            XCTAssertTrue(shown.waitForExistence(timeout: 10), "\(access): \(app.screenSummary)")
            for word in ["₽", "стоит", "заявк", "купить", "оплат", "тариф"] {
                XCTAssertFalse(screenContains(app, word), "\(access): на экране «\(word)»")
            }
            XCTAssertFalse(app.links.firstMatch.exists, "\(access): ссылок на сайт нет")
            app.terminate()
        }
    }

    func testNoAccessShowsSupport() {
        let app = launch(["-uiTestCuratorAccess", "none"])
        openChat(app)
        XCTAssertTrue(element(app, "curatorAccess.title").waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(element(app, "curatorAccess.title").label, "Работа с куратором")
        XCTAssertTrue(app.buttons["curatorAccess.support"].exists)
        XCTAssertEqual(app.buttons["curatorAccess.support"].label, "Написать в поддержку")
    }

    // Сценарий «Куратор не назначен».
    func testNoCuratorAssigned() {
        let app = launch(["-uiTestCuratorAccess", "noCurator"])
        openChat(app)
        XCTAssertTrue(app.staticTexts["Куратор пока не назначен"].waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertTrue(app.buttons["curatorAccess.support"].exists)
    }

    // Сценарий «Доступ истёк».
    func testExpiredAccessIsReadOnly() {
        let app = launch(["-uiTestCuratorAccess", "expired"])
        openChat(app)
        let notice = element(app, "chat.expired")
        XCTAssertTrue(notice.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(notice.label, "Доступ действовал до 1 октября")
        XCTAssertTrue(element(app, "message.m1").exists, "история видна")
        XCTAssertFalse(element(app, "chat.input").exists, "поле ввода скрыто")
    }
}

// MARK: 5.3 Статьи

final class ArticlesUITests: ClientUITestCase {
    func testFeedArticleShareAndCalculate() {
        let app = launch()
        let tab = app.tabBars.buttons["Статьи"]
        XCTAssertTrue(tab.waitForExistence(timeout: 10))
        tab.tap()
        tap(app, "article.a1")
        XCTAssertTrue(element(app, "article.title").waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertTrue(app.buttons["article.share"].waitForExistence(timeout: 5), "есть «Поделиться»")
        XCTAssertTrue(element(app, "article.table").exists || screenContains(app, "Завтрак"))
        XCTAssertFalse(app.links["на сайте"].exists, "ссылка на тарифы — только текст")
        tap(app, "article.calculate")
        XCTAssertTrue(element(app, "screen.settings.body-goals").waitForExistence(timeout: 5), app.screenSummary)
    }

    func testArticleLinkOpensInApp() {
        let app = launch(["-uiTestOpenURL", "https://burcev.team/content/ostatok-vazhnee"])
        XCTAssertTrue(element(app, "article.title").waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(element(app, "article.title").label, "Почему остаток важнее съеденного")
    }

    func testCategoryChip() {
        let app = launch()
        app.tabBars.buttons["Статьи"].tap()
        tap(app, "articles.chip.recipes")
        XCTAssertTrue(element(app, "articles.chip.recipes").isSelected)
    }
}

// MARK: 5.4 Уведомления

final class NotificationsUITests: ClientUITestCase {
    // Сценарий «Открытие экрана»: открытие не трогает «Контент».
    func testOpeningDoesNotTouchContent() {
        let app = launch()
        tap(app, "header.notifications")
        XCTAssertTrue(element(app, "notification.n1").waitForExistence(timeout: 10), app.screenSummary)
        // Дольше 2 с на экране: «Основные» прочитаны, «Контент» — нет.
        RunLoop.current.run(until: Date().addingTimeInterval(3))
        XCTAssertEqual(element(app, "uitest.content.writes").label, "content.writes=0")
        let content = app.buttons["notifications.tab.content"]
        XCTAssertTrue(content.label.hasSuffix("· 1"), content.label)
    }

    // Сценарий «Задача от куратора»: «Сегодня» с подсвеченной задачей.
    func testTaskNotificationOpensTodayWithTask() {
        let app = launch()
        tap(app, "header.notifications")
        tap(app, "notification.n1")
        let task = app.buttons["task.t1"]
        XCTAssertTrue(task.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(task.value as? String, "Открыта из уведомления")
    }

    // Сценарий «Отзыв получен».
    func testWeeklyFeedbackFromNotification() {
        let app = launch()
        tap(app, "header.notifications")
        tap(app, "notification.n2")
        XCTAssertTrue(element(app, "screen.weeklyFeedback").waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertTrue(app.staticTexts["Отлично"].waitForExistence(timeout: 5), app.screenSummary)
        XCTAssertTrue(screenContains(app, "Хорошая неделя"))
        XCTAssertTrue(screenContains(app, "Добавьте овощей"))
    }

    func testReadAllOnlyOpenTab() {
        let app = launch()
        tap(app, "header.notifications")
        XCTAssertTrue(element(app, "notification.n1").waitForExistence(timeout: 10), app.screenSummary)
        app.buttons["notifications.readAll"].tap()
        RunLoop.current.run(until: Date().addingTimeInterval(1))
        XCTAssertEqual(element(app, "uitest.content.writes").label, "content.writes=0")
    }

    /// «Выполнено» в пуше тренировки: приложение на листе вида и длительности.
    func testWorkoutPushOpensSheet() {
        let app = launch(["-uiTestPushResponse", "workout"])
        XCTAssertTrue(element(app, "editor.kind").waitForExistence(timeout: 10), app.screenSummary)
    }
}

// MARK: 6.1–6.3 Профиль и настройки

final class SettingsUITests: ClientUITestCase {
    // Сценарий «Сохранение тела и целей».
    func testBodyGoalsSaveRecalculates() {
        let app = launch()
        openProfileSection(app, "body-goals")
        let field = self.field(app, "body.targetWeight")
        field.tap()
        field.typeText(XCUIKeyboardKey.delete.rawValue + XCUIKeyboardKey.delete.rawValue + "72")
        tap(app, "body.save")
        let result = element(app, "settings.result")
        XCTAssertTrue(result.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(result.label, "Нормы пересчитаны")
    }

    func testNameSaves() {
        let app = launch()
        openProfileSection(app, "name")
        tap(app, "name.save")
        XCTAssertTrue(element(app, "settings.result").waitForExistence(timeout: 10), app.screenSummary)
    }

    // Сценарий «Разрешение отклонено ранее».
    func testDeniedPermissionDisablesPushColumn() {
        let app = launch(["-uiTestPushPermission", "denied"])
        openProfileSection(app, "notifications")
        let button = app.buttons["notifications.permission"]
        XCTAssertTrue(button.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(button.label, "Открыть настройки")
        let push = element(app, "notifications.push.task_assigned")
        XCTAssertTrue(push.waitForExistence(timeout: 5), app.screenSummary)
        XCTAssertFalse(push.isEnabled, "колонка «Пуш» недоступна")
    }

    func testNotDeterminedPermissionAsks() {
        let app = launch(["-uiTestPushPermission", "notDetermined"])
        openProfileSection(app, "notifications")
        let button = app.buttons["notifications.permission"]
        XCTAssertTrue(button.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(button.label, "Разрешить")
        button.tap()
        XCTAssertTrue(element(app, "notifications.push.task_assigned").waitForExistence(timeout: 5))
        let enabled = NSPredicate(format: "isEnabled == true")
        expectation(for: enabled, evaluatedWith: element(app, "notifications.push.task_assigned"))
        waitForExpectations(timeout: 5)
        XCTAssertFalse(app.buttons["notifications.permission"].exists)
    }

    func testNotificationPreferencesSave() {
        let app = launch()
        openProfileSection(app, "notifications")
        tap(app, "notifications.save")
        XCTAssertTrue(element(app, "settings.result").waitForExistence(timeout: 10), app.screenSummary)
    }

    // Сценарий «Выгрузка готова».
    func testExportReadyOpensShareSheet() {
        let app = launch()
        openProfileSection(app, "export")
        tap(app, "export.download")
        let share = app.otherElements["ActivityListView"]
        let files = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "Файлы")).firstMatch
        XCTAssertTrue(share.waitForExistence(timeout: 10) || files.waitForExistence(timeout: 2), app.screenSummary)
    }

    func testExportTwiceADayShowsLimit() {
        let app = launch()
        openProfileSection(app, "export")
        tap(app, "export.request")
        let error = element(app, "settings.error")
        XCTAssertTrue(error.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(error.label, "Выгрузку можно запрашивать раз в сутки. Попробуйте завтра.")
    }

    // Сценарий «Удаление аккаунта через Apple без пароля».
    func testDeleteAccountWithoutPasswordUsesCode() {
        let app = launch(["-uiTestNoPassword"])
        openProfileSection(app, "delete")
        type(app, "delete.word", "УДАЛИТЬ")
        tap(app, "delete.sendCode")
        XCTAssertTrue(app.textFields["delete.code"].waitForExistence(timeout: 5), app.screenSummary)
        type(app, "delete.code", "482913")
        tap(app, "delete.submit")
        let message = element(app, "signIn.sessionEnded")
        XCTAssertTrue(message.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(message.label, "Аккаунт будет удалён 16 ноября. До этой даты удаление можно отменить, войдя снова")
    }

    func testDeleteAccountWithPassword() {
        let app = launch()
        openProfileSection(app, "delete")
        type(app, "delete.word", "УДАЛИТЬ")
        type(app, "delete.password", "Old-pass1!")
        tap(app, "delete.submit")
        XCTAssertTrue(element(app, "signIn.sessionEnded").waitForExistence(timeout: 10), app.screenSummary)
    }

    func testChangePassword() {
        let app = launch()
        openProfileSection(app, "password")
        type(app, "password.current", "Old-pass1!")
        type(app, "password.new", "New-pass2!")
        tap(app, "password.save")
        let result = element(app, "settings.result")
        XCTAssertTrue(result.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(result.label, "Пароль изменён")
    }

    // Сценарий «Выход».
    func testSignOutAsksThenShowsSignIn() {
        let app = launch()
        tap(app, "header.profile")
        tap(app, "profile.signOut")
        let alert = app.alerts["Выйти из аккаунта?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5), app.screenSummary)
        alert.buttons["Выйти"].tap()
        XCTAssertTrue(element(app, "screen.signIn").waitForExistence(timeout: 10), app.screenSummary)
    }

    // Сценарий «Тёмная тема».
    func testDarkAppearanceAppliesAtOnce() {
        let app = launch()
        tap(app, "header.profile")
        let picker = element(app, "profile.appearance")
        scrollTo(app, picker)
        picker.buttons["Тёмная"].tap()
        let scheme = element(app, "uitest.colorScheme")
        scrollTo(app, scheme)
        let dark = NSPredicate(format: "label == %@", "colorScheme=dark")
        expectation(for: dark, evaluatedWith: scheme)
        waitForExpectations(timeout: 5)
    }

    private func type(_ app: XCUIApplication, _ identifier: String, _ text: String) {
        let field = self.field(app, identifier)
        scrollTo(app, field)
        field.tap()
        field.typeText(text)
    }
}
