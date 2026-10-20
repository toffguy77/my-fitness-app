import API
import Foundation
@testable import Health
import Outbox
import TestSupport
import XCTest

/// Часы теста: время двигается руками.
final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date

    init(_ start: Date) {
        current = start
    }

    var now: Date { lock.withLock { current } }

    func advance(days: Double) {
        lock.withLock { current = current.addingTimeInterval(days * 86_400) }
    }
}

/// Кто вошёл: тест меняет его посреди сценария.
final class SignedInUser: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Int64?

    init(_ id: Int64?) {
        current = id
    }

    var id: Int64? {
        get { lock.withLock { current } }
        set { lock.withLock { current = newValue } }
    }
}

/// 4.2–4.5 на подделке Здоровья и настоящей очереди с заглушкой сервера.
final class HealthSyncTests: XCTestCase {
    private let moscow = TimeZone(identifier: "Europe/Moscow")!
    private let userID: Int64 = 7

    private struct Harness {
        let health: InMemoryHealthStore
        let outbox: Outbox
        let transport: StubTransport
        let state: InMemoryHealthStateStore
        let clock: TestClock
        let signedIn: SignedInUser
        let sync: HealthSync
    }

    private func make(now: Date = ISO8601DateFormatter().date(from: "2026-10-17T09:00:00Z")!,
                      health: HealthStore = InMemoryHealthStore(),
                      state: InMemoryHealthStateStore = InMemoryHealthStateStore(),
                      drains: Bool = false,
                      respond: @escaping StubTransport.Handler = { _ in .success("{}") }) -> Harness {
        let transport = StubTransport(handler: respond)
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios/1.0.0/1", transport: transport)
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api)
        let clock = TestClock(now)
        let signedIn = SignedInUser(userID)
        let sync = HealthSync(store: health, outbox: outbox, stateStore: state, now: { clock.now },
                              currentUser: { signedIn.id }, drain: { id in
                                  if drains { await outbox.drain(userID: id) }
                              })
        let fake = (health as? InMemoryHealthStore) ?? (health as? GatedHealthStore)?.inner ?? InMemoryHealthStore()
        return Harness(health: fake, outbox: outbox, transport: transport, state: state, clock: clock,
                       signedIn: signedIn, sync: sync)
    }

    private var profile: ProfileCalendar { ProfileCalendar(timeZone: moscow) }

    private func importedItems(_ outbox: Outbox) async throws -> [[String: Any]] {
        try await outbox.pending().filter { $0.kind == HealthSync.importKind }.flatMap { item -> [[String: Any]] in
            let body = try JSONSerialization.jsonObject(with: item.body ?? Data()) as? [String: Any]
            return body?["items"] as? [[String: Any]] ?? []
        }
    }

    // MARK: 4.1 / спека: признак раньше первой пачки

    // Сценарий «Подключение»: PUT /users/settings {apple_health_enabled: true}
    // уходит раньше первого POST /health/import.
    func testConnectSendsSettingsBeforeFirstImport() async throws {
        let health = InMemoryHealthStore()
        let today = profile.startOfDay(make().clock.now)
        health.setSteps(6_412, day: today)
        let harness = make(health: health, drains: true)

        let connected = try await harness.sync.connect(userID: userID)
        XCTAssertTrue(connected)
        XCTAssertEqual(health.authorizationRequests, 1)
        XCTAssertTrue(health.isObserving)

        let requests = harness.transport.requests.map { "\($0.method) \($0.path)" }
        XCTAssertEqual(requests, ["PUT /api/v1/users/settings", "POST /api/v1/health/import"])
        XCTAssertEqual(harness.transport.requests.first?.json?["apple_health_enabled"] as? Bool, true)
        let pending = try await harness.outbox.pending()
        XCTAssertTrue(pending.isEmpty)
    }

    func testConnectWithoutHealthDoesNotAsk() async throws {
        let health = InMemoryHealthStore(available: false)
        let harness = make(health: health)
        let connected = try await harness.sync.connect(userID: userID)
        XCTAssertFalse(connected)
        XCTAssertEqual(health.authorizationRequests, 0)
        let pending = try await harness.outbox.pending()
        XCTAssertTrue(pending.isEmpty)
    }

    // MARK: 4.3 первая загрузка

    // Сценарий «Годовая история шагов»: шаги за 400 дней — отправлены 90.
    func testBackfillSendsOnlyNinetyDaysInBatchesOfFiveHundred() async throws {
        let health = InMemoryHealthStore()
        let now = make().clock.now
        let today = profile.startOfDay(now)
        for offset in 0..<400 {
            let day = profile.calendar.date(byAdding: .day, value: -offset, to: today)!
            health.setSteps(Double(5_000 + offset), day: day)
            if offset < 200 {
                // Два взвешивания в день и по три тренировки: больше 500 записей.
                health.addWeight(WeightSample(date: day.addingTimeInterval(7 * 3600), kilograms: 80))
                health.addWeight(WeightSample(date: day.addingTimeInterval(20 * 3600), kilograms: 81))
                for hour in [8, 12, 18] {
                    health.addWorkout(WorkoutSample(id: UUID(), start: day.addingTimeInterval(Double(hour) * 3600),
                                                    duration: 1_800, activity: "running"))
                }
            }
        }
        let harness = make(health: health)
        try await harness.sync.connect(userID: userID)

        let pending = try await harness.outbox.pending()
        XCTAssertEqual(pending.first?.kind, HealthSync.settingsKind, "признак — первым в очереди")
        let batches = pending.filter { $0.kind == HealthSync.importKind }
        let sizes = try batches.map { item -> Int in
            let body = try JSONSerialization.jsonObject(with: item.body ?? Data()) as? [String: Any]
            return (body?["items"] as? [Any])?.count ?? 0
        }
        // 90 дней шагов + 90 весов + 270 тренировок.
        XCTAssertTrue(sizes.allSatisfy { $0 <= 500 }, "\(sizes)")
        XCTAssertEqual(sizes.reduce(0, +), 90 + 90 + 270)

        let items = try await importedItems(harness.outbox)
        let stepDates = items.filter { $0["kind"] as? String == "steps" }.compactMap { $0["date"] as? String }
        XCTAssertEqual(stepDates.count, 90)
        let oldest = profile.dateString(profile.calendar.date(byAdding: .day, value: -89, to: today)!)
        XCTAssertEqual(stepDates.min(), oldest)
        XCTAssertEqual(stepDates.max(), profile.dateString(today))
        let weights = items.filter { $0["kind"] as? String == "weight" }
        XCTAssertEqual(weights.count, 90)
        XCTAssertTrue(weights.allSatisfy { $0["value_kg"] as? Double == 80 }, "первое взвешивание дня")
    }

    func testBackfillOverFiveHundredSplitsIntoBatches() async throws {
        let health = InMemoryHealthStore()
        let today = profile.startOfDay(make().clock.now)
        for offset in 0..<90 {
            let day = profile.calendar.date(byAdding: .day, value: -offset, to: today)!
            for hour in 6..<13 {
                health.addWorkout(WorkoutSample(id: UUID(), start: day.addingTimeInterval(Double(hour) * 3600),
                                                duration: 900, activity: "yoga"))
            }
        }
        let harness = make(health: health)
        try await harness.sync.connect(userID: userID)
        let batches = try await harness.outbox.pending().filter { $0.kind == HealthSync.importKind }
        let sizes = try batches.map { item -> Int in
            let body = try JSONSerialization.jsonObject(with: item.body ?? Data()) as? [String: Any]
            return (body?["items"] as? [Any])?.count ?? 0
        }
        XCTAssertEqual(sizes, [500, 130])
    }

    // MARK: 4.2 наблюдатели и якоря

    func testObserverEventsSendOnlyNewDataAndKeepAnchors() async throws {
        let health = InMemoryHealthStore()
        let state = InMemoryHealthStateStore()
        let harness = make(health: health, state: state)
        try await harness.sync.connect(userID: userID)
        let afterBackfill = try await harness.outbox.pending().count
        XCTAssertEqual(state.load().anchors.count, 3, "якоря всех трёх видов сохранены")

        // Весы записали 78,4 кг в 07:42, приложение в фоне.
        let morning = ISO8601DateFormatter().date(from: "2026-10-17T04:42:00Z")!
        health.addWeight(WeightSample(date: morning, kilograms: 78.4))
        await health.fire(.weight)
        var items = try await importedItems(harness.outbox)
        XCTAssertEqual(items.last?["kind"] as? String, "weight")
        XCTAssertEqual(items.last?["date"] as? String, "2026-10-17")
        XCTAssertEqual(items.last?["value_kg"] as? Double, 78.4)

        // Ничего нового — ничего в очередь.
        await health.fire(.weight)
        await health.fire(.workouts)
        let afterQuiet = try await harness.outbox.pending().count
        XCTAssertEqual(afterQuiet, afterBackfill + 1)

        // Тренировка добавлена, затем удалена в Здоровье.
        let workout = WorkoutSample(id: UUID(), start: morning.addingTimeInterval(3600), duration: 2_700, activity: "running")
        health.addWorkout(workout)
        await health.fire(.workouts)
        health.deleteWorkout(workout.id)
        await health.fire(.workouts)
        items = try await importedItems(harness.outbox)
        XCTAssertEqual(items.suffix(2).map { $0["kind"] as? String }, ["workout", "workout_deleted"])
        XCTAssertEqual(items.last?["external_id"] as? String, workout.id.uuidString)

        // Новые шаги за сегодня: сумма дня из статистики.
        health.setSteps(6_412, day: profile.startOfDay(morning), sampleAt: morning)
        await health.fire(.steps)
        items = try await importedItems(harness.outbox)
        XCTAssertEqual(items.last?["kind"] as? String, "steps")
        XCTAssertEqual(items.last?["value"] as? Double, 6_412)
    }

    // Перезапуск (в том числе фоновый): якоря из хранилища, без повторной
    // первой загрузки.
    func testRelaunchResumesFromStoredAnchors() async throws {
        let health = InMemoryHealthStore()
        let state = InMemoryHealthStateStore()
        let first = make(health: health, state: state)
        health.setSteps(5_000, day: profile.startOfDay(first.clock.now))
        try await first.sync.connect(userID: userID)

        let relaunched = make(health: health, state: state)
        await relaunched.sync.resume(userID: userID)
        let pending = try await relaunched.outbox.pending()
        XCTAssertTrue(pending.isEmpty, "якоря сохранены: старое не отправляется заново")
        XCTAssertTrue(health.isObserving, "наблюдатели зарегистрированы заново")

        // Другой аккаунт на устройстве: подключение прежнего стирается.
        await relaunched.sync.resume(userID: 8)
        let stillConnected = await relaunched.sync.isConnected
        XCTAssertFalse(stillConnected)
    }

    func testFileStateSurvivesRelaunch() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("health-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: url) }
        var state = HealthState()
        state.connected = true
        state.userID = 7
        state.anchors[.weight] = Data("42".utf8)
        state.timeZoneID = "Asia/Yekaterinburg"
        try FileHealthStateStore(url: url).save(state)
        XCTAssertEqual(FileHealthStateStore(url: url).load(), state)
        FileHealthStateStore(url: url).erase()
        XCTAssertEqual(FileHealthStateStore(url: url).load(), HealthState())
    }

    // MARK: 4.4 запись еды и воды

    private func oatmeal(kcal: Double = 320) -> DiaryEntryForHealth {
        DiaryEntryForHealth(id: "42", date: ISO8601DateFormatter().date(from: "2026-10-17T05:30:00Z")!,
                            name: "Овсянка на молоке", kilocalories: kcal, protein: 12, fat: 8, carbohydrates: 50)
    }

    func testFoodEditIncreasesVersionAndDeleteRemoves() async throws {
        let harness = make()
        try await harness.sync.connect(userID: userID)

        await harness.sync.write(oatmeal())
        XCTAssertEqual(harness.health.food["entry:42"]?.version, 1)
        XCTAssertEqual(harness.health.food["entry:42"]?.kilocalories, 320)

        // Та же запись без изменений — не переписывается.
        await harness.sync.write(oatmeal())
        XCTAssertEqual(harness.health.food["entry:42"]?.version, 1)

        // Правка — та же синхронизация, версия больше.
        await harness.sync.write(oatmeal(kcal: 360))
        XCTAssertEqual(harness.health.food["entry:42"]?.version, 2)
        XCTAssertEqual(harness.health.food["entry:42"]?.kilocalories, 360)

        // Сценарий «Удаление записи из дневника».
        await harness.sync.delete(entryID: "42")
        XCTAssertNil(harness.health.food["entry:42"])
        let written = await harness.sync.currentState.written
        XCTAssertNil(written["entry:42"])
    }

    // Сценарий «Запись, сделанная куратором»: появляется при открытии дня;
    // удалённая в вебе — удаляется.
    func testOpeningDayWritesCuratorEntriesAndRemovesDeleted() async throws {
        let harness = make()
        try await harness.sync.connect(userID: userID)
        await harness.sync.write(oatmeal())

        let curator = DiaryEntryForHealth(id: "77", date: ISO8601DateFormatter().date(from: "2026-10-17T10:00:00Z")!,
                                          name: "Суп", kilocalories: 210, protein: 9, fat: 6, carbohydrates: 25)
        await harness.sync.reconcileDay("2026-10-17", entries: [curator])
        XCTAssertEqual(harness.health.food["entry:77"]?.version, 1)
        XCTAssertNil(harness.health.food["entry:42"], "удалённая в вебе запись убрана из Здоровья")
    }

    func testWaterGlassesFollowCount() async throws {
        let harness = make()
        try await harness.sync.connect(userID: userID)
        let now = harness.clock.now
        await harness.sync.setWater(day: "2026-10-17", glasses: 3, glassMilliliters: 250, at: now)
        XCTAssertEqual(Set(harness.health.water.keys), ["water:2026-10-17:1", "water:2026-10-17:2", "water:2026-10-17:3"])
        XCTAssertTrue(harness.health.water.values.allSatisfy { $0.milliliters == 250 && $0.version == 1 })

        await harness.sync.setWater(day: "2026-10-17", glasses: 2, glassMilliliters: 250, at: now)
        XCTAssertEqual(Set(harness.health.water.keys), ["water:2026-10-17:1", "water:2026-10-17:2"])

        await harness.sync.setWater(day: "2026-10-17", glasses: 2, glassMilliliters: 300, at: now)
        XCTAssertEqual(harness.health.water["water:2026-10-17:1"]?.version, 2, "другой объём стакана — новая версия")
    }

    // MARK: 4.5 отключение и подсказка

    // Сценарий «Отключение».
    func testDisconnectStopsObserversClearsFlagAndWriting() async throws {
        let harness = make()
        try await harness.sync.connect(userID: userID)
        await harness.sync.disconnect()

        XCTAssertFalse(harness.health.isObserving)
        XCTAssertGreaterThanOrEqual(harness.health.backgroundDeliveryDisabledCount, 1, "disableAllBackgroundDelivery")
        let settings = try await harness.outbox.pending().filter { $0.kind == HealthSync.settingsKind }
        let flags = try settings.map { item -> Bool? in
            (try JSONSerialization.jsonObject(with: item.body ?? Data()) as? [String: Any])?["apple_health_enabled"] as? Bool
        }
        XCTAssertEqual(flags, [true, false])

        await harness.sync.write(oatmeal())
        XCTAssertTrue(harness.health.food.isEmpty, "после отключения еда в Здоровье не пишется")

        // Событие Здоровья после отключения ничего не ставит в очередь.
        let before = try await harness.outbox.pending().count
        harness.health.addWeight(WeightSample(date: harness.clock.now, kilograms: 80))
        await harness.sync.sync([.weight])
        let after = try await harness.outbox.pending().count
        XCTAssertEqual(after, before)
    }

    // Пачка, досланная после отключения, получает 409 и снимается из очереди.
    func testImportRejectedAfterDisconnectIsDropped() async throws {
        let health = InMemoryHealthStore()
        health.setSteps(5_000, day: profile.startOfDay(make().clock.now))
        let harness = make(health: health) { request in
            request.path == HealthImportLimits.path ? .error(409, code: "conflict") : .success("{}")
        }
        try await harness.sync.connect(userID: userID)
        let report = await harness.outbox.drain(userID: userID)
        XCTAssertEqual(report.rejected.count, 1)
        XCTAssertNil(report.stoppedAt)
        let pending = try await harness.outbox.pending()
        XCTAssertTrue(pending.isEmpty)
    }

    // Модель «Сегодня»: трое суток без шагов и веса — подсказка.
    func testAccessHintAfterThreeQuietDays() async throws {
        let harness = make()
        let quiet = await harness.sync.showsAccessHint()
        XCTAssertFalse(quiet, "не подключено — подсказки нет")

        try await harness.sync.connect(userID: userID)
        harness.clock.advance(days: 2.9)
        var shows = await harness.sync.showsAccessHint()
        XCTAssertFalse(shows)
        harness.clock.advance(days: 0.2)
        shows = await harness.sync.showsAccessHint()
        XCTAssertTrue(shows, "3 дня без данных с подключения")

        // Пришёл вес — подсказка уходит и вернётся через трое суток тишины.
        harness.health.addWeight(WeightSample(date: harness.clock.now, kilograms: 80))
        await harness.health.fire(.weight)
        shows = await harness.sync.showsAccessHint()
        XCTAssertFalse(shows)
        harness.clock.advance(days: 3)
        shows = await harness.sync.showsAccessHint()
        XCTAssertTrue(shows)

        // Ноль шагов — не данные.
        let today = profile.startOfDay(harness.clock.now)
        harness.health.setSteps(0, day: today, sampleAt: harness.clock.now)
        await harness.health.fire(.steps)
        shows = await harness.sync.showsAccessHint()
        XCTAssertTrue(shows)

        await harness.sync.disconnect()
        shows = await harness.sync.showsAccessHint()
        XCTAssertFalse(shows, "отключено — подсказки нет")
    }

    func testAccessHintModel() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        var state = HealthState()
        state.connected = true
        state.connectedAt = start
        XCTAssertFalse(HealthAccessHint.shouldShow(state, now: start.addingTimeInterval(2 * 86_400)))
        XCTAssertTrue(HealthAccessHint.shouldShow(state, now: start.addingTimeInterval(3 * 86_400)))
        state.lastDataAt = start.addingTimeInterval(86_400)
        XCTAssertFalse(HealthAccessHint.shouldShow(state, now: start.addingTimeInterval(3.5 * 86_400)))
        XCTAssertTrue(HealthAccessHint.shouldShow(state, now: start.addingTimeInterval(4 * 86_400)))
        state.connected = false
        XCTAssertFalse(HealthAccessHint.shouldShow(state, now: start.addingTimeInterval(30 * 86_400)))
    }

    func testProfileTimeZoneDrivesDates() async throws {
        let harness = make()
        await harness.sync.setTimeZone("Asia/Vladivostok")
        await harness.sync.setTimeZone("Not/AZone")
        let zone = await harness.sync.currentState.timeZoneID
        XCTAssertEqual(zone, "Asia/Vladivostok")
    }
}
