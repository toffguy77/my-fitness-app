import API
@testable import Client
import Foundation
import TestSupport
import XCTest

/// «Нутриенты» (4.3) и «Меню» (`ios-meal-plan`).
@MainActor
final class MealPlanAndNutrientsTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)
    nonisolated private static let now = Date(timeIntervalSince1970: 1_760_696_400)

    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
    }

    // MARK: Нутриенты

    nonisolated static let vitaminD = #"{"id":"d1","name":"Витамин D","category":"vitamins","unit":"mcg","is_weekly":false,"#
        + #""description":"Жирорастворимый витамин","benefits":"Кости и иммунитет","effects":"Слабость, ломкость костей","#
        + #""daily_target":15,"norm_needs_profile":false,"current_intake":4.2,"percentage":28,"#
        + #""intake_counted_entries":3,"intake_total_entries":5,"is_tracked":true,"sources":[]}"#

    /// «Детали нутриента»: норма, польза, «При недостатке», «посчитано по X из Y записей».
    func testNutrientDetailTexts() async throws {
        let detail = try JSONDecoder().decode(NutrientRecommendation.self, from: Data(Self.vitaminD.utf8))
        XCTAssertEqual(detail.normText, "Норма: 15 мкг в день")
        XCTAssertEqual(detail.progressText, "4,2 из 15 мкг")
        XCTAssertEqual(detail.coverageText, "посчитано по 3 из 5 записей")
        XCTAssertEqual(detail.benefits, "Кости и иммунитет")
        XCTAssertEqual(detail.effects, "Слабость, ломкость костей")
        XCTAssertEqual(detail.fraction, 0.28, accuracy: 0.001)

        let noNorm = NutrientRecommendation(id: "x", name: "Железо", category: "minerals", unit: "mg", dailyTarget: nil,
                                            normNeedsProfile: true)
        XCTAssertEqual(noNorm.normText, "Норма зависит от пола и возраста — укажите их в профиле.")
        XCTAssertEqual(noNorm.progressText, "потребление не считается")
    }

    func testRecommendationsSectionsInOrder() async throws {
        let json = #"{"daily":{"minerals":[\#(Self.vitaminD)],"vitamins":[\#(Self.vitaminD)],"lipids":[]},"weekly":[],"custom":[]}"#
        let answer = try JSONDecoder().decode(RecommendationsAnswer.self, from: Data(json.utf8))
        XCTAssertEqual(answer.sections.map(\.key), ["vitamins", "minerals"])
        XCTAssertEqual(RecommendationsAnswer.categoryTitle("plant"), "Растительность")
    }

    /// «Добавить рекомендацию»: название 2–50 символов, единицы г, мг, мкг, МЕ.
    func testCustomRecommendationBounds() async {
        XCTAssertNil(CustomRecommendationForm.validate(name: "К", target: "10"))
        XCTAssertNil(CustomRecommendationForm.validate(name: String(repeating: "а", count: 51), target: "10"))
        XCTAssertNil(CustomRecommendationForm.validate(name: "Коллаген", target: "0"))
        XCTAssertNotNil(CustomRecommendationForm.validate(name: "Коллаген", target: "10,5"))
        XCTAssertEqual(NutrientUnit.allCases.map(\.title), ["г", "мг", "мкг", "МЕ"])

        let transport = StubTransport { request in
            request.method == "POST" ? .success(#"{"id":"c1"}"#, status: 201) : .success(#"{"daily":{},"weekly":[]}"#)
        }
        let model = NutrientsModel(api: api(transport))
        let added = await model.addCustom(name: "Коллаген", target: "10", unit: .iu)
        XCTAssertTrue(added)
        let body = transport.requests(to: "/api/v1/food-tracker/recommendations/custom").first?.json
        XCTAssertEqual(body?["unit"] as? String, "IU")
        XCTAssertEqual(body?["daily_target"] as? Double, 10)
    }

    // MARK: Меню

    nonisolated static func planJSON(eaten: Bool = false, locked: Bool = false, recipe: String = "r1",
                                     targetChanged: Bool = false) -> String {
        #"{"date":"2025-10-17","meal_types":["breakfast","lunch"],"target":{"kcal":2472,"protein":125,"fat":80,"carbs":230},"#
            + #""target_changed":\#(targetChanged),"items":[{"meal_type":"breakfast","recipe_id":"\#(recipe)","recipe_version_id":"v","#
            + #""name":"Сырники","photo_url":null,"grams":180,"portion_grams":180,"nutrition":{"kcal":420,"protein":30,"fat":15,"#
            + #""carbs":40},"percent_of_target":{"kcal":17,"protein":24,"fat":19,"carbs":17},"locked":\#(locked),"#
            + #""manual_grams":false,"unavailable":false,"eaten":\#(eaten),"eaten_grams":null,"food_entry_id":null}],"#
            + #""empty":[{"meal_type":"lunch","reason":"no_recipes"}],"totals":{"kcal":420,"protein":30,"fat":15,"carbs":40},"#
            + #""percent_of_target":{"kcal":17,"protein":24,"fat":19,"carbs":17},"remaining":{"kcal":2052,"protein":95,"fat":65,"#
            + #""carbs":190},"calorie_split":{"protein":29,"fat":32,"carbs":38},"deviations":[{"nutrient":"protein","delta":-12}]}"#
    }

    final class PlanServer: @unchecked Sendable {
        let lock = NSLock()
        var targetMissing = false
    }

    nonisolated static func planTransport(_ server: PlanServer = PlanServer()) -> StubTransport {
        StubTransport { request in
            if server.lock.withLock({ server.targetMissing }) {
                return .error(409, code: "target_missing", params: #"{"missing":["weight"]}"#)
            }
            switch (request.method, request.path) {
            case ("GET", "/api/v1/meal-plans/2025-10-17"), ("POST", "/api/v1/meal-plans/2025-10-17/regenerate"),
                 ("POST", "/api/v1/meal-plans/2025-10-17/refit"):
                return .success(planJSON())
            case ("PUT", "/api/v1/meal-plans/2025-10-17/items/breakfast"):
                let locked = request.json?["locked"] as? Bool ?? false
                let recipe = request.json?["recipe_id"] as? String ?? "r1"
                return .success(planJSON(locked: locked, recipe: recipe))
            case ("GET", "/api/v1/meal-plans/2025-10-17/items/breakfast/alternatives"):
                return .success(#"{"items":[{"recipe_id":"r2","name":"Омлет","photo_url":null,"grams":200,"#
                                + #""nutrition":{"kcal":320,"protein":24,"fat":20,"carbs":5},"day_totals":{"kcal":320}}]}"#)
            case ("POST", "/api/v1/meal-plans/2025-10-17/items/breakfast/eat"):
                return .success(#"{"entry_id":"e77","plan":\#(planJSON(eaten: true))}"#, status: 201)
            case ("GET", "/api/v1/recipes"):
                return .success(#"{"items":[{"id":"r1","name":"Сырники","cook_minutes":25,"meal_types":["breakfast"],"#
                                + #""portion_grams":180,"per_portion":{"kcal":420,"protein":30,"fat":15,"carbs":40}}],"#
                                + #""total":1,"limit":20,"offset":0}"#)
            case ("POST", "/api/v1/recipes/r1/reject"):
                return StubResponse(status: 204)
            case ("GET", "/api/v1/shopping-list"):
                return .success(#"{"from":"2025-10-17","to":"2025-10-19","has_plans":true,"departments":[{"name":"Молочное","#
                                + #""items":[{"food_id":"t1","name":"Творог 5%","grams":400,"pieces":null,"piece_grams":null,"#
                                + #""quantity_text":"400 г"}]}],"at_home":["Соль"]}"#)
            case ("GET", "/api/v1/meal-plan-settings"):
                return .success(#"{"meal_types":["breakfast","lunch","dinner"]}"#)
            case ("PUT", "/api/v1/meal-plan-settings"):
                return .success(#"{"meal_types":["breakfast"]}"#)
            default:
                return .error(404, code: "not_found")
            }
        }
    }

    private func planModel(_ transport: StubTransport) -> MealPlanModel {
        MealPlanModel(api: api(transport), calendar: calendar, now: { Self.now })
    }

    /// «План дня»: блюда по приёмам, пустой приём, недобор назван числом.
    func testDayPlan() async {
        let model = planModel(Self.planTransport())
        await model.load()
        let plan = try? XCTUnwrap(model.plan)
        XCTAssertEqual(plan?.item(for: "breakfast")?.name, "Сырники")
        XCTAssertEqual(plan?.item(for: "breakfast")?.caption, "180 г · 420 ккал")
        XCTAssertEqual(plan?.empty.map(\.mealType), ["lunch"])
        XCTAssertEqual(plan?.deviationTexts, ["Белков меньше нормы на 12 г"])
        XCTAssertEqual(model.dayLabel, "Сегодня, 17 октября")
    }

    /// «Нет нормы»: 409 target_missing — подсказка, а не ошибка.
    func testTargetMissing() async {
        let server = PlanServer()
        server.targetMissing = true
        let model = planModel(Self.planTransport(server))
        await model.load()
        XCTAssertEqual(model.state, .targetMissing(["weight"]))
        XCTAssertEqual(MealPlanModel.missingText(["weight"]), "Чтобы собрать меню, нужна ваша норма. Для неё не хватает: замер веса.")
    }

    /// «Съел»: запись дневника создана, блюдо отмечено, дневник перечитан.
    func testEatWritesDiaryEntry() async {
        let transport = Self.planTransport()
        let model = planModel(transport)
        await model.load()
        var eaten: [String] = []
        model.onEaten = { day, entry in eaten.append("\(day):\(entry)") }
        let item = model.plan!.items[0]
        let done = await model.eat(item)
        XCTAssertTrue(done)
        XCTAssertEqual(eaten, ["2025-10-17:e77"])
        XCTAssertTrue(model.plan?.items[0].eaten ?? false)
        let body = transport.requests(to: "/api/v1/meal-plans/2025-10-17/items/breakfast/eat").first?.json
        XCTAssertEqual(body?["time"] as? String, "13:20")
        XCTAssertNil(body?["grams"], "вес плана — сервер подставит сам")
        _ = await model.eat(item, grams: 150)
        XCTAssertEqual(transport.requests(to: "/api/v1/meal-plans/2025-10-17/items/breakfast/eat").last?.json?["grams"] as? Double, 150)
    }

    /// «Замена блюда» и закрепление.
    func testReplaceAndLock() async {
        let transport = Self.planTransport()
        let model = planModel(transport)
        await model.load()
        let item = model.plan!.items[0]
        let alternatives = await model.alternatives(for: item)
        XCTAssertEqual(alternatives?.map(\.name), ["Омлет"])
        XCTAssertEqual(alternatives?.first?.caption, "200 г · 320 ккал · Б 24")
        await model.replace(item, with: alternatives![0])
        XCTAssertEqual(model.plan?.items[0].recipeID, "r2")
        await model.setLocked(item, true)
        XCTAssertTrue(model.plan?.items[0].locked ?? false)
        let puts = transport.requests(to: "/api/v1/meal-plans/2025-10-17/items/breakfast").map { $0.json ?? [:] }
        XCTAssertEqual(puts.first?["recipe_id"] as? String, "r2")
        XCTAssertEqual(puts.last?["locked"] as? Bool, true)
    }

    func testRegenerateAndRefit() async {
        let transport = Self.planTransport()
        let model = planModel(transport)
        await model.regenerate()
        await model.refit()
        XCTAssertEqual(transport.requests.map(\.path), ["/api/v1/meal-plans/2025-10-17/regenerate",
                                                        "/api/v1/meal-plans/2025-10-17/refit"])
        XCTAssertNotNil(model.plan)
    }

    /// «Рецепты»: поиск через 300 мс, «Не предлагать».
    func testRecipesSearchAndReject() async {
        let transport = Self.planTransport()
        let sleeper = ManualSleeper()
        let model = RecipeCatalogModel(api: api(transport), sleeper: sleeper)
        model.query = "сыр"
        await sleeper.waitForSleepers()
        XCTAssertTrue(transport.requests.isEmpty)
        await sleeper.advance(by: .milliseconds(300))
        await model.waitForLoad()
        XCTAssertEqual(model.recipes.map(\.caption), ["420 ккал · 25 мин"])
        XCTAssertTrue(transport.requests.first?.query?.contains("page_size=20") ?? false)
        let rejected = await model.reject("r1")
        XCTAssertTrue(rejected)
        XCTAssertTrue(model.recipes.isEmpty)
    }

    /// «Список покупок»: отметки на устройстве, «Поделиться» текстом.
    func testShoppingList() async {
        let marks = InMemoryShoppingMarks()
        let model = ShoppingModel(api: api(Self.planTransport()), marks: marks)
        await model.load()
        XCTAssertEqual(model.list?.shareText, "Молочное:\n— Творог 5%, 400 г\n\nОбычно есть дома: Соль")
        model.toggle("t1")
        XCTAssertEqual(ShoppingModel(api: api(Self.planTransport()), marks: marks).bought, ["t1"])
    }

    /// «Приёмы пищи»: последний не выключается.
    func testMealSettingsKeepAtLeastOne() async {
        let transport = Self.planTransport()
        let model = ShoppingModel(api: api(transport))
        await model.loadSettings()
        XCTAssertEqual(model.mealTypes, [.breakfast, .lunch, .dinner])
        model.setMeal(.lunch, enabled: false)
        model.setMeal(.dinner, enabled: false)
        model.setMeal(.breakfast, enabled: false)
        XCTAssertEqual(model.mealTypes, [.breakfast])
        let saved = await model.saveSettings()
        XCTAssertTrue(saved)
        XCTAssertEqual(transport.requests.last?.json?["meal_types"] as? [String], ["breakfast"])
    }
}
