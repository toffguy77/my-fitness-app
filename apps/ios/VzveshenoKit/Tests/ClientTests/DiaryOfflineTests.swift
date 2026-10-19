import API
@testable import Client
import Foundation
import Outbox
import TestSupport
import XCTest

/// «Дневник» без сети (`ios-offline-outbox`, «Открытие без сети») и общая
/// вода с «Сегодня».
@MainActor
final class DiaryOfflineTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)
    nonisolated private static let now = Date(timeIntervalSince1970: 1_760_696_400)
    nonisolated private let root = FileManager.default.temporaryDirectory.appendingPathComponent("diary-offline-\(UUID().uuidString)")

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
    }

    private func model(_ transport: StubTransport, cache: ScreenCache, store: OutboxStore = InMemoryOutboxStore(),
                       account: Int64? = 7, user: Int64 = 7) -> DiaryModel {
        DiaryModel(api: api(transport), outbox: Outbox(store: store, api: api(transport)), cache: cache, calendar: calendar,
                   sleeper: ManualSleeper(), now: { Self.now }, account: account, userID: { user })
    }

    private func seeded() async -> ScreenCache {
        let cache = ScreenCache(root: root)
        let online = model(DiaryModelTests.transport(), cache: cache, account: nil)
        await online.load()
        XCTAssertNil(online.updatedLabel)
        return cache
    }

    func testSavedDayIsShownAtOnceWithLabelAndOfflineBanner() async {
        let cache = await seeded()
        let diary = model(StubTransport { _ in .offline }, cache: cache)
        // Первый кадр — до сети.
        XCTAssertEqual(diary.state.meals.map(\.total), ["320 ккал", "229 ккал", "—", "—"])
        XCTAssertEqual(diary.updatedLabel, "Обновлено в 13:20")
        XCTAssertFalse(diary.offline)
        await diary.load()
        XCTAssertEqual(diary.state.meals.map(\.total), ["320 ккал", "229 ккал", "—", "—"])
        XCTAssertEqual(diary.updatedLabel, "Обновлено в 13:20")
        XCTAssertTrue(diary.offline)
        XCTAssertNil(diary.loadError)
        XCTAssertEqual(diary.state.waterLine, "5 из 8 · 250 мл")
    }

    func testFreshDayReplacesTheSavedOne() async {
        let cache = await seeded()
        let diary = model(DiaryModelTests.transport(), cache: cache)
        XCTAssertNotNil(diary.updatedLabel)
        await diary.load()
        XCTAssertNil(diary.updatedLabel)
        XCTAssertFalse(diary.offline)
    }

    func testNoNetworkAndNoCacheIsOfflineNotAnErrorLoop() async {
        let diary = model(StubTransport { _ in .offline }, cache: ScreenCache(root: root))
        await diary.load()
        XCTAssertNil(diary.day)
        XCTAssertTrue(diary.offline)
        XCTAssertEqual(diary.loadError, .network)
    }

    func testAnotherAccountNeverSeesTheSavedDay() async {
        let cache = await seeded()
        let diary = model(StubTransport { _ in .offline }, cache: cache, account: 8, user: 8)
        XCTAssertNil(diary.day)
        await diary.load()
        XCTAssertNil(diary.day)
        cache.eraseAll()
        XCTAssertNil(model(StubTransport { _ in .offline }, cache: cache).day, "выход стёр кэш")
    }

    /// Правка, удаление и стакан воды без сети — и после перезапуска без сети.
    func testOfflineEditsSurviveRelaunch() async throws {
        let cache = await seeded()
        let store = InMemoryOutboxStore()
        let offline = StubTransport { _ in .offline }
        let diary = model(offline, cache: cache, store: store)
        await diary.load()
        let coffee = try XCTUnwrap(diary.state.meals[0].rows.first { $0.entry.id == "e2" }?.entry)
        var edited = try XCTUnwrap(diary.state.meals[1].rows.first?.entry)
        edited.portionAmount = 300
        edited.nutrition = Nutrition(calories: 458, protein: 92, fat: 10, carbs: 0)
        await diary.update(edited)
        await diary.delete(coffee)
        await diary.commitPendingDeletion()
        await diary.changeWater(by: 1)

        let relaunched = model(offline, cache: cache, store: store)
        await relaunched.load()
        XCTAssertEqual(relaunched.state.meals.map(\.total), ["280 ккал", "458 ккал", "—", "—"])
        XCTAssertEqual(relaunched.state.waterLine, "6 из 8 · 250 мл")
        XCTAssertEqual(try store.pending().map(\.kind), ["diary.update", "diary.delete", "diary.water"])
    }

    /// «Съел» без сети: строка «ждёт отправки» из локального описания изменения.
    func testQueuedMenuEatIsAPendingRow() async throws {
        let store = InMemoryOutboxStore()
        let body = NewEntryBody(foodId: "", mealType: .breakfast, portionType: .grams, portionAmount: 180, time: "08:00",
                                date: "2025-10-17", foodName: "Сырники", nutrition: Nutrition(calories: 420, protein: 30, fat: 15, carbs: 40))
        try store.append(OutboxItem(userID: 7, kind: DiaryModel.eatKind, method: .post,
                                    path: "/api/v1/meal-plans/2025-10-17/items/breakfast/eat", body: Data("{}".utf8),
                                    preview: try JSONEncoder().encode(EatenPreview(entry: body))))
        let diary = model(StubTransport { _ in .offline }, cache: await seeded(), store: store)
        await diary.load()
        let row = try XCTUnwrap(diary.state.meals[0].rows.first { $0.entry.foodName == "Сырники" })
        XCTAssertTrue(row.pending)
        XCTAssertEqual(diary.state.meals[0].total, "740 ккал")
    }

    /// Вода одна на «Сегодня» и «Дневник»; Здоровье получает итог общего счётчика.
    func testWaterIsSharedWithTodayAndHealthGetsTheSharedCount() async throws {
        let server = DiaryModelTests.Server()
        let transport = DiaryModelTests.transport(server)
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api(transport))
        let health = RecordingHealth()
        let ledger = WaterLedger(outbox: outbox, health: health, now: { Self.now }, userID: { 7 })
        let diary = DiaryModel(api: api(transport), outbox: outbox, calendar: calendar, sleeper: ManualSleeper(),
                               now: { Self.now }, userID: { 7 })
        let today = TodayModel(api: api(TodayModelTests.server()), outbox: outbox, calendar: calendar, now: { Self.now },
                               userID: { 7 })
        diary.waterLedger = ledger
        today.waterLedger = ledger
        ledger.onChanged = { day, water in
            diary.applyWater(day: day, water)
            today.applyWater(day: day, water)
        }
        await today.load()
        await diary.load()
        XCTAssertEqual(today.snapshot?.water?.glasses, 5)

        await diary.changeWater(by: 1)
        XCTAssertEqual(today.snapshot?.water?.glasses, 6, "«+» в дневнике — на «Сегодня» сразу")
        await today.addGlass()
        XCTAssertEqual(diary.water?.glasses, 7, "«+» на «Сегодня» — в дневнике сразу")
        await diary.changeWater(by: -1)
        XCTAssertEqual(today.snapshot?.water?.glasses, 6)
        XCTAssertEqual(health.calls.filter { $0.hasPrefix("water:") },
                       ["water:2025-10-17:6", "water:2025-10-17:7", "water:2025-10-17:6"])
    }
}
