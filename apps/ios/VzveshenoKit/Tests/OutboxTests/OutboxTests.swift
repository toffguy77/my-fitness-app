import API
import Foundation
@testable import Outbox
import TestSupport
import XCTest

actor RecordingObserver: OutboxObserver {
    private(set) var delivered: [String] = []
    private(set) var rejected: [(String, APIError)] = []

    func outboxDelivered(_ item: OutboxItem, response: RawResponse) async { delivered.append(item.kind) }
    func outboxRejected(_ item: OutboxItem, error: APIError) async { rejected.append((item.kind, error)) }
}

/// Сервер с дневником, который понимает Idempotency-Key, как настоящий.
final class DiaryServer: @unchecked Sendable {
    private let lock = NSLock()
    private var entries: [String] = []
    private var seenKeys: [String: StubResponse] = [:]
    /// Сеть рвётся после записи, но до ответа.
    var dropResponseAfterWrite = false
    var offline = false

    var entryCount: Int { lock.withLock { entries.count } }

    func handle(_ request: RecordedRequest) -> StubResponse {
        lock.withLock {
            if offline { return .offline }
            let key = request.header("Idempotency-Key") ?? UUID().uuidString
            if let replay = seenKeys[key] {
                var response = replay
                response.headers["Idempotent-Replayed"] = "true"
                return response
            }
            entries.append(String(bytes: request.body ?? Data(), encoding: .utf8) ?? "")
            let response = StubResponse.success(#"{"id":\#(entries.count)}"#, status: 201)
            seenKeys[key] = response
            if dropResponseAfterWrite {
                dropResponseAfterWrite = false
                return .offline
            }
            return response
        }
    }
}

final class OutboxTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("outbox-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios/1.0.0/1", transport: transport)
    }

    private func breakfast() throws -> Endpoint {
        try .post("/api/v1/food-tracker/entries", body: ["food_name": "Овсянка", "meal_type": "breakfast"])
    }

    // Сценарий «Запись в метро»: без сети, перезапуск, затем сеть.
    func testOfflineEntrySurvivesRelaunchAndIsDelivered() async throws {
        let server = DiaryServer()
        server.offline = true
        let transport = StubTransport { server.handle($0) }
        let file = directory.appendingPathComponent("outbox.sqlite")

        let first = Outbox(store: try SQLiteOutboxStore(url: file), api: api(transport))
        let queued = try await first.enqueue(kind: "food_entry.create", endpoint: try breakfast(), userID: 7)
        let offlineReport = await first.drain(userID: 7)
        XCTAssertEqual(offlineReport.stoppedAt, queued.id)
        XCTAssertEqual(server.entryCount, 0)

        // Приложение выгружено из памяти: новая очередь на том же файле.
        server.offline = false
        let relaunched = Outbox(store: try SQLiteOutboxStore(url: file), api: api(transport))
        let pendingAfterRelaunch = try await relaunched.pending()
        XCTAssertEqual(pendingAfterRelaunch.map(\.idempotencyKey), [queued.idempotencyKey])
        let report = await relaunched.drain(userID: 7)
        XCTAssertEqual(report.delivered, [queued.id])
        XCTAssertEqual(server.entryCount, 1, "запись на сервере — видна в вебе")
        let left = try await relaunched.pending()
        XCTAssertTrue(left.isEmpty)
    }

    // Сценарий «Ответ потерян после записи»: в дневнике одна запись.
    func testLostResponseIsRetriedWithSameKeyAndNotDuplicated() async throws {
        let server = DiaryServer()
        server.dropResponseAfterWrite = true
        let transport = StubTransport { server.handle($0) }
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api(transport))
        try await outbox.enqueue(kind: "food_entry.create", endpoint: try breakfast(), userID: 7)

        let lost = await outbox.drain(userID: 7)
        XCTAssertNotNil(lost.stoppedAt, "ответ не дошёл — изменение ждёт")
        let retried = await outbox.drain(userID: 7)
        XCTAssertEqual(retried.delivered.count, 1)

        XCTAssertEqual(server.entryCount, 1)
        let keys = transport.requests.compactMap { $0.header("Idempotency-Key") }
        XCTAssertEqual(keys.count, 2)
        XCTAssertEqual(Set(keys).count, 1, "ключ постоянен для всех попыток")
    }

    // Сценарий «Сервер отказал по существу».
    func testFinalRejectionIsRemovedAndReported() async throws {
        let transport = StubTransport { _ in .error(422, code: "validation") }
        let observer = RecordingObserver()
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api(transport))
        await outbox.setObserver(observer)
        try await outbox.enqueue(kind: "water.add", endpoint: try .post("/api/v1/food-tracker/water", body: ["glasses": -1]), userID: 7)

        let report = await outbox.drain(userID: 7)
        XCTAssertEqual(report.rejected.count, 1)
        let left = try await outbox.pending()
        XCTAssertTrue(left.isEmpty, "снято из очереди")
        let rejected = await observer.rejected
        XCTAssertEqual(rejected.first?.0, "water.add", "интерфейс откатывает оптимистичный результат")
        XCTAssertEqual(rejected.first?.1.code, "validation")
        XCTAssertEqual(ErrorMessages { $0 == "error.validation" ? "Проверьте введённые данные" : nil }
            .message(for: try XCTUnwrap(rejected.first?.1)), "Проверьте введённые данные", "сообщение по коду")
    }

    func testVerdictTable() {
        func verdict(_ status: Int, _ headers: [String: String] = [:]) -> DeliveryVerdict {
            Outbox.verdict(for: RawResponse(data: Data(#"{"status":"error","code":"x"}"#.utf8), status: status, headers: headers))
        }
        XCTAssertEqual(verdict(200), .delivered)
        XCTAssertEqual(verdict(201), .delivered)
        XCTAssertEqual(verdict(204), .delivered)
        for status in [401, 408, 429, 500, 502, 503] {
            XCTAssertEqual(verdict(status), .retryLater, "\(status)")
        }
        XCTAssertEqual(verdict(409, ["retry-after": "1"]), .retryLater, "тот же ключ ещё выполняется")
        for status in [400, 403, 404, 409, 410, 422] {
            XCTAssertEqual(verdict(status), .rejected(.server(status: status, code: "x", params: [:])), "\(status)")
        }
    }

    func testOrderIsPreservedAndStopsAtFirstRetry() async throws {
        let transport = StubTransport { request in
            request.path.hasSuffix("/second") ? .error(429, code: "rate_limited") : .success("{}")
        }
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api(transport))
        for name in ["first", "second", "third"] {
            try await outbox.enqueue(kind: name, endpoint: try .post("/api/v1/x/\(name)", body: ["n": name]), userID: 7)
        }
        let report = await outbox.drain(userID: 7)
        XCTAssertEqual(report.delivered.count, 1)
        XCTAssertEqual(transport.requests.map(\.path), ["/api/v1/x/first", "/api/v1/x/second"], "третье не обгоняет второе")
        let left = try await outbox.pending()
        XCTAssertEqual(left.map(\.kind), ["second", "third"])
        XCTAssertEqual(left.first?.attempts, 1)
    }

    func testQueueOfAnotherAccountIsNotSent() async throws {
        let transport = StubTransport { _ in .success("{}") }
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api(transport))
        try await outbox.enqueue(kind: "old", endpoint: try breakfast(), userID: 1)
        try await outbox.enqueue(kind: "mine", endpoint: try breakfast(), userID: 2)
        let report = await outbox.drain(userID: 2)
        XCTAssertEqual(transport.requests.count, 1, "отправлено только своё")
        XCTAssertEqual(report.delivered.count, 1)
        let left = try await outbox.pending()
        XCTAssertEqual(left.map(\.kind), ["old"], "чужое не отправлено и не стёрто: стирает выход")
    }

    /// Досылка до восстановления сессии (`userID == nil`) не трогает очередь.
    func testDrainWithoutSignedInUserKeepsTheQueue() async throws {
        let transport = StubTransport { _ in .success("{}") }
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api(transport))
        try await outbox.enqueue(kind: "breakfast", endpoint: try breakfast(), userID: 7)
        let report = await outbox.drain(userID: nil)
        XCTAssertEqual(report, DrainReport())
        XCTAssertTrue(transport.requests.isEmpty)
        let left = try await outbox.pending()
        XCTAssertEqual(left.count, 1, "запись в метро не потеряна")
    }

    func testEraseAllClearsQueue() async throws {
        let outbox = Outbox(store: try SQLiteOutboxStore(url: directory.appendingPathComponent("q.sqlite")),
                            api: api(StubTransport { _ in .offline }))
        try await outbox.enqueue(kind: "a", endpoint: try breakfast(), userID: 7)
        await outbox.eraseAll()
        let left = try await outbox.pending()
        XCTAssertTrue(left.isEmpty)
    }

    // ios-platform-compliance: «Атрибуты файла очереди».
    func testQueueFileProtection() throws {
        let file = ProtectedFiles.directory(appGroup: Bundle.main.object(forInfoDictionaryKey: "AppGroupID") as? String)
            .appendingPathComponent("tests-\(UUID().uuidString)/outbox.sqlite")
        defer { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        let store = try SQLiteOutboxStore(url: file)
        try store.append(OutboxItem(userID: 1, kind: "k", method: .post, path: "/x", body: nil))
        let attributes = ProtectedFiles.attributes(of: file)
        assertProtected(attributes, file.lastPathComponent)
    }
}

