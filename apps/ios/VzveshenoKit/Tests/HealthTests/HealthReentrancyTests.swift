import API
import Foundation
@testable import Health
import Outbox
import TestSupport
import XCTest

/// Задвижка: вызов ждёт, пока тест её не откроет.
actor Gate {
    private var isOpen = false
    private var entered = false
    private var waiting: [CheckedContinuation<Void, Never>] = []
    private var enteredWaiters: [CheckedContinuation<Void, Never>] = []

    func pass() async {
        guard !isOpen else { return }
        entered = true
        enteredWaiters.forEach { $0.resume() }
        enteredWaiters = []
        await withCheckedContinuation { waiting.append($0) }
    }

    func waitUntilEntered() async {
        guard !entered else { return }
        await withCheckedContinuation { enteredWaiters.append($0) }
    }

    func open() {
        isOpen = true
        waiting.forEach { $0.resume() }
        waiting = []
    }
}

/// Подделка Здоровья, у которой системный запрос и чтение изменений можно
/// задержать: так видно, что происходит, если человек выходит посреди них.
final class GatedHealthStore: HealthStore, @unchecked Sendable {
    let inner: InMemoryHealthStore
    let authorization: Gate?
    let changes: Gate?

    init(inner: InMemoryHealthStore = InMemoryHealthStore(), authorization: Gate? = nil, changes: Gate? = nil) {
        self.inner = inner
        self.authorization = authorization
        self.changes = changes
    }

    var isAvailable: Bool { inner.isAvailable }

    func requestAuthorization() async throws {
        await authorization?.pass()
        try await inner.requestAuthorization()
    }

    func dailyStepTotals(from start: Date, to end: Date, timeZone: TimeZone) async throws -> [Date: Double] {
        try await inner.dailyStepTotals(from: start, to: end, timeZone: timeZone)
    }

    func weights(from start: Date, to end: Date) async throws -> [WeightSample] {
        try await inner.weights(from: start, to: end)
    }

    func changes(of kind: HealthReadKind, since anchor: Data?, notBefore: Date) async throws -> HealthChanges {
        await changes?.pass()
        return try await inner.changes(of: kind, since: anchor, notBefore: notBefore)
    }

    func startObserving(_ onChange: @escaping @Sendable (HealthReadKind) async -> Void) async throws {
        try await inner.startObserving(onChange)
    }

    func stopObserving() async { await inner.stopObserving() }
    func save(_ food: FoodSample) async throws { try await inner.save(food) }
    func save(_ water: WaterSample) async throws { try await inner.save(water) }
    func deleteSamples(syncIdentifier: String) async throws { try await inner.deleteSamples(syncIdentifier: syncIdentifier) }
}

/// Выход из аккаунта посреди подключения или прохода чтения: actor
/// допускает повторный вход на каждом `await`.
final class HealthReentrancyTests: XCTestCase {
    private func harness(store: HealthStore, state: InMemoryHealthStateStore = InMemoryHealthStateStore(),
                         signedIn: SignedInUser = SignedInUser(7),
                         transport: StubTransport = StubTransport { _ in .success("{}") }) -> (HealthSync, Outbox) {
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios/1.0.0/1", transport: transport)
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api)
        let sync = HealthSync(store: store, outbox: outbox, stateStore: state, currentUser: { signedIn.id },
                              drain: { id in await outbox.drain(userID: id) })
        return (sync, outbox)
    }

    private func waitUntilDisconnected(_ sync: HealthSync) async {
        for _ in 0..<1_000 where await sync.isConnected {
            await Task.yield()
        }
    }

    // Выход, пока открыт системный запрос: наблюдатели не запущены, в
    // очереди ничего, состояние не сохранено.
    func testSignOutDuringConnectStartsNothing() async throws {
        let gate = Gate()
        let store = GatedHealthStore(authorization: gate)
        store.inner.setSteps(5_000, day: Date())
        let state = InMemoryHealthStateStore()
        let (sync, outbox) = harness(store: store, state: state)

        let connecting = Task { try await sync.connect(userID: 7) }
        await gate.waitUntilEntered()
        await sync.erase()
        await gate.open()

        let connected = try await connecting.value
        XCTAssertFalse(connected)
        XCTAssertFalse(store.inner.isObserving, "наблюдатели не запущены")
        let pending = try await outbox.pending()
        XCTAssertTrue(pending.isEmpty, "ни признака, ни импорта")
        XCTAssertEqual(state.load(), HealthState())
    }

    // Выход посреди прохода чтения: после erase() в очереди и в хранилище
    // ничего от прежнего аккаунта.
    func testEraseDuringInFlightSyncLeavesNothing() async throws {
        let gate = Gate()
        let inner = InMemoryHealthStore()
        let state = InMemoryHealthStateStore()
        // Подключение без задвижки, затем — чтение с задвижкой.
        let (connectedSync, _) = harness(store: inner, state: state)
        try await connectedSync.connect(userID: 7)
        XCTAssertTrue(state.load().connected)

        let store = GatedHealthStore(inner: inner, changes: gate)
        let (sync, outbox) = harness(store: store, state: state)
        inner.addWeight(WeightSample(date: Date().addingTimeInterval(-60), kilograms: 80))

        let reading = Task { await sync.sync([.weight]) }
        await gate.waitUntilEntered()
        let erasing = Task { await sync.erase() }
        await waitUntilDisconnected(sync)
        await gate.open()
        await reading.value
        await erasing.value

        let pending = try await outbox.pending()
        XCTAssertTrue(pending.isEmpty, "пачка прежнего аккаунта не поставлена")
        XCTAssertEqual(state.load(), HealthState(), "якоря прежнего аккаунта не сохранены")
    }

    // Вошёл другой человек: очередь прежнего подключения не досылается.
    func testDrainSkippedForAnotherSignedInUser() async throws {
        let store = InMemoryHealthStore()
        store.setSteps(5_000, day: Date())
        let transport = StubTransport { _ in .success("{}") }
        let (sync, outbox) = harness(store: store, signedIn: SignedInUser(8), transport: transport)

        try await sync.connect(userID: 7)
        XCTAssertTrue(transport.requests.isEmpty, "чужой сессией ничего не отправлено")
        let pending = try await outbox.pending()
        XCTAssertFalse(pending.isEmpty)
    }
}
