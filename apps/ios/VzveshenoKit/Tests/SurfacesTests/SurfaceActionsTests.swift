import API
import Foundation
import Outbox
import Session
import Surfaces
import TestSupport
import XCTest

/// «Добавить стакан воды» и «Запиши вес» без приложения (задачи 3.2, 4.2;
/// спеки `ios-controls`, `ios-app-intents`).
final class SurfaceActionsTests: XCTestCase {
    private struct Harness {
        let context: SurfaceContext
        let outbox: Outbox
        let repository: SnapshotRepository
        let reloader: CountingReloader
        let transport: StubTransport
        let secure: InMemorySecureStore
    }

    /// Контекст, как его собирает расширение: Keychain только на чтение,
    /// клиент API без обновления сессии, очередь — общая.
    private func harness(snapshot: DaySnapshot? = Fixture.snapshot(), user: SessionUser? = Fixture.user(),
                         store: OutboxStore = InMemoryOutboxStore(),
                         server: @escaping StubTransport.Handler = { _ in .success(#"{"glasses":6,"goal":8,"enabled":true}"#) })
        async -> Harness {
        let transport = StubTransport(handler: server)
        let api = Fixture.api(transport)
        let secure = Fixture.keychain(user: user)
        let reader = SharedSessionReader(secure: secure)
        await api.setTokenProvider(ReadOnlyTokenProvider(reader: reader))
        let outbox = Outbox(store: store, api: api)
        let repository = SnapshotRepository(directory: Fixture.directory())
        if let snapshot { try? repository.save(snapshot) }
        let reloader = CountingReloader()
        let context = SurfaceContext(snapshots: repository, outbox: outbox, reloader: reloader,
                                     sessionUser: { reader.user }, now: { Fixture.friday })
        return Harness(context: context, outbox: outbox, repository: repository, reloader: reloader, transport: transport,
                       secure: secure)
    }

    // MARK: Вода

    /// Нажатие с сетью: виджет сразу показывает на стакан больше, запрос ушёл
    /// с `Idempotency-Key`, очередь пуста.
    func testWaterIsOptimisticQueuedAndSent() async throws {
        let h = await harness()
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .added(glasses: 6, goal: 8, delivered: true))
        XCTAssertEqual(outcome.dialog, "Записано: 6 из 8 стаканов")
        XCTAssertEqual(h.repository.load()?.water?.glasses, 6)
        XCTAssertEqual(h.reloader.count, 1)
        let sent = try XCTUnwrap(h.transport.requests(to: "/api/v1/food-tracker/water").first)
        XCTAssertEqual(sent.method, "POST")
        XCTAssertEqual(sent.json?["date"] as? String, Fixture.fridayKey)
        XCTAssertEqual(sent.json?["glasses"] as? Int, 1)
        XCTAssertNotNil(sent.header("Idempotency-Key"))
        XCTAssertEqual(sent.header("Authorization"), "Bearer access")
        let pending = try await h.outbox.pending()
        XCTAssertTrue(pending.isEmpty)
    }

    /// Сценарий «Нажатие в режиме полёта»: виджет показывает на стакан больше,
    /// изменение ждёт в очереди; после появления сети приложение досылает его,
    /// и стакан записан на сервере один раз — тем же ключом при каждой попытке.
    func testOfflineTapIsDeliveredOnceByTheApp() async throws {
        let store = InMemoryOutboxStore()
        let h = await harness(store: store, server: { _ in .offline })
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .added(glasses: 6, goal: 8, delivered: false))
        XCTAssertEqual(h.repository.load()?.water?.glasses, 6)
        let value1 = try await h.outbox.pending().first
        let queued = try XCTUnwrap(value1)
        XCTAssertEqual(queued.kind, PendingWater.kind)

        // Сеть вернулась, приложение открыто: его очередь над тем же хранилищем.
        let server = StubTransport { _ in .success(#"{"glasses":6,"goal":8,"enabled":true}"#) }
        let appOutbox = Outbox(store: store, api: Fixture.api(server))
        _ = await appOutbox.drain(userID: 7)
        _ = await appOutbox.drain(userID: 7)
        let delivered = server.requests(to: "/api/v1/food-tracker/water")
        XCTAssertEqual(delivered.count, 1, "стакан записан один раз")
        XCTAssertEqual(delivered.first?.header("Idempotency-Key"), queued.idempotencyKey)
        let value2 = try await appOutbox.pending().isEmpty
        XCTAssertTrue(value2)
    }

    /// Два нажатия — два стакана: у каждого свой ключ.
    func testEveryTapHasItsOwnKey() async throws {
        let h = await harness(server: { _ in .offline })
        _ = await AddWaterAction(context: h.context).perform()
        _ = await AddWaterAction(context: h.context).perform()
        let keys = try await h.outbox.pending().map(\.idempotencyKey)
        XCTAssertEqual(keys.count, 2)
        XCTAssertNotEqual(keys[0], keys[1])
        XCTAssertEqual(h.repository.load()?.water?.glasses, 7)
    }

    /// Просроченный токен: расширение сессию не обновляет и не стирает —
    /// изменение ждёт приложение.
    func testExpiredTokenLeavesTheChangeForTheApp() async throws {
        let h = await harness(server: { _ in .error(401, code: "token_expired") })
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .added(glasses: 6, goal: 8, delivered: false))
        let value3 = try await h.outbox.pending().count
        XCTAssertEqual(value3, 1)
        XCTAssertNil(h.transport.requests.first { $0.path == "/api/v1/auth/native/refresh" }, "обновления сессии нет")
        XCTAssertNotNil(try h.secure.read("session"), "сессия в Keychain не тронута")
    }

    /// `session_ended` в расширении тоже ничего не стирает: это дело приложения.
    func testSessionEndedInTheExtensionKeepsEverything() async throws {
        let h = await harness(server: { _ in .error(401, code: "session_ended") })
        _ = await AddWaterAction(context: h.context).perform()
        let value4 = try await h.outbox.pending().count
        XCTAssertEqual(value4, 1)
        XCTAssertNotNil(try h.secure.read("session"))
        XCTAssertNotNil(h.repository.load())
    }

    /// Сценарий «Вода выключена куратором».
    func testWaterDisabledCreatesNoChange() async throws {
        let h = await harness(snapshot: Fixture.snapshot(water: .init(glasses: 0, goal: 8, enabled: false)))
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .disabled)
        XCTAssertEqual(outcome.dialog, "Куратор пока не задал цель по воде")
        let value5 = try await h.outbox.pending().isEmpty
        XCTAssertTrue(value5)
        XCTAssertTrue(h.transport.requests.isEmpty)
        XCTAssertEqual(h.repository.load()?.water?.glasses, 0)
    }

    /// Без воды в снимке (куратор не задавал цель) — то же.
    func testNoWaterInSnapshotIsDisabled() async throws {
        let h = await harness(snapshot: Fixture.snapshot(water: nil))
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .disabled)
    }