/// Отказы из расширения: пишет наблюдатель его очереди, приложение забирает.
final class RejectionLogTests: XCTestCase {
    func testExtensionRejectionsAreTakenOncePerAccount() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("rejections-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let log = RejectionLog(directory: directory)
        let transport = StubTransport { _ in .error(422, code: "validation") }
        let outbox = Outbox(store: InMemoryOutboxStore(), api: APIClient(baseURL: URL(string: "https://new.burcev.team")!,
                                                                         clientHeader: "ios/test", transport: transport))
        await outbox.setObserver(log)
        try await outbox.enqueue(kind: "surface.weight", endpoint: try Endpoint.post("/api/v1/dashboard/daily", body: ["a": 1]),
                                 userID: 7)
        let report = await outbox.drain(userID: 7)
        XCTAssertEqual(report.rejected.count, 1)
        log.append(RejectedChange(id: UUID(), userID: 8, kind: "surface.water", code: nil, status: 400))

        let mine = RejectionLog(directory: directory).take(userID: 7)
        XCTAssertEqual(mine.map(\.kind), ["surface.weight"])
        XCTAssertEqual(mine.first?.error, .server(status: 422, code: "validation", params: [:]))
        XCTAssertTrue(log.take(userID: 7).isEmpty, "забранное не показывается второй раз")
        XCTAssertEqual(log.take(userID: 8).count, 1, "чужие отказы не трогаются")
        log.erase()
        XCTAssertTrue(log.take(userID: 8).isEmpty)
    }

