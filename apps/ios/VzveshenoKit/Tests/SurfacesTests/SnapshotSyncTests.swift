import API
@testable import Client
import Foundation
import Outbox
import Surfaces
import TestSupport
import XCTest

/// Снимок дня в App Group (задача 1.1, спека `ios-widgets`: «Приложение
/// обновляет виджеты после изменений»; `ios-session-storage`: выход стирает снимок).
@MainActor
final class SnapshotSyncTests: XCTestCase {
    private struct Harness {
        let model: TodayModel
        let sync: TodaySurfaceSync
        let publisher: SnapshotPublisher
        let repository: SnapshotRepository
        let reloader: CountingReloader
        let outbox: Outbox
    }

    private func harness(userID: Int64 = 7) -> Harness {
        let api = Fixture.api(Fixture.todayServer())
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api)
        let model = TodayModel(api: api, outbox: outbox, calendar: DayCalendar(timeZone: Fixture.moscow),
                               now: { Fixture.friday }, userID: { userID })
        let repository = SnapshotRepository(directory: Fixture.directory())
        let reloader = CountingReloader()
        let publisher = SnapshotPublisher(repository: repository, reloader: reloader)
        let sync = TodaySurfaceSync(publisher: publisher, outbox: outbox, userID: userID, timeZone: Fixture.moscow,
                                    now: { Fixture.friday })
        sync.attach(model)
        return Harness(model: model, sync: sync, publisher: publisher, repository: repository, reloader: reloader, outbox: outbox)
    }

    /// Загрузка «Сегодня» пишет снимок: остаток, макросы, вода, роль, пояс.
    func testLoadWritesTheSnapshotAndReloadsWidgets() async throws {
        let h = harness()
        await h.model.load()
        await h.sync.lastWrite?.value
        let stored = try XCTUnwrap(h.repository.load())
        XCTAssertEqual(stored.userID, 7)
        XCTAssertEqual(stored.role, "client")
        XCTAssertEqual(stored.date, Fixture.fridayKey)
        XCTAssertEqual(stored.timeZone, "Europe/Moscow")
        XCTAssertEqual(stored.nutrition?.remainingKcal, 1923)
        XCTAssertEqual(stored.nutrition?.goalKcal, 2472)
        XCTAssertEqual(stored.nutrition?.protein?.left, 49)
        XCTAssertEqual(stored.nutrition?.fat?.left, 31)
        XCTAssertEqual(stored.nutrition?.carbs?.left, 212)
        XCTAssertEqual(stored.water, DaySnapshot.Water(glasses: 5, goal: 8, enabled: true))
        XCTAssertEqual(h.reloader.count, 1)
    }

    /// Сценарий «Запись еды»: еда на 300 ккал — остаток в снимке меньше на 300
    /// и вызван `reloadAllTimelines`.
    func testLoggingFoodLowersRemainingAndReloads() async throws {
        let h = harness()
        await h.model.load()
        await h.sync.lastWrite?.value
        let before = try XCTUnwrap(h.repository.load()?.nutrition?.remainingKcal)
        let reloadsBefore = h.reloader.count

        h.model.applyDiaryTotals(day: Fixture.fridayKey, totals: Nutrition(calories: 849, protein: 76, fat: 49, carbs: 18))
        await h.sync.lastWrite?.value

        XCTAssertEqual(h.repository.load()?.nutrition?.remainingKcal, before - 300)
        XCTAssertEqual(h.reloader.count, reloadsBefore + 1)
    }

    /// Стакан в приложении — в снимке сразу.
    func testAddingWaterInTheAppUpdatesTheSnapshot() async throws {
        let h = harness()
        await h.model.load()
        await h.model.addGlass()
        await h.sync.lastWrite?.value
        XCTAssertEqual(h.repository.load()?.water?.glasses, 6)
    }

    /// Прошлый день в полосе недели снимок не трогает: виджет показывает сегодня.
    func testPastDayDoesNotOverwriteToday() async throws {
        let h = harness()
        await h.model.load()
        await h.sync.lastWrite?.value
        await h.model.select("2025-10-15")
        await h.sync.lastWrite?.value
        XCTAssertEqual(h.repository.load()?.date, Fixture.fridayKey)
    }

    /// Стаканы из виджета, ещё не отправленные, прибавляются к данным сервера.
    func testPendingWidgetGlassesAreCounted() async throws {
        let h = harness()
        let endpoint = try Endpoint.post("/api/v1/food-tracker/water", body: WaterRequest(date: Fixture.fridayKey, glasses: 1))
        // Сервер недоступен для очереди: изменение остаётся.
        try await h.outbox.enqueue(kind: PendingWater.kind, endpoint: endpoint, userID: 7)
        try await h.outbox.enqueue(kind: PendingWater.kind, endpoint: endpoint, userID: 8)
        h.sync.update(TodaySnapshot(day: try dayMetrics(), water: WaterDay(glasses: 5, goal: 8, enabled: true)),
                      date: Fixture.fridayKey)
        await h.sync.lastWrite?.value
        XCTAssertEqual(h.repository.load()?.water?.glasses, 6, "чужое изменение не считается")
    }

    /// Выход стирает снимок; загрузка, закончившаяся после выхода, его не
    /// возвращает (данных прежнего аккаунта в App Group нет).
    func testSignOutErasesAndLateWritesAreDropped() async throws {
        let h = harness()
        await h.model.load()
        await h.sync.lastWrite?.value
        XCTAssertNotNil(h.repository.load())

        h.publisher.erase()
        XCTAssertNil(h.repository.load())

        await h.model.load()
        await h.sync.lastWrite?.value
        XCTAssertNil(h.repository.load(), "запись после выхода не проходит")
    }

    /// Смена аккаунта: снимок прежнего стирается при входе нового, а запись
    /// прежнего не проходит.
    func testAnotherAccountCannotWrite() throws {
        let repository = SnapshotRepository(directory: Fixture.directory())
        let reloader = CountingReloader()
        let publisher = SnapshotPublisher(repository: repository, reloader: reloader)
        publisher.activate(userID: 7)
        XCTAssertTrue(publisher.publish(Fixture.snapshot(userID: 7)))

        publisher.activate(userID: 9)
        XCTAssertNil(repository.load(), "снимок прежнего аккаунта стёрт")
        XCTAssertFalse(publisher.publish(Fixture.snapshot(userID: 7)))
        XCTAssertNil(repository.load())
        XCTAssertTrue(publisher.publish(Fixture.snapshot(userID: 9)))
        XCTAssertEqual(repository.load()?.userID, 9)
    }

    /// Файл — JSON с полями дизайна; формат одинаков у приложения и расширения.
    func testSnapshotRoundTrip() throws {
        let snapshot = Fixture.snapshot()
        let data = try snapshot.encoded()
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["user_id", "role", "date", "time_zone", "updated_at", "nutrition", "water"])
        XCTAssertEqual(DaySnapshot.decode(data), snapshot)
    }

    private func dayMetrics() throws -> DailyMetrics {
        let json = #"{"id":"x","user_id":7,"date":"2025-10-17T00:00:00Z","calories":549,"protein":76,"fat":49,"carbs":18,"#
            + #""steps":0,"workout_completed":false}"#
        return try JSONDecoder.api.decode(DailyMetrics.self, from: Data(json.utf8))
    }
}
