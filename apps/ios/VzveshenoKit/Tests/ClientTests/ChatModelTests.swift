import API
@testable import Client
import Foundation
import Outbox
import TestSupport
import XCTest

/// Переписка с куратором (`ios-client-chat`, задачи 5.1–5.2).
@MainActor
final class ChatModelTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)
    nonisolated private static let base = Date(timeIntervalSince1970: 1_760_691_600)

    /// Сообщение `index` (0 — самое старое) с шагом в минуту.
    nonisolated static func message(_ index: Int, sender: Int64 = 3, text: String? = nil) -> String {
        let date = ISO8601DateFormatter().string(from: base.addingTimeInterval(Double(index) * 60))
        return #"{"id":"m\#(index)","conversation_id":"c1","sender_id":\#(sender),"type":"text","#
            + #""content":"\#(text ?? "сообщение \(index)")","created_at":"\#(date)"}"#
    }

    /// Сервер с перепиской из `total` сообщений: страницы от новых к старым.
    nonisolated static func server(total: Int = 120, access: String = #"{"allowed":true,"expired":false}"#,
                                   conversations: String? = nil, extra: LockedFlag = LockedFlag(false),
                                   offline: LockedFlag = LockedFlag(false)) -> StubTransport {
        StubTransport { request in
            switch (request.method, request.path) {
            case ("GET", "/api/v1/conversations/access"):
                return .success(access)
            case ("GET", "/api/v1/conversations"):
                return .success(conversations
                    ?? #"[{"id":"c1","client_id":7,"curator_id":3,"unread_count":2,"participant":{"id":3,"name":"Анна Смирнова"}}]"#)
            case ("GET", "/api/v1/conversations/c1/messages"):
                let query = Dictionary(uniqueKeysWithValues: (request.query ?? "").split(separator: "&").map {
                    let pair = $0.split(separator: "=", maxSplits: 1).map(String.init)
                    return (pair[0], pair.count > 1 ? pair[1] : "")
                })
                let limit = Int(query["limit"] ?? "50") ?? 50
                let count = total + (extra.value ? 1 : 0)
                let newest = query["cursor"].flatMap { Int($0.dropFirst()) }.map { $0 - 1 } ?? (count - 1)
                let indices = stride(from: newest, to: max(newest - limit, -1), by: -1)
                return .success("[" + indices.map { message($0) }.joined(separator: ",") + "]")
            case ("POST", "/api/v1/conversations/c1/read"):
                return .success(#"{"status":"ok"}"#)
            case ("POST", "/api/v1/conversations/c1/messages"):
                if offline.value { return .offline }
                return .success(message(total, sender: 7), status: 201)
            case ("POST", "/api/v1/conversations/c1/upload"):
                return .success(#"{"id":"a1","file_url":"https://storage.yandexcloud.net/burcev-chat/a.jpg","file_name":"a.jpg","file_size":10,"mime_type":"image/jpeg"}"#)
            default:
                return .error(404, code: "not_found")
            }
        }
    }

    private func makeModel(_ transport: StubTransport, sleeper: Sleeper = TaskSleeper()) -> (ChatModel, Outbox) {
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api)
        return (ChatModel(api: api, outbox: outbox, calendar: calendar, userID: 7, sleeper: sleeper, now: { Self.base }), outbox)
    }

    func testLoadsTheLatestPageInOrder() async {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        XCTAssertEqual(model.phase, .chat)
        XCTAssertEqual(model.curatorName, "Анна Смирнова")
        XCTAssertEqual(model.messages.count, 50)
        XCTAssertEqual(model.messages.first?.id, "m70")
        XCTAssertEqual(model.messages.last?.id, "m119")
        XCTAssertTrue(model.hasEarlier)
        XCTAssertTrue(model.canSend)
    }

    // Сценарий «Подгрузка истории».
    func testScrollingToTheStartRequestsTheNextFiftyWithTheFirstShownCursor() async {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        await model.loadEarlier()
        let request = transport.requests(to: "/api/v1/conversations/c1/messages").last
        XCTAssertEqual(request?.query?.contains("cursor=m70"), true, request?.query ?? "")
        XCTAssertEqual(request?.query?.contains("limit=50"), true)
        XCTAssertEqual(model.messages.count, 100)
        XCTAssertEqual(model.messages.first?.id, "m20")
        await model.loadEarlier()
        XCTAssertEqual(model.messages.count, 120)
        XCTAssertFalse(model.hasEarlier, "страница короче 50 — начало переписки")
    }

    // Сценарий «Ответ куратора при открытом чате».
    func testCuratorReplyAppearsAndIsMarkedRead() async {
        let extra = LockedFlag(false)
        let transport = Self.server(extra: extra)
        let (model, _) = makeModel(transport)
        model.isVisible = true
        await model.load()
        let readsBefore = transport.requests(to: "/api/v1/conversations/c1/read").count
        extra.value = true
        await model.handle(.newMessage(conversationID: "c1"))
        XCTAssertEqual(model.messages.last?.id, "m120")
        XCTAssertEqual(transport.requests(to: "/api/v1/conversations/c1/read").count, readsBefore + 1)
    }

    /// Сообщение пришло, пока чат не на экране, — прочтение не отправляется.
    func testHiddenChatDoesNotMarkRead() async {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        await model.handle(.newMessage(conversationID: "c1"))
        XCTAssertTrue(transport.requests(to: "/api/v1/conversations/c1/read").isEmpty)
        model.isVisible = true
        await model.markRead()
        XCTAssertEqual(transport.requests(to: "/api/v1/conversations/c1/read").count, 1)
        XCTAssertEqual(model.conversation?.unreadCount, 0)
    }

    func testTypingShowsAndFadesAfterFiveSeconds() async {
        let sleeper = ManualSleeper()
        let (model, _) = makeModel(Self.server(), sleeper: sleeper)
        await model.load()
        await model.handle(.typing(conversationID: "c1"))
        XCTAssertTrue(model.curatorTyping)
        await sleeper.waitForSleepers()
        await sleeper.advance(by: .seconds(5))
        XCTAssertFalse(model.curatorTyping)
    }

    /// Отправка — через очередь с `Idempotency-Key`; без сети — «ждёт
    /// отправки», с сетью — тот же ключ.
    func testOfflineMessageWaitsAndIsResentWithTheSameKey() async {
        let offline = LockedFlag(true)
        let transport = Self.server(offline: offline)
        let (model, _) = makeModel(transport)
        await model.load()
        await model.send("Взвесилась, 78,4")
        XCTAssertEqual(model.pending.map(\.text), ["Взвесилась, 78,4"])
        XCTAssertEqual(model.pending.first?.status, .waiting)
        let first = transport.requests(to: "/api/v1/conversations/c1/messages").first { $0.method == "POST" }
        XCTAssertEqual(first?.json?["type"] as? String, "text")
        XCTAssertEqual(first?.json?["content"] as? String, "Взвесилась, 78,4")
        offline.value = false
        await model.flush()
        let posts = transport.requests(to: "/api/v1/conversations/c1/messages").filter { $0.method == "POST" }
        XCTAssertEqual(posts.count, 2)
        XCTAssertNotNil(posts[0].header("Idempotency-Key"))
        XCTAssertEqual(posts[0].header("Idempotency-Key"), posts[1].header("Idempotency-Key"))
        XCTAssertTrue(model.pending.isEmpty)
    }

    // Сценарий «Файл 14 МБ».
    func testFileOverTenMegabytesIsRejectedBeforeSending() async {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        let draft = AttachmentDraft(data: Data(count: 14 * 1024 * 1024), fileName: "анализы.pdf", mimeType: "application/pdf")
        let sent = await model.send(draft)
        XCTAssertFalse(sent)
        XCTAssertEqual(model.notice, "Файл больше 10 МБ")
        XCTAssertTrue(transport.requests(to: "/api/v1/conversations/c1/upload").isEmpty)
        XCTAssertTrue(transport.requests.filter { $0.method == "POST" && $0.path.hasSuffix("/messages") }.isEmpty)
    }

    func testPhotoIsUploadedThenSentAsImage() async {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        let sent = await model.send(AttachmentDraft(data: Data(count: 1000), fileName: "photo.jpg", mimeType: "image/jpeg"))
        XCTAssertTrue(sent)
        let upload = transport.requests(to: "/api/v1/conversations/c1/upload").first
        XCTAssertEqual(upload?.header("Content-Type")?.hasPrefix("multipart/form-data"), true)
        XCTAssertEqual(upload.flatMap { String(data: $0.body ?? Data(), encoding: .isoLatin1) }?.contains(#"name="file""#), true)
        let post = transport.requests.last { $0.method == "POST" && $0.path == "/api/v1/conversations/c1/messages" }
        XCTAssertEqual(post?.json?["type"] as? String, "image")
        XCTAssertEqual(post?.json?["content"] as? String, "https://storage.yandexcloud.net/burcev-chat/a.jpg")
    }

    // Сценарий «Доступ истёк».
    func testExpiredAccessKeepsHistoryReadOnly() async {
        let transport = Self.server(access: #"{"allowed":false,"expired":true,"expires_at":"2026-10-01","conversation_id":"c1"}"#)
        let (model, _) = makeModel(transport)
        await model.load()
        XCTAssertEqual(model.phase, .chat)
        XCTAssertEqual(model.messages.count, 50, "история видна")
        XCTAssertFalse(model.canSend, "поле ввода скрыто")
        XCTAssertEqual(model.expiredNotice, "Доступ действовал до 1 октября")
        await model.send("ещё вопрос")
        XCTAssertTrue(transport.requests.filter { $0.method == "POST" && $0.path.hasSuffix("/messages") }.isEmpty)
    }

    // Сценарий «Куратор не назначен».
    func testNoCuratorAssigned() async {
        let (model, _) = makeModel(Self.server(conversations: "[]"))
        await model.load()
        XCTAssertEqual(model.phase, .noCurator)
    }

    /// Без доступа — экран «Работа с куратором», переписка не запрашивается.
    func testNoAccess() async {
        let transport = Self.server(access: #"{"allowed":false,"expired":false}"#)
        let (model, _) = makeModel(transport)
        await model.load()
        XCTAssertEqual(model.phase, .noAccess)
        XCTAssertTrue(transport.requests(to: "/api/v1/conversations").isEmpty)
    }

    func testTimelineSeparatesDays() {
        let now = Self.base
        let messages = [
            ChatMessage(id: "a", senderID: 3, content: "раньше", createdAt: now.addingTimeInterval(-3 * 86_400)),
            ChatMessage(id: "b", senderID: 3, content: "вчера", createdAt: now.addingTimeInterval(-86_400)),
            ChatMessage(id: "c", senderID: 7, content: "сегодня", createdAt: now),
            ChatMessage(id: "d", senderID: 3, content: "сегодня", createdAt: now.addingTimeInterval(60)),
        ]
        let days = ChatTimeline.items(messages, calendar: calendar, now: now).compactMap { item -> String? in
            if case let .day(_, title) = item { return title }
            return nil
        }
        XCTAssertEqual(days, ["14 октября", "Вчера", "Сегодня"])
        XCTAssertEqual(ChatTimeline.time(now, calendar: calendar), "12:00")
    }

    func testFoodEntryCard() throws {
        let json = #"{"id":"f","conversation_id":"c1","sender_id":3,"type":"food_entry","content":"Куриная грудка","#
            + #""metadata":{"food_entry_id":"e","food_name":"Куриная грудка","meal_type":"lunch","weight":150,"#
            + #""calories":229,"protein":46,"fat":5,"carbs":0},"created_at":"2025-10-17T10:21:00.123Z"}"#
        let message = try JSONDecoder().decode(ChatMessage.self, from: Data(json.utf8))
        XCTAssertEqual(message.foodEntry?.caption, "Записано в дневник · обед")
        XCTAssertEqual(message.foodEntry?.title, "Куриная грудка, 150 г")
        XCTAssertEqual(message.createdAt.timeIntervalSince1970, 1_760_696_460.123, accuracy: 0.01)
    }
}
