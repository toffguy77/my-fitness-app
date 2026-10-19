import API
@testable import Client
import Foundation
import TestSupport
import XCTest

final class RealtimeTests: XCTestCase {
    func testFramesBecomeEvents() {
        XCTAssertEqual(RealtimeEvent.parse(Data(#"{"type":"new_message","data":{"id":"m","conversation_id":"c1"}}"#.utf8)),
                       .newMessage(conversationID: "c1"))
        XCTAssertEqual(RealtimeEvent.parse(Data(#"{"type":"unread_count_update","data":{"count":3}}"#.utf8)), .unreadCount(3))
        XCTAssertEqual(RealtimeEvent.parse(Data(#"{"type":"content_notification","data":{"notification":{"id":"n"}}}"#.utf8)),
                       .contentNotification)
        XCTAssertEqual(RealtimeEvent.parse(Data(#"{"type":"typing","data":{"conversation_id":"c1","user_id":7}}"#.utf8)),
                       .typing(conversationID: "c1"))
        XCTAssertNil(RealtimeEvent.parse(Data(#"{"type":"task_assigned","data":{}}"#.utf8)))
        XCTAssertNil(RealtimeEvent.parse(Data("не json".utf8)))
    }

    func testSocketAddressCarriesTheTicket() {
        let url = RealtimeEvent.socketURL(base: URL(string: "https://new.burcev.team")!, ticket: "abc")
        XCTAssertEqual(url?.absoluteString, "wss://new.burcev.team/ws?ticket=abc")
    }

    /// Пауза переподключения — от 1 до 30 секунд.
    func testBackoffGrowsFromOneToThirtySeconds() {
        let delays = (0...7).map { RealtimeBackoff.delay(afterFailures: $0) }
        XCTAssertEqual(delays, [.seconds(1), .seconds(2), .seconds(4), .seconds(8), .seconds(16), .seconds(30), .seconds(30),
                                .seconds(30)])
    }
}

/// Клиент WebSocket на фейковом сервере (задача 5.1): билет, кадры,
/// переподключение с паузой и свежим билетом, «печатает» не чаще раза в 2 с.
final class RealtimeConnectionTests: XCTestCase {
    private func makeConnection(sockets: FakeSockets, sleeper: ManualSleeper, clock: TestClock = TestClock())
        -> (RealtimeConnection, StubTransport) {
        let tickets = Counter()
        let transport = StubTransport { request in
            guard request.path == "/api/v1/auth/ws-ticket" else { return .error(404, code: "not_found") }
            return .success(#"{"ticket":"t\#(tickets.next())","expires_in":30}"#)
        }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        return (RealtimeConnection(api: api, sockets: sockets, sleeper: sleeper, now: { clock.now }), transport)
    }

    func testDeliversServerFrames() async throws {
        let sockets = FakeSockets()
        let (connection, _) = makeConnection(sockets: sockets, sleeper: ManualSleeper())
        var events = await connection.connect().makeAsyncIterator()
        let first = await events.next()
        XCTAssertEqual(first, .connected)
        let socket = try await sockets.waitForSocket(0)
        XCTAssertEqual(socket.url.absoluteString, "wss://new.burcev.team/ws?ticket=t1")
        socket.push(#"{"type":"new_message","data":{"id":"m1","conversation_id":"c1","type":"text"}}"#)
        let second = await events.next()
        XCTAssertEqual(second, .newMessage(conversationID: "c1"))
        await connection.disconnect()
    }

    /// Обрыв — пауза 1 с, затем новый сокет со свежим билетом и `.connected`.
    func testReconnectsAfterDropWithFreshTicket() async throws {
        let sockets = FakeSockets()
        let sleeper = ManualSleeper()
        let (connection, transport) = makeConnection(sockets: sockets, sleeper: sleeper)
        var events = await connection.connect().makeAsyncIterator()
        _ = await events.next()
        let socket = try await sockets.waitForSocket(0)
        socket.drop()
        await sleeper.waitForSleepers()
        XCTAssertEqual(sockets.count, 1, "до паузы новый сокет не открывается")
        await sleeper.advance(by: .seconds(1))
        let reconnected = await events.next()
        XCTAssertEqual(reconnected, .connected)
        let second = try await sockets.waitForSocket(1)
        XCTAssertEqual(second.url.absoluteString, "wss://new.burcev.team/ws?ticket=t2", "билет одноразовый — новый")
        XCTAssertEqual(transport.requests(to: "/api/v1/auth/ws-ticket").count, 2)
        await connection.disconnect()
    }

    /// Сервер недоступен: паузы 1, 2, 4… до 30 с, после успеха — снова с 1 с.
    func testBackoffWhileTicketFailsAndResetAfterSuccess() async throws {
        let sockets = FakeSockets()
        let sleeper = ManualSleeper()
        let failing = LockedFlag(true)
        let tickets = Counter()
        let transport = StubTransport { _ in
            failing.value ? .error(503, code: "feature_unavailable") : .success(#"{"ticket":"t\#(tickets.next())"}"#)
        }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let connection = RealtimeConnection(api: api, sockets: sockets, sleeper: sleeper)
        var events = await connection.connect().makeAsyncIterator()
        for (attempt, seconds) in [1, 2, 4, 8, 16, 30, 30].enumerated() {
            await sleeper.waitForSleepers()
            XCTAssertEqual(transport.requests.count, attempt + 1)
            await sleeper.advance(by: .seconds(seconds - 1))
            XCTAssertEqual(transport.requests.count, attempt + 1, "пауза \(seconds) с ещё не кончилась")
            if attempt == 6 { failing.value = false }
            await sleeper.advance(by: .seconds(1))
        }
        let connected = await events.next()
        XCTAssertEqual(connected, .connected)
        try await sockets.waitForSocket(0).drop()
        await sleeper.waitForSleepers()
        let before = transport.requests.count
        await sleeper.advance(by: .seconds(1))
        _ = await events.next()
        XCTAssertEqual(transport.requests.count, before + 1, "после успешного подключения пауза снова 1 с")
        await connection.disconnect()
    }

    /// Конец сессии — переподключений нет, поток закончен.
    func testStopsWhenSessionEnded() async {
        let transport = StubTransport { _ in .error(401, code: "session_ended") }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        await api.setTokenProvider(EndedSession())
        let connection = RealtimeConnection(api: api, sockets: FakeSockets(), sleeper: ManualSleeper())
        var events = await connection.connect().makeAsyncIterator()
        let event = await events.next()
        XCTAssertNil(event)
    }

    func testTypingIsThrottledToOnceInTwoSeconds() async throws {
        let sockets = FakeSockets()
        let clock = TestClock()
        let (connection, _) = makeConnection(sockets: sockets, sleeper: ManualSleeper(), clock: clock)
        var events = await connection.connect().makeAsyncIterator()
        _ = await events.next()
        let socket = try await sockets.waitForSocket(0)
        let first = await connection.sendTyping(conversationID: "c1")
        clock.advance(1.5)
        let second = await connection.sendTyping(conversationID: "c1")
        clock.advance(0.6)
        let third = await connection.sendTyping(conversationID: "c1")
        XCTAssertEqual([first, second, third], [true, false, true])
        XCTAssertEqual(socket.sent.count, 2)
        XCTAssertEqual(socket.sent.first.flatMap { String(data: $0, encoding: .utf8) },
                       #"{"data":{"conversation_id":"c1"},"type":"typing"}"#)
        await connection.disconnect()
    }

    func testDisconnectClosesTheSocketAndStream() async throws {
        let sockets = FakeSockets()
        let (connection, _) = makeConnection(sockets: sockets, sleeper: ManualSleeper())
        var events = await connection.connect().makeAsyncIterator()
        _ = await events.next()
        let socket = try await sockets.waitForSocket(0)
        await connection.disconnect()
        XCTAssertTrue(socket.closed)
        let after = await events.next()
        XCTAssertNil(after)
    }
}

// MARK: Фейковый сервер

/// Сокеты фейкового сервера: тест кладёт кадры и обрывает соединение.
final class FakeSockets: WebSocketFactory, @unchecked Sendable {
    private let lock = NSLock()
    private var sockets: [FakeSocket] = []

    var count: Int { lock.withLock { sockets.count } }

    func open(_ url: URL) async throws -> WebSocketChannel {
        let socket = FakeSocket(url: url)
        lock.withLock { sockets.append(socket) }
        return socket
    }

    func waitForSocket(_ index: Int) async throws -> FakeSocket {
        for _ in 0..<20_000 {
            if let socket = lock.withLock({ index < sockets.count ? sockets[index] : nil }) { return socket }
            await Task.yield()
        }
        throw URLError(.timedOut)
    }
}

final class FakeSocket: WebSocketChannel, @unchecked Sendable {
    let url: URL
    private let lock = NSLock()
    private var frames: [Data] = []
    private var waiting: CheckedContinuation<Data, Error>?
    private var isDropped = false
    private var sentFrames: [Data] = []
    private var isClosed = false

    init(url: URL) { self.url = url }

    var sent: [Data] { lock.withLock { sentFrames } }
    var closed: Bool { lock.withLock { isClosed } }

    func push(_ text: String) {
        let waiter = lock.withLock { () -> CheckedContinuation<Data, Error>? in
            if let waiting {
                self.waiting = nil
                return waiting
            }
            frames.append(Data(text.utf8))
            return nil
        }
        waiter?.resume(returning: Data(text.utf8))
    }

    /// Обрыв соединения со стороны сервера.
    func drop() {
        let waiter = lock.withLock { () -> CheckedContinuation<Data, Error>? in
            isDropped = true
            defer { waiting = nil }
            return waiting
        }
        waiter?.resume(throwing: URLError(.networkConnectionLost))
    }

    func receive() async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            let immediate = lock.withLock { () -> Result<Data, Error>? in
                if !frames.isEmpty { return .success(frames.removeFirst()) }
                if isDropped || isClosed { return .failure(URLError(.networkConnectionLost)) }
                waiting = continuation
                return nil
            }
            if let immediate { continuation.resume(with: immediate) }
        }
    }

    func send(_ frame: Data) async throws {
        lock.withLock { sentFrames.append(frame) }
    }

    func close() {
        let waiter = lock.withLock { () -> CheckedContinuation<Data, Error>? in
            isClosed = true
            defer { waiting = nil }
            return waiting
        }
        waiter?.resume(throwing: CancellationError())
    }
}

final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0

    func next() -> Int {
        lock.withLock {
            value += 1
            return value
        }
    }
}

final class LockedFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Bool

    init(_ value: Bool) { stored = value }

    var value: Bool {
        get { lock.withLock { stored } }
        set { lock.withLock { stored = newValue } }
    }
}

final class LockedValue<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Value

    init(_ value: Value) { stored = value }

    var value: Value {
        get { lock.withLock { stored } }
        set { lock.withLock { stored = newValue } }
    }
}

final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current = Date(timeIntervalSince1970: 1_760_691_600)

    var now: Date { lock.withLock { current } }

    func advance(_ seconds: TimeInterval) { lock.withLock { current += seconds } }
}

struct EndedSession: AccessTokenProvider {
    func currentAccessToken() async -> String? { "old" }
    func renewAccessToken(rejected: String?) async throws -> String { throw APIError.sessionEnded }
    func sessionWasEnded() async {}
}