    /// Никто не вошёл — ничего не создаётся.
    func testSignedOutDoesNothing() async throws {
        let h = await harness(user: nil)
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .signedOut)
        let value6 = try await h.outbox.pending().isEmpty
        XCTAssertTrue(value6)
        XCTAssertTrue(h.transport.requests.isEmpty)
    }

    /// Снимок другого аккаунта (смена аккаунта, переустановка): интент не
    /// действует ни от чьего имени и не трогает чужой снимок.
    func testDoesNotActForAnotherAccount() async throws {
        let h = await harness(snapshot: Fixture.snapshot(userID: 9))
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .signedOut)
        let value7 = try await h.outbox.pending().isEmpty
        XCTAssertTrue(value7)
        XCTAssertEqual(h.repository.load()?.water?.glasses, 5)
    }

    /// Сессия есть, а снимка нет (переустановка: Keychain её пережил, App
    /// Group — нет) — не действуем.
    func testNoSnapshotMeansNoAction() async throws {
        let h = await harness(snapshot: nil)
        let value8 = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(value8, .signedOut)
        let value9 = try await h.outbox.pending().isEmpty
        XCTAssertTrue(value9)
    }

    /// Куратору — «Это действие доступно клиентам».
    func testCuratorCannotAddWater() async throws {
        let h = await harness(snapshot: Fixture.snapshot(role: "coordinator"), user: Fixture.user(role: "coordinator"))
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .wrongRole)
        let value10 = try await h.outbox.pending().isEmpty
        XCTAssertTrue(value10)
    }

    /// Вчерашний снимок: стакан — за сегодня по поясу профиля, вчерашний
    /// счётчик не трогается.
    func testStaleSnapshotLogsForToday() async throws {
        let h = await harness(snapshot: Fixture.snapshot(date: "2025-10-16"))
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .added(glasses: nil, goal: nil, delivered: true))
        XCTAssertEqual(outcome.dialog, "Стакан воды записан")
        XCTAssertEqual(h.transport.requests.first?.json?["date"] as? String, Fixture.fridayKey)
        XCTAssertEqual(h.repository.load()?.water?.glasses, 5)
    }

    /// Очередь не открылась (файл SQLite недоступен): стакан не появляется в
    /// виджете и действие говорит, что не записало, — а не теряет нажатие молча.
    func testUnavailableQueueDoesNotTouchTheSnapshot() async throws {
        let h = await harness(store: UnavailableOutboxStore())
        let outcome = await AddWaterAction(context: h.context).perform()
        XCTAssertEqual(outcome, .failed)
        XCTAssertEqual(outcome.dialog, SurfaceDialogs.notSaved)
        XCTAssertEqual(h.repository.load()?.water?.glasses, 5, "снимок не тронут")
        XCTAssertEqual(h.reloader.count, 0)
        XCTAssertTrue(h.transport.requests.isEmpty)
        let weight = await LogWeightAction(context: h.context).perform(kilograms: 78.4)
        XCTAssertEqual(weight, .failed)
    }

    // MARK: Вес

    /// Сценарий «Вес 78,4»: изменение веса за сегодня в очереди, ответ
    /// «Записала 78,4 кг».
    func testWeightIsQueuedForToday() async throws {
        let h = await harness(server: { _ in .offline })
        let outcome = await LogWeightAction(context: h.context).perform(kilograms: 78.4)
        XCTAssertEqual(outcome, .logged(kilograms: 78.4, delivered: false))
        XCTAssertEqual(outcome.dialog, "Записала 78,4 кг")
        let value11 = try await h.outbox.pending().first
        let item = try XCTUnwrap(value11)
        XCTAssertEqual(item.path, "/api/v1/dashboard/daily")
        XCTAssertEqual(item.method, .post)
        let body = try XCTUnwrap(item.body.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        XCTAssertEqual(body["date"] as? String, Fixture.fridayKey)
        let metric = try XCTUnwrap(body["metric"] as? [String: Any])
        XCTAssertEqual(metric["type"] as? String, "weight")
        XCTAssertEqual((metric["data"] as? [String: Any])?["weight"] as? Double, 78.4)
    }

    /// Границы 20–500 кг; вне них — отказ с диапазоном, без изменения.
    func testWeightBounds() async throws {
        let cases: [(Double, Double?)] = [
            (19.9, nil), (20, 20), (78.4, 78.4), (78.44, 78.4), (78.46, 78.5), (500, 500), (500.04, 500), (500.1, nil),
            (0.1, nil), (-5, nil), (.nan, nil), (.infinity, nil),
        ]
        for (input, expected) in cases {
            XCTAssertEqual(VoiceWeight.normalized(input), expected, "\(input)")
        }
        let h = await harness()
        let outcome = await LogWeightAction(context: h.context).perform(kilograms: 7.8)
        XCTAssertEqual(outcome, .outOfRange)
        XCTAssertEqual(outcome.dialog, "Вес — от 20 до 500 кг. Назовите вес ещё раз")
        let value12 = try await h.outbox.pending().isEmpty
        XCTAssertTrue(value12)
    }

    func testWeightNeedsTheSignedInClient() async throws {
        let signedOut = await harness(user: nil)
        let value13 = await LogWeightAction(context: signedOut.context).perform(kilograms: 78.4)
        XCTAssertEqual(value13, .signedOut)
        let other = await harness(snapshot: Fixture.snapshot(userID: 9))
        let value14 = await LogWeightAction(context: other.context).perform(kilograms: 78.4)
        XCTAssertEqual(value14, .signedOut)
        let value15 = try await other.outbox.pending().isEmpty
        XCTAssertTrue(value15)
    }

    // MARK: Токен без обновления

    func testReadOnlyTokenProviderNeverRefreshes() async throws {
        let secure = Fixture.keychain(accessToken: "old")
        let provider = ReadOnlyTokenProvider(reader: SharedSessionReader(secure: secure))
        let value16 = await provider.currentAccessToken()
        XCTAssertEqual(value16, "old")
        do {
            _ = try await provider.renewAccessToken(rejected: "old")
            XCTFail("обновления быть не должно")
        } catch {
            XCTAssertEqual(error as? APIError, .sessionEnded)
        }
        // Приложение тем временем обновило токен — берётся новый.
        let user = Fixture.user()
        try secure.write(try JSONEncoder().encode(NativeSession(accessToken: "new", refreshToken: "r2", user: user)), for: "session")
        let value17 = try await provider.renewAccessToken(rejected: "old")
        XCTAssertEqual(value17, "new")
        await provider.sessionWasEnded()
        XCTAssertNotNil(try secure.read("session"), "конец сессии расширение не обрабатывает")
    }
}