    func testUnavailableStoreRefusesToEnqueue() async {
        let outbox = Outbox(store: UnavailableOutboxStore()) { _ in RawResponse(data: Data(), status: 200) }
        do {
            _ = try await outbox.enqueue(kind: "k", endpoint: .delete("/x"), userID: 7)
            XCTFail("постановка должна бросить")
        } catch {}
    }
}

final class ScreenCacheTests: XCTestCase {
    private var root: URL!

    override func setUp() {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("cache-\(UUID().uuidString)")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    // «Кэш принадлежит пользователю».
    func testCacheBelongsToUser() throws {
        let cache = ScreenCache(root: root)
        try cache.store(Data("день Анны".utf8), for: "diary/2026-10-15", userID: 7)
        XCTAssertEqual(cache.load("diary/2026-10-15", userID: 7)?.data, Data("день Анны".utf8))
        XCTAssertNil(cache.load("diary/2026-10-15", userID: 8), "чужой кэш не читается")
    }

    func testEraseOnSignOut() throws {
        let cache = ScreenCache(root: root)
        try cache.store(Data("x".utf8), for: "today", userID: 7)
        cache.eraseAll()
        XCTAssertNil(cache.load("today", userID: 7))
    }

    // Сценарий «Открытие без сети»: «Обновлено в 14:20».
    func testUpdatedLabel() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Europe/Moscow"))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let saved = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 10, day: 15, hour: 14, minute: 20)))
        let later = saved.addingTimeInterval(3600)
        let entry = CachedScreen(data: Data(), updatedAt: saved)
        XCTAssertEqual(entry.updatedLabel(now: later, timeZone: zone), "Обновлено в 14:20")
        XCTAssertEqual(entry.updatedLabel(now: later.addingTimeInterval(86_400), timeZone: zone), "Обновлено 15 окт. в 14:20")
    }

    func testCacheAndSnapshotFilesAreProtected() throws {
        let cache = ScreenCache(root: root)
        try cache.store(Data("x".utf8), for: "today", userID: 7)
        let snapshot = DaySnapshotStore(url: root.appendingPathComponent("snapshot.json"))
        try snapshot.save(Data("{}".utf8))
        for url in [cache.url(for: "today", userID: 7), snapshot.url] {
            XCTAssertNotNil(try? Data(contentsOf: url))
            assertProtected(ProtectedFiles.attributes(of: url), url.lastPathComponent)
        }
        snapshot.erase()
        XCTAssertNil(snapshot.load())
    }
}

/// Класс защиты `completeUntilFirstUserAuthentication` и исключение из
/// резервной копии. Симулятор класс защиты не хранит — там проверяется, что
/// он запрошен при создании файла; на устройстве — что он стоит.
func assertProtected(_ attributes: ProtectedFiles.Attributes, _ name: String,
                     file: StaticString = #filePath, line: UInt = #line) {
    #if os(iOS)
    if ProtectedFiles.platformKeepsProtectionClass {
        XCTAssertEqual(attributes.protection, ProtectedFiles.requiredProtection, name, file: file, line: line)
    } else {
        let requested = ProtectedFiles.requestedAttributes[.protectionKey] as? FileProtectionType
        XCTAssertEqual(requested?.rawValue, ProtectedFiles.requiredProtection, name, file: file, line: line)
    }
    XCTAssertEqual(attributes.excludedFromBackup, true, name, file: file, line: line)
    #else
    XCTAssertNil(attributes.protection, "класса защиты на этой платформе нет", file: file, line: line)
    #endif
}

/// Поводы досылки (`ios-offline-outbox`): появление сети — по переходу, а не
/// по каждому событию монитора.
final class ConnectivityEdgesTests: XCTestCase {
    func testEdges() {
        var edges = ConnectivityEdges()
        XCTAssertNil(edges.next(true), "с сетью на запуске — без досылки отсюда")
        XCTAssertNil(edges.next(true), "повтор того же состояния — ничего")
        XCTAssertEqual(edges.next(false), .lost)
        XCTAssertNil(edges.next(false))
        XCTAssertEqual(edges.next(true), .restored)

        var offlineAtLaunch = ConnectivityEdges()
        XCTAssertEqual(offlineAtLaunch.next(false), .lost, "без сети на запуске — плашка сразу")
        XCTAssertEqual(offlineAtLaunch.next(true), .restored)
    }
}
