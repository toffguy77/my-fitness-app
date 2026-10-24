#if DEBUG
import Client
import Foundation
import Navigation

/// Снимки для App Store (`scripts/screenshots.sh`): `-uiTestShot <экран>`
/// вместе с `-uiTestScenario client` открывает экран сразу после запуска и
/// включает данные витрины — полный день, три результата поиска, план на
/// четыре приёма. Без `-uiTestShot` сценарии UI-тестов отвечают как раньше.
///
/// Фото тарелки скрипт кладёт в контейнер приложения
/// (`Documents/uitest-media/plate.jpg`): оно не входит ни в одну сборку.
enum StoreShot: String {
    case today, addFood, photoResult, diary, chat, menu, articles, health

    static var current: StoreShot? {
        UITestScenario.argument("-uiTestShot").flatMap(StoreShot.init(rawValue:))
    }

    /// «гречка», порция 150 г — как на макете AddFood.png.
    static let searchQuery = "гречка"
    static let searchGrams = 150.0

    @MainActor
    func open(_ model: AppModel) async {
        await model.start()
        switch self {
        case .today: model.selectedTab = .today
        case .addFood: model.openFoodLog(.search, meal: .dinner)
        case .photoResult: model.openFoodLog(.photo, meal: .lunch)
        case .diary: model.selectedTab = .diary
        case .chat: model.open(ScreenLink.chat)
        case .menu: model.selectedTab = .menu
        case .articles: model.selectedTab = .articles
        case .health:
            model.selectedTab = .today
            model.paths[.today] = [.health]
        }
    }

    /// Файл из `Documents/uitest-media` контейнера приложения.
    static func media(_ name: String) -> Data? {
        guard current != nil, !name.contains("/"),
              let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
        return try? Data(contentsOf: documents.appendingPathComponent("uitest-media").appendingPathComponent(name))
    }

    /// Изображение сценария (`https://…/uitest/<имя>`) — из `uitest-media`,
    /// а не из сети.
    static func media(for url: URL) -> Data? {
        guard url.path.hasPrefix("/uitest/") else { return nil }
        return media(url.lastPathComponent)
    }
}

// MARK: Данные витрины

extension ScenarioTransport {
    /// Ответы витрины поверх обычных ответов сценария.
    func storeShotResponse(_ method: String, _ path: String) -> (Int, String)? {
        guard StoreShot.current != nil, method == "GET" || path == "/api/v1/food-tracker/recognize" else { return nil }
        let parts = path.split(separator: "/").map(String.init)
        switch path {
        case "/api/v1/food-tracker/search":
            return Self.ok(#"{"items":[\#(Self.buckwheat),\#(Self.buckwheatDry),\#(Self.buckwheatChicken)],"total":3}"#)
        case "/api/v1/food-tracker/recognize":
            return Self.ok(Self.plateRecognition)
        case "/api/v1/dashboard/week":
            return Self.ok(Self.json(["metrics": Self.pastWeek(), "count": 6]))
        case let plan where plan.hasPrefix("/api/v1/meal-plans/") && parts.count == 4:
            return Self.ok(Self.storePlan(parts[3]))
        default:
            return nil
        }
    }

    static let buckwheatDry = #"{"id":"p2","name":"Гречка ядрица","servingSize":100,"servingUnit":"g","#
        + #""nutritionPer100":{"calories":313,"protein":12.6,"fat":3.3,"carbs":62.1},"source":"openfoodfacts","#
        + #""barcode":"4600000000017"}"#
    static let buckwheatChicken = #"{"id":"u2","name":"Гречка с курицей","servingSize":300,"servingUnit":"g","#
        + #""nutritionPer100":{"calories":150,"protein":12,"fat":5,"carbs":14},"source":"user"}"#

    /// Курица, рис и горошек — то, что на фото тарелки.
    static let plateRecognition = #"{"foods":[{"name":"Курица с рисом и горошком","confidence":0.6,"estimated_weight":380,"#
        + #""nutrition":{"calories":140,"protein":16,"fat":2,"carbs":15}}],"composition":["#
        + #"{"name":"Куриная грудка запечённая","confidence":0.95,"estimated_weight":150,"#
        + #""nutrition":{"calories":152.7,"protein":30.7,"fat":3.3,"carbs":0}},"#
        + #"{"name":"Рис басмати","confidence":0.92,"estimated_weight":180,"#
        + #""nutrition":{"calories":127,"protein":2.7,"fat":0.3,"carbs":28}},"#
        + #"{"name":"Зелёный горошек","confidence":0.4,"estimated_weight":40,"#
        + #""nutrition":{"calories":81,"protein":5.4,"fat":0.4,"carbs":14.5}}],"#
        + #""success":true,"remaining_recognitions":2}"#

    /// Шесть прошедших дней: еда записана каждый день, вес — через день.
    static func pastWeek() -> [[String: Any]] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        let days: [(calories: Int, steps: Int, weight: Double?)] = [
            (2310, 8120, 78.6), (2405, 5230, nil), (2264, 11_040, 78.9), (2398, 7310, nil), (2452, 9480, 79.1), (2350, 6020, nil),
        ]
        return days.enumerated().compactMap { offset, day in
            guard let date = calendar.date(byAdding: .day, value: -(offset + 1), to: Date()) else { return nil }
            let parts = calendar.dateComponents([.year, .month, .day], from: date)
            let key = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
            var metric: [String: Any] = ["date": "\(key)T00:00:00Z", "calories": day.calories, "protein": 120, "fat": 75,
                                         "carbs": 230, "steps": day.steps, "workout_completed": offset % 3 == 1]
            if let weight = day.weight { metric["weight"] = weight }
            return metric
        }
    }

