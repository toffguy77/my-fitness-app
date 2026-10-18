import XCTest

/// «Записать еду», «Дневник» и «Меню» на заглушке API (задачи 3.1–3.5, 4.1–4.2, 4.5).
@MainActor
final class FoodUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", "client", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"] + extra
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func openTab(_ app: XCUIApplication, _ title: String) {
        let tab = app.tabBars.buttons[title]
        XCTAssertTrue(tab.waitForExistence(timeout: 10), app.screenSummary)
        tab.tap()
    }

    /// Прокрутить до элемента: экраны длиннее одного экрана.
    private func scrollTo(_ app: XCUIApplication, _ element: XCUIElement, swipes: Int = 6) {
        var count = 0
        while !(element.exists && element.isHittable) && count < swipes {
            app.swipeUp()
            count += 1
        }
    }

    // MARK: 3.1

    /// Ссылка `?add=barcode`: лист открыт на «Штрихкоде»; в симуляторе камеры
    /// нет — ручной ввод, код находит продукт.
    func testBarcodeLinkOpensSheetOnBarcode() {
        let app = launch(["-uiTestOpenURL", "https://new.burcev.team/food-tracker?add=barcode"])
        let barcode = element(app, "addFood.method.barcode")
        XCTAssertTrue(barcode.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertTrue(barcode.isSelected, "лист открыт на способе «Штрихкод»")
        let manual = app.textFields["barcode.manual"]
        XCTAssertTrue(manual.waitForExistence(timeout: 5), app.screenSummary)
        manual.tap()
        manual.typeText("4607012345678")
        app.buttons["barcode.find"].tap()
        let found = element(app, "scan.found")
        XCTAssertTrue(found.waitForExistence(timeout: 5), app.screenSummary)
        XCTAssertEqual(found.label, "Йогурт греческий 2%")
        XCTAssertTrue(app.buttons["scan.add"].label.contains("140"), app.buttons["scan.add"].label)
    }

    /// «Пустой ужин»: «Добавить» открывает лист с приёмом «Ужин».
    func testEmptyDinnerAddOpensSheetOnDinner() {
        let app = launch()
        openTab(app, "Дневник")
        let add = app.buttons["diary.add.dinner"]
        XCTAssertTrue(add.waitForExistence(timeout: 10), app.screenSummary)
        scrollTo(app, add)
        add.tap()
        let meal = element(app, "addFood.meal")
        XCTAssertTrue(meal.waitForExistence(timeout: 5), app.screenSummary)
        XCTAssertEqual(meal.label, "Приём пищи: Ужин")
    }

    // MARK: 3.4

    /// «Позиция без веса» в «Добавить N позиций» не входит.
    func testPhotoItemWithoutWeightIsNotAdded() {
        let app = launch()
        let photo = app.buttons["accessory.photo"]
        XCTAssertTrue(photo.waitForExistence(timeout: 10), app.screenSummary)
        photo.tap()
        app.buttons["photo.camera"].tap()
        let apply = app.buttons["photo.apply.0"]
        XCTAssertTrue(apply.waitForExistence(timeout: 10), app.screenSummary)
        let add = app.buttons["photo.add"]
        XCTAssertFalse(add.isEnabled, "без веса добавлять нечего")
        apply.tap()
        XCTAssertTrue(add.label.hasPrefix("Добавить 1 позицию в "), add.label)
        XCTAssertTrue(app.buttons["photo.apply.1"].exists, "рису вес не подставлен")
        add.tap()

        openTab(app, "Дневник")
        let chicken = app.staticTexts.matching(NSPredicate(format: "label == %@", "Куриная грудка запечённая"))
        let deadline = Date().addingTimeInterval(10)
        while chicken.count < 2 && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.25)) }
        XCTAssertEqual(chicken.count, 2, "к утренней грудке добавилась распознанная")
        XCTAssertFalse(app.staticTexts["Рис басмати"].exists, "позиция без веса не добавлена")
    }

    // MARK: 3.5

    /// «Добавление без сети»: запись в дневнике с «ждёт отправки», остаток на «Сегодня» уменьшен.
    func testAddingOfflineShowsPendingEntry() {
        let app = launch(["-uiTestFoodOffline"])
        let summary = element(app, "nutrition.summary")
        XCTAssertTrue(summary.waitForExistence(timeout: 10), app.screenSummary)
        app.buttons["accessory.search"].tap()
        let field = app.textFields["search.field"]
        XCTAssertTrue(field.waitForExistence(timeout: 5), app.screenSummary)
        field.tap()
        field.typeText("гр")
        let food = app.buttons["food.p1"]
        XCTAssertTrue(food.waitForExistence(timeout: 5), app.screenSummary)
        food.tap()
        XCTAssertEqual(element(app, "portion.kcal").label, "110 ккал")
        app.buttons["portion.add"].tap()

        XCTAssertTrue(summary.waitForExistence(timeout: 5))
        let remaining = NSPredicate(format: "label BEGINSWITH %@", "Осталось 1\u{00A0}813 ккал")
        expectation(for: remaining, evaluatedWith: summary)
        waitForExpectations(timeout: 10)

        openTab(app, "Дневник")
        XCTAssertTrue(app.staticTexts["Гречка отварная"].waitForExistence(timeout: 10), app.screenSummary)
        let pending = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "ждёт отправки")).firstMatch
        XCTAssertTrue(pending.waitForExistence(timeout: 5), app.screenSummary)
    }

    // MARK: 4.1

    /// «Ссылка на 15 октября»: «Дневник» показывает 15 октября.
    func testDiaryOpensDateFromLink() {
        let app = launch(["-uiTestOpenURL", "https://new.burcev.team/food-tracker?date=2026-10-15"])
        let date = app.staticTexts["diary.date"]
        XCTAssertTrue(date.waitForExistence(timeout: 10), app.screenSummary)
        let label = NSPredicate(format: "label ENDSWITH %@", "15 октября")
        expectation(for: label, evaluatedWith: date)
        waitForExpectations(timeout: 10)
    }

    // MARK: 4.2

    /// «Удаление с отменой»: запись на месте.
    func testDeleteWithUndoKeepsEntry() {
        let app = launch()
        openTab(app, "Дневник")
        let oatmeal = app.staticTexts["Овсянка на молоке"]
        XCTAssertTrue(oatmeal.waitForExistence(timeout: 10), app.screenSummary)
        // Правка записи → «Удалить» (свайп и контекстное меню ведут туда же).
        oatmeal.tap()
        let delete = app.buttons["editor.delete"]
        XCTAssertTrue(delete.waitForExistence(timeout: 5), app.screenSummary)
        delete.tap()
        let undo = app.buttons["diary.undo"]
        XCTAssertTrue(undo.waitForExistence(timeout: 3), app.screenSummary)
        XCTAssertFalse(app.staticTexts["Овсянка на молоке"].exists, "пропала сразу")
        undo.tap()
        XCTAssertTrue(app.staticTexts["Овсянка на молоке"].waitForExistence(timeout: 3))
        // Окно отмены прошло — запись всё ещё на месте.
        RunLoop.current.run(until: Date().addingTimeInterval(6))
        XCTAssertTrue(app.staticTexts["Овсянка на молоке"].exists)
    }

    /// «Убрать лишний стакан»: 5 → 4.
    func testRemoveAGlass() {
        let app = launch()
        openTab(app, "Дневник")
        let water = app.staticTexts["diary.water"]
        XCTAssertTrue(water.waitForExistence(timeout: 10), app.screenSummary)
        scrollTo(app, app.buttons["diary.water.minus"])
        XCTAssertTrue(water.label.contains("5 из 8"), water.label)
        app.buttons["diary.water.minus"].tap()
        XCTAssertTrue(water.label.contains("4 из 8"), water.label)
    }

    // MARK: «Меню»

    /// «Съел завтрак»: блюдо отмечено, запись — в «Дневнике». В заметке о
    /// бете — ни слова об оплате.
    func testEatFromMenuWritesDiaryEntry() {
        let app = launch()
        openTab(app, "Меню")
        let beta = element(app, "menu.beta")
        XCTAssertTrue(beta.waitForExistence(timeout: 10), app.screenSummary)
        for word in ["подписк", "оплат", "₽", "стоит"] {
            XCTAssertFalse(beta.label.lowercased().contains(word), "в заметке о бете «\(word)»: \(beta.label)")
        }
        let dish = app.staticTexts["menu.dish.breakfast"]
        XCTAssertTrue(dish.waitForExistence(timeout: 10), app.screenSummary)
        XCTAssertEqual(dish.label, "Сырники")
        XCTAssertTrue(app.staticTexts["menu.empty.lunch"].exists, "пустой обед назван")
        let eat = app.buttons["menu.eat.breakfast"]
        scrollTo(app, eat)
        eat.tap()
        let save = app.buttons["eat.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 5), app.screenSummary)
        save.tap()
        XCTAssertTrue(app.staticTexts["Съедено"].waitForExistence(timeout: 5), app.screenSummary)

        openTab(app, "Дневник")
        // 320 ккал утра + 420 ккал сырников.
        XCTAssertTrue(app.staticTexts["740 ккал"].waitForExistence(timeout: 10), app.screenSummary)
    }

    /// «Замена блюда».
    func testReplaceDishInMenu() {
        let app = launch()
        openTab(app, "Меню")
        let replace = app.buttons["menu.replace.breakfast"]
        XCTAssertTrue(replace.waitForExistence(timeout: 10), app.screenSummary)
        scrollTo(app, replace)
        replace.tap()
        let omelette = app.buttons["alternative.Омлет"]
        XCTAssertTrue(omelette.waitForExistence(timeout: 5), app.screenSummary)
        omelette.tap()
        let dish = app.staticTexts["menu.dish.breakfast"]
        let label = NSPredicate(format: "label == %@", "Омлет")
        expectation(for: label, evaluatedWith: dish)
        waitForExpectations(timeout: 10)
    }
}
