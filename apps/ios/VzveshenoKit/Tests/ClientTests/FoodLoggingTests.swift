import API
@testable import Client
import Foundation
import TestSupport
import XCTest

extension ManualSleeper: Sleeper {}

/// «Записать еду» (`ios-food-logging`, задачи 3.1–3.5).
@MainActor
final class FoodLoggingTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)

    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
    }

    // MARK: 3.1 Приём по часу

    func testMealByHourTable() async {
        let table: [(Int, MealType)] = [
            (0, .snack), (4, .snack), (5, .breakfast), (10, .breakfast), (11, .lunch), (13, .lunch), (15, .lunch),
            (16, .snack), (17, .dinner), (21, .dinner), (22, .snack), (23, .snack),
        ]
        for (hour, meal) in table {
            XCTAssertEqual(MealType.byHour(hour), meal, "час \(hour)")
        }
    }

    /// «13:20, кнопка камеры»: лист на «Фото» с приёмом «Обед».
    func testPhotoButtonAt1320OpensLunch() async {
        // 17 октября 2025, 13:20 по Москве.
        let moment = Date(timeIntervalSince1970: 1_760_696_400)
        let request = FoodLogRequest.make(method: .photo, now: moment, calendar: calendar)
        XCTAssertEqual(request.method, .photo)
        XCTAssertEqual(request.meal, .lunch)
        XCTAssertEqual(request.date, "2025-10-17")
        XCTAssertEqual(MealType.lunch.title, "Обед")
    }

    // MARK: 3.2 Поиск

    nonisolated private static func searchServer() -> StubTransport {
        StubTransport { request in
            switch request.path {
            case "/api/v1/food-tracker/search":
                return .success(#"{"items":[{"id":"12345","name":"Гречка отварная","servingSize":100,"servingUnit":"g","#
                                + #""nutritionPer100":{"calories":110,"protein":4,"fat":1,"carbs":21},"source":"database"}],"total":1}"#)
            case "/api/v1/food-tracker/recent":
                return .success(#"{"foods":[{"id":"u1","name":"Овсянка","nutritionPer100":{"calories":88}}]}"#)
            case "/api/v1/food-tracker/favorites":
                return .success(#"{"foods":[]}"#)
            case let path where path.hasPrefix("/api/v1/food-tracker/favorites/"):
                return .success(#"{"success":true}"#)
            default:
                return .error(404, code: "not_found")
            }
        }
    }

    /// «Два символа»: через 300 мс отправлен поиск по «гр»; одна буква — ничего.
    func testSearchStartsAtTwoCharactersAfter300ms() async {
        let transport = Self.searchServer()
        let sleeper = ManualSleeper()
        let model = FoodSearchModel(api: api(transport), sleeper: sleeper)

        model.query = "г"
        await sleeper.advance(by: .seconds(1))
        XCTAssertTrue(transport.requests(to: "/api/v1/food-tracker/search").isEmpty)
        XCTAssertTrue(model.showsSuggestions)

        model.query = "гр"
        await sleeper.waitForSleepers()
        await sleeper.advance(by: .milliseconds(299))
        XCTAssertTrue(transport.requests(to: "/api/v1/food-tracker/search").isEmpty, "раньше 300 мс")
        await sleeper.advance(by: .milliseconds(1))
        await model.waitForSearch()
        let searches = transport.requests(to: "/api/v1/food-tracker/search")
        XCTAssertEqual(searches.count, 1)
        XCTAssertEqual(URLComponents(string: "x?\(searches[0].query ?? "")")?.queryItems?.first { $0.name == "q" }?.value, "гр")
        XCTAssertEqual(model.results.map(\.name), ["Гречка отварная"])
        XCTAssertEqual(model.results.first?.id, "12345")
    }

    /// Новая буква в пределах 300 мс отменяет прежний поиск.
    func testTypingWithinDelaySendsOneRequest() async {
        let transport = Self.searchServer()
        let sleeper = ManualSleeper()
        let model = FoodSearchModel(api: api(transport), sleeper: sleeper)
        model.query = "гр"
        await sleeper.waitForSleepers()
        await sleeper.advance(by: .milliseconds(200))
        model.query = "гре"
        await sleeper.waitForSleepers()
        await sleeper.advance(by: .milliseconds(200))
        XCTAssertTrue(transport.requests(to: "/api/v1/food-tracker/search").isEmpty)
        await sleeper.advance(by: .milliseconds(100))
        await model.waitForSearch()
        let queries = transport.requests(to: "/api/v1/food-tracker/search").map { $0.query ?? "" }
        XCTAssertEqual(queries.count, 1)
        XCTAssertTrue(queries[0].contains("q=%D0%B3%D1%80%D0%B5"), queries[0])
    }

    /// Пустая строка — «Недавние» и «Избранное»; звезда добавляет и убирает.
    func testSuggestionsAndFavouriteStar() async {
        let transport = Self.searchServer()
        let model = FoodSearchModel(api: api(transport), sleeper: ManualSleeper())
        await model.loadSuggestions()
        XCTAssertEqual(model.recent.map(\.name), ["Овсянка"])
        let item = model.recent[0]
        await model.toggleFavorite(item)
        XCTAssertTrue(model.isFavorite(item))
        XCTAssertEqual(transport.requests(to: "/api/v1/food-tracker/favorites/u1").last?.method, "POST")
        await model.toggleFavorite(item)
        XCTAssertFalse(model.isFavorite(item))
        XCTAssertEqual(transport.requests(to: "/api/v1/food-tracker/favorites/u1").last?.method, "DELETE")
    }

    // MARK: 3.3 Штрихкод и кэш на 90 дней

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_760_691_600)
    }

    nonisolated private static let yogurt = #"{"id":"y1","name":"Йогурт греческий 2%","brand":"Теос","#
        + #""nutritionPer100":{"calories":66,"protein":7,"fat":2,"carbs":4},"source":"openfoodfacts","barcode":"4607012345678"}"#

    func testBarcodeCacheKeepsFoodFor90Days() async throws {
        let clock = Clock()
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("barcode-\(UUID().uuidString).json")
        let cache = BarcodeCache(url: file, now: { clock.now })
        let food = FoodItem(id: "y1", name: "Йогурт", per100: Nutrition(calories: 66, protein: 7, fat: 2, carbs: 4))
        cache.store(food, for: "4607012345678")

        clock.now += 89 * 24 * 3600
        // Переживает перезапуск: новый экземпляр читает файл.
        XCTAssertEqual(BarcodeCache(url: file, now: { clock.now }).food(for: "4607012345678"), food)
        clock.now += 2 * 24 * 3600
        XCTAssertNil(cache.food(for: "4607012345678"), "через 91 день кэш не отвечает")
        try? FileManager.default.removeItem(at: file)
    }

    func testBarcodeLookupUsesCacheAndDoesNotCacheMisses() async {
        let transport = StubTransport { request in
            switch request.path {
            case "/api/v1/food-tracker/barcode/4607012345678":
                return .success(#"{"found":true,"cached":false,"food":\#(Self.yogurt)}"#)
            default:
                return .success(#"{"found":false,"cached":false,"message":"Продукт не найден. Попробуйте ввести вручную."}"#)
            }
        }
        let service = BarcodeLookupService(api: api(transport), cache: BarcodeCache(url: nil))

        let first = await service.lookup("4607012345678")
        guard case let .found(food, cached) = first else { return XCTFail("\(first)") }
        XCTAssertEqual(food.name, "Йогурт греческий 2%")
        XCTAssertFalse(cached)
        let second = await service.lookup("4607012345678")
        XCTAssertEqual(second, .found(food, cached: true))
        XCTAssertEqual(transport.requests(to: "/api/v1/food-tracker/barcode/4607012345678").count, 1)

        // «Продукт не найден» — «Ввести вручную» с подставленным кодом; не кэшируется.
        let miss = await service.lookup("12345670")
        XCTAssertEqual(miss, .notFound(code: "12345670"))
        let again = await service.lookup("12345670")
        XCTAssertEqual(again, .notFound(code: "12345670"))
        XCTAssertEqual(transport.requests(to: "/api/v1/food-tracker/barcode/12345670").count, 2)
    }

    func testManualBarcodeIs8To14Digits() async {
        XCTAssertEqual(BarcodeInput.normalize("4607012345678"), "4607012345678")
        XCTAssertEqual(BarcodeInput.normalize(" 12345670 "), "12345670")
        XCTAssertNil(BarcodeInput.normalize("1234567"))
        XCTAssertNil(BarcodeInput.normalize("123456789012345"))
        XCTAssertNil(BarcodeInput.normalize("12345abc"))
    }

    // MARK: 3.4 Результат распознавания

    private var plate: Recognition {
        Recognition(
            foods: [RecognizedFood(name: "Курица с рисом", confidence: 0.4, estimatedWeight: 330,
                                   per100: Nutrition(calories: 140, protein: 18, fat: 2, carbs: 14))],
            composition: [
                RecognizedFood(name: "Куриная грудка запечённая", confidence: 0.95, estimatedWeight: 150,
                               per100: Nutrition(calories: 152.7, protein: 30.7, fat: 3.3, carbs: 0)),
                RecognizedFood(name: "Рис басмати", confidence: 0.92, estimatedWeight: 180,
                               per100: Nutrition(calories: 127, protein: 2.7, fat: 0.3, carbs: 28)),
                RecognizedFood(name: "Соус, похож на сливочный", confidence: 0.4, estimatedWeight: 30,
                               per100: Nutrition(calories: 300, protein: 2, fat: 30, carbs: 5)),
            ],
            remaining: 2)
    }

    /// «Позиция без веса» не входит в «Добавить N позиций».
    func testItemWithoutWeightIsNotAdded() async {
        var result = RecognitionResult(recognition: plate)
        XCTAssertTrue(result.addable.isEmpty, "вес не подставляется сам")
        XCTAssertEqual(result.addTitle(meal: .lunch), "Укажите вес позиций")

        result.applyEstimate(0)
        XCTAssertEqual(result.items[0].grams, 150)
        XCTAssertNil(result.items[1].grams)
        XCTAssertEqual(result.addable.map(\.food.name), ["Куриная грудка запечённая"])
        XCTAssertEqual(result.addTitle(meal: .lunch), "Добавить 1 позицию в обед")

        let drafts = result.drafts(meal: .lunch, date: "2025-10-17", stamp: 42)
        XCTAssertEqual(drafts.count, 1)
        XCTAssertEqual(drafts[0].foodID, "ai-42-0")
        XCTAssertEqual(drafts[0].nutrition.kcal, 229)

        result.applyEstimate(1)
        XCTAssertEqual(result.addTitle(meal: .lunch), "Добавить 2 позиции в обед")
        // Низкая уверенность: «Найти», а не вес.
        XCTAssertTrue(result.items[2].suggestsSearch)
        result.setGrams(2, 30)
        XCTAssertEqual(result.addable.count, 2)
    }

    func testConfidenceAndEstimateTexts() async {
        let result = RecognitionResult(recognition: plate)
        XCTAssertEqual(result.items.map(\.confidence.title), ["Высокая", "Высокая", "Низкая"])
        XCTAssertEqual(RecognitionConfidence(0.75).title, "Средняя")
        XCTAssertEqual(result.items[1].estimateText, "оценка 180 г")
        XCTAssertEqual(result.remainingText, "ещё 2 из 3 сегодня")
        // 150 г грудки + 180 г риса по оценке, соус не в счёт.
        XCTAssertEqual(result.estimatedTotal, 458)
    }

    /// «Дневной лимит»: текст лимита и кнопки «Найти вручную» и «Штрихкод».
    func testDailyLimitCode() async {
        let failure = RecognitionFailure(APIError.server(status: 429, code: "recognition_daily_limit", params: [:]))
        XCTAssertTrue(failure.isDailyLimit)
        XCTAssertTrue(failure.message.contains("закончились"))
        XCTAssertEqual(RecognitionFailure(APIError.server(status: 503, code: "feature_unavailable", params: [:])), .unavailable)
    }

    func testRecognitionDecodesPer100Nutrition() async throws {
        let json = #"{"foods":[{"name":"Блюдо","confidence":0.8,"estimated_weight":300,"#
            + #""nutrition":{"calories":120,"protein":10,"fat":4,"carbs":12}}],"composition":[],"success":true,"#
            + #""remaining_recognitions":1}"#
        let recognition = try JSONDecoder().decode(Recognition.self, from: Data(json.utf8))
        XCTAssertEqual(recognition.parts.count, 1, "без состава — блюдо целиком")
        XCTAssertEqual(recognition.parts[0].per100.calories, 120)
        XCTAssertEqual(recognition.remaining, 1)
    }

    // MARK: 3.5 Порция

    /// «150 граммов гречки»: 110 ккал на 100 г × 150 г = 165 ккал.
    func testPortionRecalculation() async {
        let buckwheat = Nutrition(calories: 110, protein: 4, fat: 1, carbs: 21)
        let portion = Portion(unit: .grams, amount: 150)
        XCTAssertEqual(portion.nutrition(per100: buckwheat).kcal, 165)
        XCTAssertEqual(portion.nutrition(per100: buckwheat).protein, 6, accuracy: 0.001)
        XCTAssertEqual(Portion(unit: .portion, amount: 1.5, servingGrams: 200).nutrition(per100: buckwheat).kcal, 330)
    }

    func testPortionBoundsAndQuickValues() async {
        XCTAssertEqual(PortionUnit.grams.quick, [100, 150, 200, 250])
        XCTAssertEqual(PortionUnit.milliliters.quick, [200, 250, 330, 500])
        XCTAssertEqual(PortionUnit.grams.range, 1...2000)
        XCTAssertEqual(PortionUnit.portion.range, 0.5...10)
        XCTAssertEqual(PortionUnit.portion.wheel.first, 0.5)
        XCTAssertEqual(PortionUnit.portion.wheel.count, 20)
        XCTAssertEqual(Portion.clamp(2500, unit: .grams), 2000)
        XCTAssertEqual(Portion.clamp(0.7, unit: .portion), 0.5)
        XCTAssertFalse(Portion(unit: .grams, amount: 0).isValid)
        XCTAssertEqual(PortionUnit.portion.label(0.5), "0,5 порц.")
    }

    func testManualFoodForm() async {
        XCTAssertNotNil(ManualFoodForm.validate(name: "Сырники", calories: "220", protein: "15,5", fat: "", carbs: "20"))
        XCTAssertNil(ManualFoodForm.validate(name: " ", calories: "220", protein: "", fat: "", carbs: ""))
        XCTAssertNil(ManualFoodForm.validate(name: "Вода", calories: "0", protein: "", fat: "", carbs: ""),
                     "сервер не принимает нулевые калории")
    }

    func testFoodItemDecodesNumericIDAndSubtitle() async throws {
        let json = #"{"id":12345,"name":"Гречка","nutritionPer100":{"calories":110,"protein":4,"fat":1,"carbs":21}}"#
        let food = try JSONDecoder().decode(FoodItem.self, from: Data(json.utf8))
        XCTAssertEqual(food.id, "12345")
        XCTAssertEqual(food.subtitle, "110 ккал на 100 г · Б 4 · Ж 1 · У 21")
    }
}
