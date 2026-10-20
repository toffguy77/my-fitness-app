import API
@testable import Client
import Foundation
import Outbox
import TestSupport
import XCTest

/// Переписка без сети (`ios-offline-outbox`): сохранённые сообщения сразу,
/// вложение — в очередь двумя шагами, «ждёт отправки» переживает перезапуск.
@MainActor
final class ChatOfflineTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)
    nonisolated private let root = FileManager.default.temporaryDirectory.appendingPathComponent("chat-offline-\(UUID().uuidString)")

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
    }

    private func chat(_ transport: StubTransport, cache: ScreenCache, outbox: Outbox? = nil, user: Int64 = 7) -> ChatModel {
        ChatModel(api: api(transport), outbox: outbox ?? Outbox(store: InMemoryOutboxStore(), api: api(transport)), cache: cache,
                  calendar: calendar, userID: user, now: { Date(timeIntervalSince1970: 1_760_700_000) })
    }

    private func seeded() async -> ScreenCache {
        let cache = ScreenCache(root: root)
        let online = chat(ChatModelTests.server(total: 3), cache: cache)
        await online.load()
        XCTAssertEqual(online.phase, .chat)
        XCTAssertNil(online.updatedLabel)
        return cache
    }

    func testSavedConversationIsShownAtOnceAndKeptOffline() async {
        let cache = await seeded()
        let model = chat(StubTransport { _ in .offline }, cache: cache)
        XCTAssertEqual(model.phase, .chat, "первый кадр — из кэша")
        XCTAssertEqual(model.messages.map(\.id), ["m0", "m1", "m2"])
        XCTAssertNotNil(model.updatedLabel)
        await model.load()
        XCTAssertEqual(model.phase, .chat)
        XCTAssertEqual(model.messages.count, 3)
        XCTAssertTrue(model.offline)
        XCTAssertNotNil(model.updatedLabel)
    }

    func testFreshConversationReplacesTheCache() async {
        let cache = await seeded()
        let model = chat(ChatModelTests.server(total: 4), cache: cache)
        await model.load()
        XCTAssertEqual(model.messages.count, 4)
        XCTAssertNil(model.updatedLabel)
        XCTAssertFalse(model.offline)
    }

    func testNoNetworkNoCacheIsAClearFailureAndAnotherAccountSeesNothing() async {
        let cache = await seeded()
        let stranger = chat(StubTransport { _ in .offline }, cache: cache, user: 8)
        XCTAssertEqual(stranger.phase, .loading)
        await stranger.load()
        XCTAssertTrue(stranger.messages.isEmpty)
        XCTAssertEqual(stranger.phase, .failed(ErrorMessages().message(for: APIError.network)))
        XCTAssertTrue(stranger.offline)
    }

    /// Фото без сети: пузырь «ждёт отправки», файл — в очереди (не в строке
    /// SQLite), после перезапуска пузырь на месте; сеть — загрузка, затем
    /// сообщение с адресом файла и своим `Idempotency-Key`.
    func testAttachmentIsQueuedInTwoStepsAndSurvivesRelaunch() async throws {
        let cache = await seeded()
        let offline = LockedFlag(true)
        let server = ChatModelTests.server(total: 3)
        let transport = StubTransport { request in offline.value && request.method == "POST" ? .offline : server.handle(request) }
        let store = try SQLiteOutboxStore(url: root.appendingPathComponent("outbox.sqlite"))
        let files = root.appendingPathComponent("outbox-files")
        let model = chat(transport, cache: cache, outbox: Outbox(store: store, api: api(transport), files: files))
        await model.load()
        let photo = AttachmentDraft(data: Data(repeating: 7, count: 200_000), fileName: "plate.jpg", mimeType: "image/jpeg")
        let queued = await model.send(photo)
        XCTAssertTrue(queued)
        XCTAssertEqual(model.pending.map(\.text), ["Фото"])
        let item = try XCTUnwrap(try store.pending().first)
        XCTAssertNil(item.body, "мегабайты — в файле рядом с очередью")
        XCTAssertNotNil(item.bodyFile)

        // Перезапуск без сети.
        let relaunched = chat(transport, cache: cache, outbox: Outbox(store: store, api: api(transport), files: files))
        await relaunched.load()
        XCTAssertEqual(relaunched.pending.map(\.text), ["Фото"])
        XCTAssertEqual(relaunched.pending.first?.status, .waiting)

        offline.value = false
        await relaunched.flush()
        XCTAssertEqual(transport.requests(to: "/api/v1/conversations/c1/upload").last?.body?.count ?? 0 > 200_000, true)
        let message = try XCTUnwrap(transport.requests(to: "/api/v1/conversations/c1/messages").last { $0.method == "POST" })
        XCTAssertEqual(message.json?["type"] as? String, "image")
        XCTAssertEqual(message.json?["content"] as? String, "https://storage.yandexcloud.net/chats/a.jpg")
        XCTAssertNotNil(message.header("Idempotency-Key"))
        XCTAssertTrue(try store.pending().isEmpty)
        XCTAssertTrue(relaunched.pending.isEmpty)
        XCTAssertTrue((try? FileManager.default.contentsOfDirectory(atPath: files.path))?.isEmpty ?? true, "файл снят с очереди")
    }
}