    private struct Dish {
        let meal, id, name: String
        let grams: Int
        /// Ккал, белки, жиры, углеводы.
        let nutrition: [Double]
        var eaten = false
        var locked = false
    }

    /// План дня на четыре приёма; завтрак съеден, ужин закреплён.
    static func storePlan(_ date: String) -> String {
        let target = [2472.0, 125, 80, 230]
        let dishes = [
            Dish(meal: "breakfast", id: "r1", name: "Сырники со сметаной и ягодами", grams: 230, nutrition: [520, 30, 20, 52],
                 eaten: true),
            Dish(meal: "lunch", id: "r3", name: "Куриная грудка с гречкой и овощами", grams: 380, nutrition: [690, 46, 22, 70]),
            Dish(meal: "dinner", id: "r4", name: "Запечённая треска с булгуром", grams: 420, nutrition: [760, 40, 26, 80],
                 locked: true),
            Dish(meal: "snack", id: "r5", name: "Греческий йогурт с орехами", grams: 200, nutrition: [380, 16, 16, 32]),
        ]
        func percent(_ value: [Double]) -> [String: Int] {
            let shares = (0..<4).map { Int((value[$0] / target[$0] * 100).rounded()) }
            return ["kcal": shares[0], "protein": shares[1], "fat": shares[2], "carbs": shares[3]]
        }
        func nutrition(_ value: [Double]) -> [String: Double] {
            ["kcal": value[0], "protein": value[1], "fat": value[2], "carbs": value[3]]
        }
        let totals = dishes.reduce(into: [0.0, 0, 0, 0]) { sum, dish in
            for index in 0..<4 { sum[index] += dish.nutrition[index] }
        }
        let items: [[String: Any]] = dishes.map { dish in
            ["meal_type": dish.meal, "recipe_id": dish.id, "recipe_version_id": "v-\(dish.id)", "name": dish.name,
             "photo_url": NSNull(), "grams": dish.grams, "portion_grams": dish.grams, "nutrition": nutrition(dish.nutrition),
             "percent_of_target": percent(dish.nutrition), "locked": dish.locked, "manual_grams": false, "unavailable": false,
             "eaten": dish.eaten, "eaten_grams": dish.eaten ? dish.grams as Any : NSNull(),
             "food_entry_id": dish.eaten ? "e-\(dish.id)" as Any : NSNull()]
        }
        let plan: [String: Any] = [
            "date": date, "meal_types": dishes.map(\.meal), "target_changed": false, "items": items, "empty": [] as [Any],
            "target": nutrition(target),
            "totals": nutrition(totals), "percent_of_target": percent(totals),
            "remaining": nutrition((0..<4).map { target[$0] - totals[$0] }),
            "calorie_split": ["protein": 26, "fat": 31, "carbs": 43], "deviations": [] as [Any],
        ]
        return json(plan)
    }
}
#endif
