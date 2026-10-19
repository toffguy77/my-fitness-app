import XCTest

/// Сценарии `ios-curator-app` на заглушках куратора (`UITestScenario+Curator.swift`).
@MainActor
final class CuratorUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ scenario: String = "coordinator", _ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", scenario, "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"] + extra
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

    /// Элемент, в подписи которого есть текст (подписи карточек объединены для VoiceOver).
    private func labelled(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    /// Подсказка поля: у многострочного поля она бывает и в value.
    private func placeholder(_ field: XCUIElement) -> String? {
        field.placeholderValue ?? (field.value as? String)
    }

    private func scrollTo(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        let found = element(app, identifier)
        var swipes = 0
        while !(found.exists && found.isHittable) && swipes < 12 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(found.exists, "нет \(identifier): \(app.screenSummary)")
        return found
    }

    private func openCard(_ app: XCUIApplication, tab: String? = nil) {
        let url = "https://new.burcev.team/curator/clients/11" + (tab.map { "?tab=\($0)" } ?? "")
        app.terminate()
        app.launchArguments += ["-uiTestOpenURL", url]
        app.launch()
        XCTAssertTrue(element(app, "card.name").waitForExistence(timeout: 10), app.screenSummary)
    }

    // MARK: Клиенты

    // Сценарий «Поиск»: оба списка фильтруются по имени без учёта регистра.
    func testHubSearchFiltersBothLists() {
        let app = launch()
        _ = wait(app, "attention.11")
        XCTAssertTrue(element(app, "attention.12").exists)
        let search = wait(app, "hub.search")
        search.tap()
        search.typeText("мар")
        XCTAssertTrue(element(app, "attention.11").waitForExistence(timeout: 5), "Мария К. осталась")
        XCTAssertFalse(element(app, "attention.12").exists, "Игорь П. скрыт")
        XCTAssertTrue(scrollTo(app, "client.17").exists, "Марина Т. в «Остальных»")
        XCTAssertFalse(element(app, "client.16").exists, "Алексей В. скрыт")
    }

    // Сценарий «Алерт и сообщение у одного клиента»: одна строка, оба бейджа, открывается карточка.
    func testAttentionRowOpensCard() {
        let app = launch()
        let row = wait(app, "attention.11")
        XCTAssertTrue(row.label.contains("Калории: 2960 из 2240 (132%)"), row.label)
        XCTAssertTrue(row.label.contains("Непрочитанных сообщений: 2"), row.label)
        row.tap()
        XCTAssertTrue(element(app, "card.name").waitForExistence(timeout: 10), "открыта карточка, а не переписка")
    }

    // Сценарий «Бенчмарк недоступен»: сводка, внимание и клиенты на месте.
    func testBenchmarkFailureKeepsScreen() {
        let app = launch("coordinator", ["-uiTestBenchmarkDown"])
        _ = wait(app, "attention.11")
        XCTAssertTrue(element(app, "hub.summary.active").exists)
        XCTAssertFalse(element(app, "hub.benchmark").exists)
        XCTAssertFalse(element(app, "curator.loadFailed").exists)
    }

    // Свайп по клиенту — «Написать».
    func testSwipeWrite() {
        let app = launch()
        let row = wait(app, "attention.11")
        row.swipeLeft()
        let write = app.buttons["Написать"].firstMatch
        XCTAssertTrue(write.waitForExistence(timeout: 5), app.screenSummary)
        write.tap()
        XCTAssertTrue(element(app, "conversation.name").waitForExistence(timeout: 10), app.screenSummary)
    }

    // MARK: Карточка

    // Сценарий «Ссылка на отчёты».
    func testLinkOpensReportsTab() {
        let app = launch()
        openCard(app, tab: "reports")
        XCTAssertTrue(element(app, "report.r1").waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertTrue(element(app, "segment.reports").isSelected)
    }

    // «Обзор»: источник значений и запись куратора в дневнике.
    func testOverviewSourcesAndCuratorEntry() {
        let app = launch()
        openCard(app)
        XCTAssertTrue(labelled(app, "из Здоровья").waitForExistence(timeout: 5), app.screenSummary)
        let today = scrollTo(app, "card.diary.\(Self.today)")
        today.tap()
        XCTAssertTrue(scrollTo(app, "entry.byCurator").exists, "у записи по фото — «Добавлено куратором»")
    }

    // Ошибка сохранения цели возвращает прежнее значение и показывает «Не удалось сохранить».
    func testWaterGoalRollsBackOnError() {
        let app = launch("coordinator", ["-uiTestCuratorSaveFails"])
        openCard(app)
        let goal = wait(app, "card.waterGoal")
        XCTAssertEqual(goal.label, "8")
        app.buttons["Больше"].firstMatch.tap()
        XCTAssertTrue(app.alerts["Не удалось сохранить"].waitForExistence(timeout: 5), app.screenSummary)
        app.alerts.buttons["OK"].tap()
        XCTAssertEqual(element(app, "card.waterGoal").label, "8")
    }

    // Сценарий «Убрать цель по воде».
    func testRemoveWaterGoal() {
        let app = launch()
        openCard(app)
        wait(app, "card.waterGoal.remove").tap()
        let hidden = wait(app, "card.waterHidden", timeout: 5)
        XCTAssertEqual(hidden.label, "Блок воды скрыт у клиента. Задайте цель, чтобы включить.")
    }

    // Сценарий «Правка существующего плана» и подтверждение удаления.
    func testPlanEditLocksDatesAndDeleteAsks() {
        let app = launch()
        openCard(app, tab: "plan")
        wait(app, "plan.edit").tap()
        let start = wait(app, "plan.start", timeout: 5)
        XCTAssertFalse(start.isEnabled, "даты действующего плана недоступны")
        wait(app, "form.cancel").tap()
        wait(app, "plan.delete").tap()
        let alert = app.alerts["Удалить активный план?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Клиент останется без целей'")).firstMatch.exists)
        alert.buttons["Удалить"].tap()
        XCTAssertFalse(element(app, "plan.active").waitForExistence(timeout: 3))
    }

    // Сценарий «Еженедельная задача без дней».
    func testWeeklyTaskNeedsDays() {
        let app = launch()
        openCard(app, tab: "tasks")
        wait(app, "task.new").tap()
        let title = wait(app, "task.title", timeout: 5)
        title.tap()
        title.typeText("Вода до обеда")
        let save = wait(app, "form.save")
        XCTAssertTrue(save.isEnabled)
        let recurrence = wait(app, "task.recurrence")
        recurrence.tap()
        let weekly = app.buttons["Еженедельно"].firstMatch
        XCTAssertTrue(weekly.waitForExistence(timeout: 5), app.screenSummary)
        weekly.tap()
        XCTAssertFalse(save.isEnabled, "без дней «Готово» недоступна")
        wait(app, "task.day.1").tap()
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(labelled(app, "Вода до обеда").waitForExistence(timeout: 5), app.screenSummary)
    }

    // Сценарий «Без итога».
    func testFeedbackNeedsSummary() {
        let app = launch()
        openCard(app, tab: "reports")
        wait(app, "report.feedback.r1").tap()
        let send = wait(app, "form.save", timeout: 5)
        XCTAssertFalse(send.isEnabled)
        XCTAssertTrue(element(app, "feedback.summaryHint").exists)
        let summary = scrollTo(app, "feedback.summary")
        summary.tap()
        summary.typeText("Хорошая неделя")
        XCTAssertTrue(send.isEnabled)
        send.tap()
        XCTAssertTrue(labelled(app, "Обратная связь дана").waitForExistence(timeout: 5), app.screenSummary)
    }

    // MARK: Чаты

    // Сценарий «Переписки нет»: `404` — «не найдена» с переходом в карточку.
    func testConversationNotFound() {
        let app = launch("coordinator", ["-uiTestOpenURL", "https://new.burcev.team/curator/chat/99"])
        let notFound = wait(app, "conversation.notFound")
        XCTAssertEqual(notFound.label, "Переписка с клиентом не найдена")
        XCTAssertTrue(element(app, "conversation.openCard").exists)
    }

    func testChatsListOrder() {
        let app = launch()
        app.tabBars.buttons["Чаты"].tap()
        let maria = wait(app, "conversation.11")
        let alexey = wait(app, "conversation.16")
        XCTAssertLessThan(maria.frame.minY, alexey.frame.minY, "с непрочитанным — выше")
    }

    private func openFoodSheet(_ app: XCUIApplication) {
        let photo = wait(app, "food.enter.k2")
        photo.tap()
        XCTAssertTrue(element(app, "sheet.foodEntry").waitForExistence(timeout: 5), app.screenSummary)
    }

    private func fill(_ app: XCUIApplication, _ identifier: String, _ text: String) {
        let field = wait(app, identifier, timeout: 5)
        field.tap()
        field.typeText(text)
    }

    // Сценарий «Фото в 20:14» (приём «Ужин») и «Успех».
    func testFoodEntryFromPhoto() {
        let app = launch("coordinator", ["-uiTestOpenURL", "https://new.burcev.team/curator/chat/11"])
        openFoodSheet(app)
        XCTAssertTrue(element(app, "segment.dinner").isSelected, "фото в 20:14 — ужин")
        fill(app, "food.name", "Торт")
        fill(app, "food.weight", "180")
        fill(app, "food.calories", "684")
        fill(app, "food.protein", "9")
        fill(app, "food.fat", "45")
        fill(app, "food.carbs", "61")
        wait(app, "food.done").tap()
        XCTAssertTrue(labelled(app, "Записано в дневник · ужин").waitForExistence(timeout: 10), app.screenSummary)
    }

    // Ошибка сети оставляет лист открытым с введённым.
    func testFoodEntryKeepsInputOnError() {
        let app = launch("coordinator", ["-uiTestFoodEntryOffline", "-uiTestOpenURL", "https://new.burcev.team/curator/chat/11"])
        openFoodSheet(app)
        fill(app, "food.name", "Торт")
        fill(app, "food.weight", "180")
        fill(app, "food.calories", "684")
        fill(app, "food.protein", "9")
        fill(app, "food.fat", "45")
        fill(app, "food.carbs", "0")
        wait(app, "food.done").tap()
        XCTAssertTrue(element(app, "food.error").waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertTrue(element(app, "sheet.foodEntry").exists)
        XCTAssertEqual(element(app, "food.name").value as? String, "Торт")
    }

    // MARK: Заявки

    // «Без согласия писать нельзя» и «Переписка».
    func testLeadsConsentAndConversation() {
        let app = launch()
        app.tabBars.buttons["Заявки"].tap()
        _ = wait(app, "lead.l1")
        XCTAssertTrue(element(app, "lead.write.l1").exists)
        XCTAssertFalse(element(app, "lead.write.l3").exists, "без согласия кнопки нет")
        XCTAssertTrue(element(app, "lead.noConsent.l3").exists)
        XCTAssertTrue(labelled(app, "Параметры не заполнены · t.me").exists)
        wait(app, "lead.conversation.l2").tap()
        XCTAssertTrue(element(app, "support.subtitle").waitForExistence(timeout: 10), "открыт тред обращения")
    }

    // Сценарий «Заявку взял другой куратор».
    func testLeadAlreadyClaimed() {
        let app = launch("coordinator", ["-uiTestLeadConflict"])
        app.tabBars.buttons["Заявки"].tap()
        wait(app, "lead.handled.l1").tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 5), app.screenSummary)
        alert.buttons["OK"].tap()
        XCTAssertTrue(wait(app, "lead.handledBadge.l1", timeout: 5).exists)
    }

    // MARK: Обращения

    // Сценарий «Эскалация», подпись канала, «Повторить», «Закрыть».
    func testSupportThread() {
        let app = launch()
        app.tabBars.buttons["Обращения"].tap()
        let first = wait(app, "support.s1")
        XCTAssertTrue(first.label.contains("Ждёт ответа"), first.label)
        XCTAssertTrue(first.label.contains("Причина: вопрос про медицинские противопоказания"), first.label)
        first.tap()
        let reply = wait(app, "support.reply")
        XCTAssertEqual(placeholder(reply), "Ответ уйдёт в Telegram")
        XCTAssertTrue(element(app, "support.lead").exists)
        let retry = wait(app, "support.retry.o1")
        XCTAssertEqual(retry.label, "Не доставлено в Telegram · Повторить")
        retry.tap()
        XCTAssertFalse(element(app, "support.retry.o1").waitForExistence(timeout: 3), "после повтора подписи нет")
        wait(app, "support.close").tap()
        XCTAssertTrue(wait(app, "support.s2").exists, "вернулись к списку")
    }

    // Сценарий «Обращение с сайта».
    func testWebChannelCaption() {
        let app = launch()
        app.tabBars.buttons["Обращения"].tap()
        wait(app, "support.s2").tap()
        XCTAssertEqual(placeholder(wait(app, "support.reply")), "Ответ увидит посетитель сайта")
    }

    // MARK: Роли

    // 6.1: суперадмин — только «Заявки» и «Обращения», админка — в вебе.
    func testSuperAdminProfileLinksToWeb() {
        let app = launch("super_admin")
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
        XCTAssertEqual(app.tabBars.firstMatch.buttons.allElementsBoundByIndex.map(\.label), ["Заявки", "Обращения"])
        wait(app, "header.profile").tap()
        XCTAssertTrue(app.buttons["Админка — в веб-версии"].waitForExistence(timeout: 5), app.screenSummary)
        XCTAssertFalse(app.buttons["Статьи — в веб-версии"].exists)
    }

    func testCuratorProfileLinksArticlesToWeb() {
        let app = launch()
        wait(app, "header.profile").tap()
        XCTAssertTrue(app.buttons["Статьи — в веб-версии"].waitForExistence(timeout: 5), app.screenSummary)
        XCTAssertFalse(app.buttons["Админка — в веб-версии"].exists)
    }

    /// Сегодня по Москве — день дневника в сценарии.
    static var today: String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
