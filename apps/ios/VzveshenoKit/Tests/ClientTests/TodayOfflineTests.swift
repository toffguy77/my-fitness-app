import API
@testable import Client
import Foundation
import Outbox
import TestSupport
import XCTest

/// «Сегодня» без сети и быстрый запуск (`ios-offline-outbox`): сохранённый
/// день — в первом кадре, свежий — вместо него, изменения из очереди не
/// откатываются перечитанным днём.
@MainActor
final class TodayOfflineTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)
    nonisolated private static let friday = Date(timeIntervalSince1970: 1_760_691_600)
    nonisolated private let root = FileManager.default.temporaryDirectory.appendingPathComponent("today-offline-\(UUID().uuidString)")

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
    }

    /// Первый запуск с сетью наполняет кэш аккаунта 7.
    private func seed(_ cache: ScreenCache, user: Int64 = 7) async {
        let model = TodayModel(api: api(TodayModelTests.server()), outbox: nil, cache: cache, calendar: calendar,
                               now: { Self.friday }, userID: { user })
        await model.load()
        XCTAssertNil(model.updatedLabel, "свежий ответ — без подписи")
    }

    func testCachedDayIsShownInTheFirstFrameWithLabel() async {
        let cache = ScreenCache(root: root)
        await seed(cache)
        let model = TodayModel(api: api(StubTransport { _ in .offline }), outbox: nil, cache: cache, calendar: calendar,
                               now: { Self.friday.addingTimeInterval(3600) }, account: 7, userID: { 7 })
        // До любого обращения к сети.
        XCTAssertEqual(model.nutrition?.headline, "1\u{00A0}923")
        XCTAssertNotNil(model.updatedLabel)
        XCTAssertTrue(model.updatedLabel?.hasPrefix("Обновлено в ") == true, model.updatedLabel ?? "")
        XCTAssertFalse(model.offline, "показ кэша — ещё не «нет сети»")
    }

    func testFreshAnswerReplacesTheCache() async {
        let cache = ScreenCache(root: root)
        await seed(cache)
        let model = TodayModel(api: api(TodayModelTests.server()), outbox: nil, cache: cache, calendar: calendar,
                               now: { Self.friday }, account: 7, userID: { 7 })
        XCTAssertEqual(model.snapshot?.fromCache, true)
        await model.load()
        XCTAssertEqual(model.snapshot?.fromCache, false)
        XCTAssertNil(model.updatedLabel)
        XCTAssertFalse(model.offline)
    }

    func testFailureKeepsTheCacheAndShowsOffline() async {
        let cache = ScreenCache(root: root)
        await seed(cache)
        let model = TodayModel(api: api(StubTransport { _ in .offline }), outbox: nil, cache: cache, calendar: calendar,
                               now: { Self.friday }, account: 7, userID: { 7 })
        await model.load()
        XCTAssertEqual(model.nutrition?.headline, "1\u{00A0}923")
        XCTAssertNotNil(model.updatedLabel)
        XCTAssertTrue(model.offline)
        XCTAssertNil(model.loadError, "без сети с кэшем — не ошибка")
    }

    func testNoNetworkAndNoCacheIsAClearOfflineState() async {
        let model = TodayModel(api: api(StubTransport { _ in .offline }), outbox: nil, cache: ScreenCache(root: root),
                               calendar: calendar, now: { Self.friday }, account: 7, userID: { 7 })
        XCTAssertNil(model.snapshot)
        await model.load()
        XCTAssertNil(model.snapshot)
        XCTAssertTrue(model.offline)
        XCTAssertEqual(model.loadError, .network)
    }

    func testAnotherAccountsCacheIsNeverShown() async {
        let cache = ScreenCache(root: root)
        await seed(cache, user: 7)
        let model = TodayModel(api: api(StubTransport { _ in .offline }), outbox: nil, cache: cache, calendar: calendar,
                               now: { Self.friday }, account: 8, userID: { 8 })
        XCTAssertNil(model.snapshot)
        await model.load()
        XCTAssertNil(model.snapshot)
    }

    func testSignOutErasesTheCache() async {
        let cache = ScreenCache(root: root)
        await seed(cache)
        cache.eraseAll()
        let model = TodayModel(api: api(StubTransport { _ in .offline }), outbox: nil, cache: cache, calendar: calendar,
                               now: { Self.friday }, account: 7, userID: { 7 })
        XCTAssertNil(model.snapshot)
    }

    /// Вес, шаги, вода и задача без сети: перечитанный день (кэш) их не откатывает,
    /// и после перезапуска они на месте, пока очередь не дослана.
    func testOfflineChangesSurviveReloadAndRelaunch() async throws {
        let cache = ScreenCache(root: root)
        let online = TodayModelTests.server()
        let tasks = StubTransport { request in
            if request.path == "/api/v1/dashboard/tasks" {
                return .success(#"{"tasks":[{"id":"t1","title":"Силовая","type":"workout","due_date":"2025-10-20T00:00:00Z","#
                                + #""status":"active","recurrence":"once"}],"count":1,"week":0}"#)
            }
            return online.handle(request)
        }
        let store = InMemoryOutboxStore()
        let offline = LockedFlag(false)
        let transport = StubTransport { request in offline.value ? .offline : tasks.handle(request) }
        let outbox = Outbox(store: store, api: api(transport))
        let model = TodayModel(api: api(transport), outbox: outbox, cache: cache, calendar: calendar,
                               now: { Self.friday }, userID: { 7 })
        await model.load()
        offline.value = true

        await model.saveWeight(77.9)
        await model.saveSteps(9000)
        await model.addGlass()
        await model.completeTask("t1", workout: (kind: "strength", minutes: 45))
        await model.load()
        XCTAssertEqual(model.snapshot?.day.weight, 77.9)
        XCTAssertEqual(model.snapshot?.day.steps, 9000)
        XCTAssertEqual(model.snapshot?.water?.glasses, 6)
        XCTAssertEqual(model.snapshot?.tasks.first?.status, "completed")
        XCTAssertEqual(model.snapshot?.day.workoutTypes, ["strength"])

        // Перезапуск без сети: тот же кэш и та же очередь.
        let relaunched = TodayModel(api: api(transport), outbox: Outbox(store: store, api: api(transport)), cache: cache,
                                    calendar: calendar, now: { Self.friday }, account: 7, userID: { 7 })
        await relaunched.load()
        XCTAssertEqual(relaunched.snapshot?.day.weight, 77.9)
        XCTAssertEqual(relaunched.snapshot?.water?.glasses, 6)
        XCTAssertEqual(relaunched.snapshot?.tasks.first?.status, "completed")
        XCTAssertTrue(relaunched.offline)
        XCTAssertEqual(try store.pending().count, 4, "все четыре изменения ждут сети")
    }
}
