import API
@testable import Client
import Foundation
import Health
import Outbox
import TestSupport
import XCTest

/// Запись еды и воды в Здоровье — заглушка, которая помнит вызовы.
final class RecordingHealth: FoodHealthWriter, @unchecked Sendable {
    private let lock = NSLock()
    private var log: [String] = []

    var calls: [String] { lock.withLock { log } }

    func write(_ entry: DiaryEntryForHealth) async { lock.withLock { log.append("write:\(entry.id)") } }
    func delete(entryID: String) async { lock.withLock { log.append("delete:\(entryID)") } }
    func reconcileDay(_ day: String, entries: [DiaryEntryForHealth]) async {
        lock.withLock { log.append("reconcile:\(day):\(entries.map(\.id).joined(separator: ","))") }
    }
    func setWater(day: String, glasses: Int, glassMilliliters: Double, at date: Date) async {
        lock.withLock { log.append("water:\(day):\(glasses)") }
    }
}

/// «Дневник» (`ios-food-diary`, задачи 3.5, 4.1–4.2).
@MainActor
final class DiaryModelTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)
    /// 17 октября 2025, 13:20 по Москве.
    nonisolated private static let now = Date(timeIntervalSince1970: 1_760_696_400)

    final class Server: @unchecked Sendable {
        let lock = NSLock()
        var offline = false
        var glasses = 5
    }

    nonisolated static func transport(_ server: Server = Server()) -> StubTransport {
        StubTransport { request in
            if server.lock.withLock({ server.offline }) && request.method != "GET" { return .offline }
            switch request.path {
            case "/api/v1/food-tracker/entries":
                if request.method == "POST" {
                    return .success(#"{"id":"e9","foodId":"f9","foodName":"Гречка","mealType":"dinner","portionType":"grams","#
                                    + #""portionAmount":150,"nutrition":{"calories":165},"time":"13:20","date":"2025-10-17"}"#,
                                    status: 201)
                }
                return .success(#"{"entries":{"breakfast":[{"id":"e1","foodId":"f1","foodName":"Овсянка на молоке","#
                                + #""mealType":"breakfast","portionType":"grams","portionAmount":250,"#
                                + #""nutrition":{"calories":280,"protein":10,"fat":6,"carbs":45},"time":"08:10","#
                                + #""date":"2025-10-17T00:00:00Z"},{"id":"e2","foodId":"f2","foodName":"Кофе с молоком","#
                                + #""mealType":"breakfast","portionType":"milliliters","portionAmount":200,"#
                                + #""nutrition":{"calories":40,"protein":2,"fat":2,"carbs":3},"time":"08:12","date":"2025-10-17"}],"#
                                + #""lunch":[{"id":"e3","foodId":"f3","foodName":"Куриная грудка запечённая","mealType":"lunch","#
                                + #""portionType":"grams","portionAmount":150,"nutrition":{"calories":229,"protein":46,"fat":5,"#
                                + #""carbs":0},"time":"13:20","date":"2025-10-17"}],"dinner":[],"snack":[]},"#
                                + #""dailyTotals":{"calories":549,"protein":58,"fat":13,"carbs":48}}"#)
            case let path where path.hasPrefix("/api/v1/food-tracker/entries/"):
                return .success(#"{"success":true}"#)
            case "/api/v1/food-tracker/water":
                if request.method == "POST" {
                    let delta = (request.json?["glasses"] as? Int) ?? 1
                    server.lock.withLock { server.glasses += delta }
                }
                let glasses = server.lock.withLock { server.glasses }
                return .success(#"{"glasses":\#(glasses),"goal":8,"glass_size":250,"enabled":true}"#)
            case "/api/v1/dashboard/weekly-plan":
                return .success(#"{"plan":{"id":"p","calories_goal":2472,"protein_goal":125,"fat_goal":80,"carbs_goal":230,"#
                                + #""start_date":"2025-10-13","end_date":"2025-10-19"}}"#)
            case "/api/v1/nutrition-calc/targets":
                return .success(#"{"calories":2472,"protein":125,"fat":80,"carbs":230,"workout_bonus":0}"#)
            case "/api/v1/food-tracker/user-foods/clone":
                return .success(#"{"id":"u1","user_id":7,"name":"Овсянка на молоке","calories_per_100":112}"#, status: 201)
            default:
                return .error(404, code: "not_found")
            }
        }
    }

    private func makeModel(_ transport: StubTransport, sleeper: Sleeper = ManualSleeper(),
                           health: FoodHealthWriter? = nil) -> DiaryModel {
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api)
        return DiaryModel(api: api, outbox: outbox, calendar: calendar, sleeper: sleeper, health: health,
                          now: { Self.now }, userID: { 7 })
    }

    private var buckwheat: FoodItem {
        FoodItem(id: "f9", name: "Гречка отварная", per100: Nutrition(calories: 110, protein: 4, fat: 1, carbs: 21))
    }

    // MARK: 4.1

    func testDayByMealsTotalAndSource() async {
        let health = RecordingHealth()
        let model = makeModel(Self.transport(), health: health)
        await model.load()
        let state = model.state
        XCTAssertEqual(state.dayLabel, "Сегодня, 17 октября")
        XCTAssertEqual(state.meals.map(\.total), ["320 ккал", "229 ккал", "—", "—"])
        XCTAssertEqual(state.summary.headline, "1\u{00A0}923")
        XCTAssertEqual(state.normSource, "План куратора")
        XCTAssertEqual(state.waterLine, "5 из 8 · 250 мл")
        XCTAssertEqual(state.meals[0].rows[0].entry.date, "2025-10-17", "дата с временем приводится к дню")
        // Открыт день — записи сверены со Здоровьем.
        XCTAssertEqual(health.calls, ["reconcile:2025-10-17:e1,e2,e3"])
    }

    /// «Ссылка на 15 октября»: дневник показывает 15 октября.
    func testDateFromLink() async {
        let transport = Self.transport()
        let model = makeModel(transport)
        await model.select("2025-10-15")
        XCTAssertEqual(model.selected, "2025-10-15")
        XCTAssertEqual(model.state.dayLabel, "Среда, 15 октября")
        XCTAssertEqual(transport.requests(to: "/api/v1/food-tracker/entries").last?.query, "date=2025-10-15")
    }

    // MARK: 3.5 Добавление через очередь

    /// «Добавление без сети»: запись видна с отметкой «ждёт отправки»,
    /// остаток уменьшен, запрос — с Idempotency-Key.
    func testAddingOfflineShowsPendingEntryAndReducesRemaining() async {
        let server = Server()
        let transport = Self.transport(server)
        let model = makeModel(transport)
        await model.load()
        var totals: [Double] = []
        model.onTotalsChanged = { _, value in totals.append(value.calories) }

        server.lock.withLock { server.offline = true }
        await model.add(EntryDraft(food: buckwheat, meal: .dinner, date: "2025-10-17", portion: Portion(amount: 150)))

        let dinner = model.state.meals[2]
        XCTAssertEqual(dinner.rows.count, 1)
        XCTAssertTrue(dinner.rows[0].pending)
        XCTAssertEqual(dinner.rows[0].entry.nutrition.kcal, 165)
        XCTAssertEqual(totals.last ?? 0, 714, accuracy: 0.5)
        XCTAssertEqual(model.state.summary.headline, "1\u{00A0}758")

        let post = transport.requests(to: "/api/v1/food-tracker/entries").first { $0.method == "POST" }
        let key = post?.header("Idempotency-Key")
        XCTAssertNotNil(key)
        XCTAssertEqual(post?.json?["foodId"] as? String, "f9")
        XCTAssertEqual(post?.json?["mealType"] as? String, "dinner")
        XCTAssertEqual(post?.json?["portionAmount"] as? Double, 150)
        XCTAssertEqual(post?.json?["time"] as? String, "13:20")
        XCTAssertEqual(post?.json?["calories"] as? Double, 165)

        // Сеть вернулась: тот же ключ, запись принята, отметка снята.
        server.lock.withLock { server.offline = false }
        await model.flush()
        let posts = transport.requests(to: "/api/v1/food-tracker/entries").filter { $0.method == "POST" }
        XCTAssertEqual(Set(posts.compactMap { $0.header("Idempotency-Key") }), [key!])
        XCTAssertTrue(model.queued.isEmpty)
    }

    // MARK: 4.2 Удаление с отменой

    /// «Удаление с отменой»: отмена в 5 с — запись на месте, DELETE нет.
    func testUndoWithinFiveSecondsSendsNoDelete() async {
        let transport = Self.transport()
        let sleeper = ManualSleeper()
        let health = RecordingHealth()
        let model = makeModel(transport, sleeper: sleeper, health: health)
        await model.load()
        let oatmeal = model.state.meals[0].rows[0].entry

        await model.delete(oatmeal)
        XCTAssertEqual(model.state.meals[0].rows.map(\.id), ["e2"], "пропала сразу")
        await sleeper.waitForSleepers()
        await sleeper.advance(by: .seconds(4))
        model.undoDelete()
        await sleeper.advance(by: .seconds(10))
        await model.waitForDeletion()

        XCTAssertEqual(model.state.meals[0].rows.map(\.id), ["e1", "e2"])
        XCTAssertTrue(transport.requests.filter { $0.method == "DELETE" }.isEmpty)
        XCTAssertFalse(health.calls.contains("delete:e1"))
    }

    /// Без отмены — DELETE через 5 с и корреляция удалена из Здоровья.
    func testDeleteIsSentAfterFiveSeconds() async {
        let transport = Self.transport()
        let sleeper = ManualSleeper()
        let health = RecordingHealth()
        let model = makeModel(transport, sleeper: sleeper, health: health)
        await model.load()
        await model.delete(model.state.meals[0].rows[0].entry)
        await sleeper.waitForSleepers()
        await sleeper.advance(by: .milliseconds(4999))
        XCTAssertTrue(transport.requests.filter { $0.method == "DELETE" }.isEmpty)
        await sleeper.advance(by: .milliseconds(1))
        await model.waitForDeletion()
        let delete = transport.requests.first { $0.method == "DELETE" }
        XCTAssertEqual(delete?.path, "/api/v1/food-tracker/entries/e1")
        XCTAssertNotNil(delete?.header("Idempotency-Key"))
        XCTAssertTrue(health.calls.contains("delete:e1"))
    }

    /// Запись, ждущая отправки, удаляется из очереди: ни `POST`, ни `DELETE`.
    func testDeletingAQueuedEntryDiscardsIt() async {
        let server = Server()
        let transport = Self.transport(server)
        let sleeper = ManualSleeper()
        let model = makeModel(transport, sleeper: sleeper)
        await model.load()
        server.lock.withLock { server.offline = true }
        await model.add(EntryDraft(food: buckwheat, meal: .dinner, date: "2025-10-17", portion: Portion(amount: 150)))
        let pending = model.state.meals[2].rows[0].entry
        await model.delete(pending)
        await sleeper.waitForSleepers()
        await sleeper.advance(by: .seconds(5))
        await model.waitForDeletion()
        XCTAssertTrue(model.state.meals[2].rows.isEmpty)
        server.lock.withLock { server.offline = false }
        let before = transport.requests.filter { $0.method != "GET" }.count
        await model.flush()
        XCTAssertEqual(transport.requests.filter { $0.method != "GET" }.count, before, "в очереди ничего не осталось")
        XCTAssertTrue(transport.requests.filter { $0.method == "DELETE" }.isEmpty)
    }

    /// «Повторить вчерашний завтрак»: у сегодняшнего дня запись с той же едой и порцией.
    func testRepeatToday() async {
        let transport = Self.transport()
        let model = makeModel(transport)
        await model.select("2025-10-16")
        let entry = FoodEntry(id: "e1", foodID: "f1", foodName: "Овсянка на молоке", mealType: .breakfast, portionAmount: 250,
                              nutrition: Nutrition(calories: 280, protein: 10, fat: 6, carbs: 45), time: "08:10", date: "2025-10-16")
        await model.repeatToday(entry)
        let post = transport.requests(to: "/api/v1/food-tracker/entries").first { $0.method == "POST" }?.json
        XCTAssertEqual(post?["date"] as? String, "2025-10-17")
        XCTAssertEqual(post?["foodId"] as? String, "f1")
        XCTAssertEqual(post?["portionAmount"] as? Double, 250)
        XCTAssertEqual(post?["mealType"] as? String, "breakfast")
    }

    func testEditPutsAndWritesToHealth() async {
        let transport = Self.transport()
        let health = RecordingHealth()
        let model = makeModel(transport, health: health)
        await model.load()
        var entry = model.state.meals[0].rows[0].entry
        let per100 = entry.per100
        entry.portionAmount = 300
        entry.nutrition = per100.scaled(by: 3)
        await model.update(entry)
        let put = transport.requests.first { $0.method == "PUT" }
        XCTAssertEqual(put?.path, "/api/v1/food-tracker/entries/e1")
        XCTAssertEqual(put?.json?["portionAmount"] as? Double, 300)
        XCTAssertEqual((put?.json?["calories"] as? Double) ?? 0, 336, accuracy: 0.01)
        XCTAssertTrue(health.calls.contains("write:e1"))
    }

    func testSaveAsOwnClones() async {
        let transport = Self.transport()
        let model = makeModel(transport)
        await model.load()
        await model.saveAsOwn(model.state.meals[0].rows[0].entry)
        XCTAssertEqual(transport.requests(to: "/api/v1/food-tracker/user-foods/clone").first?.json?["source_food_id"] as? String, "f1")
        XCTAssertEqual(model.notice, "«Овсянка на молоке» сохранено в ваших продуктах.")
    }

    /// «Убрать лишний стакан»: 5 → 4, `glasses: -1`, в Здоровье — 4 стакана.
    func testRemoveAGlass() async {
        let transport = Self.transport()
        let health = RecordingHealth()
        let model = makeModel(transport, health: health)
        await model.load()
        await model.changeWater(by: -1)
        XCTAssertEqual(model.water?.glasses, 4)
        let post = transport.requests(to: "/api/v1/food-tracker/water").first { $0.method == "POST" }
        XCTAssertEqual(post?.json?["glasses"] as? Int, -1)
        XCTAssertNotNil(post?.header("Idempotency-Key"))
        XCTAssertTrue(health.calls.contains("water:2025-10-17:4"))
    }
}
