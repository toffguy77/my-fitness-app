import API
import Client
@testable import Curator
import Foundation
import Navigation
import Outbox
import TestSupport
import XCTest

@MainActor
final class InboxTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)

    private func api(_ handler: @escaping StubTransport.Handler) -> (APIClient, StubTransport) {
        let transport = StubTransport(handler: handler)
        return (APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios", transport: transport), transport)
    }

    // MARK: Чаты

    // Сценарий «Порядок»: непрочитанное вчера выше прочитанного сегодня.
    func testUnreadYesterdayAboveReadToday() throws {
        let list = try JSONDecoder().decode([CuratorConversation].self, from: Data("""
        [{"id":"b","client_id":2,"curator_id":3,"unread_count":0,"participant":{"id":2,"name":"Борис"},
          "last_message":{"id":"m2","type":"text","content":"Ок","created_at":"2026-10-19T10:00:00Z"}},
         {"id":"e","client_id":5,"curator_id":3,"unread_count":0,"participant":{"id":5,"name":"Ева"}},
         {"id":"a","client_id":1,"curator_id":3,"unread_count":2,"participant":{"id":1,"name":"Алла"},
          "last_message":{"id":"m1","type":"image","content":"https://x","created_at":"2026-10-18T10:00:00Z"}},
         {"id":"c","client_id":4,"curator_id":3,"unread_count":0,"participant":{"id":4,"name":"Вера"},
          "last_message":{"id":"m3","type":"food_entry","content":"x","created_at":"2026-10-19T12:00:00Z"}}]
        """.utf8))
        XCTAssertEqual(ConversationOrder.sorted(list).map(\.id), ["a", "c", "b", "e"])
        XCTAssertEqual(ConversationOrder.sorted(list).map(\.preview), ["Фото", "КБЖУ запись", "Ок", "Нет сообщений"])
    }

    // Сценарий «Переписки нет»: `404` — «не найдена», а не вечная загрузка.
    func testByParticipantNotFound() async {
        let (api, transport) = api { _ in .error(404, code: "not_found", message: "Переписка не найдена") }
        let model = CuratorConversationModel(api: api, reference: .client(42), curatorID: 3, calendar: calendar)
        await model.load()
        XCTAssertEqual(model.phase, .notFound)
        XCTAssertEqual(transport.requests.map(\.path), ["/api/v1/conversations/by-participant/42"])
        XCTAssertEqual(CuratorConversationModel.notFoundText, "Переписка с клиентом не найдена")
    }

    func testByParticipantOpensConversation() async {
        let (api, _) = api { request in
            switch request.path {
            case "/api/v1/conversations/by-participant/42":
                return .success(#"{"id":"c9","client_id":42,"curator_id":3,"unread_count":1,"participant":{"id":42,"name":"Мария К."}}"#)
            case "/api/v1/conversations/c9/messages":
                return .success(#"[{"id":"m2","conversation_id":"c9","sender_id":42,"type":"image","content":"https://storage.yandexcloud.net/chats/p.jpg","created_at":"2026-10-19T17:14:00Z"},"#
                                + #"{"id":"m1","conversation_id":"c9","sender_id":3,"type":"text","content":"Привет","#
                                + #""created_at":"2026-10-19T09:00:00Z"}]"#)
            default:
                return .success(#"{"status":"ok"}"#)
            }
        }
        let model = CuratorConversationModel(api: api, reference: .client(42), curatorID: 3, calendar: calendar)
        await model.load()
        XCTAssertEqual(model.phase, .chat)
        XCTAssertEqual(model.title, "Мария К.")
        XCTAssertEqual(model.messages.map(\.id), ["m1", "m2"])
        XCTAssertTrue(model.canEnterFood(model.messages[1]))
        XCTAssertFalse(model.canEnterFood(model.messages[0]))
    }

    // Сценарий «Фото в 20:14»: приём «Ужин».
    func testPhotoAt2014SelectsDinner() {
        let photo = calendar.calendar.date(from: DateComponents(year: 2026, month: 10, day: 19, hour: 20, minute: 14)) ?? Date()
        XCTAssertEqual(FoodEntryDraft(photoTime: photo, calendar: calendar).meal, .dinner)
        let morning = calendar.calendar.date(from: DateComponents(year: 2026, month: 10, day: 19, hour: 8, minute: 5)) ?? Date()
        XCTAssertEqual(FoodEntryDraft(photoTime: morning, calendar: calendar).meal, .breakfast)
    }

    /// Часы — клиента: 20:14 по Екатеринбургу — это 18:14 по Москве, всё ещё ужин;
    /// 23:30 у клиента — перекус, хотя у куратора 21:30.
    func testMealUsesClientTimeZone() {
        let model = CuratorConversationModel(api: APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios"),
                                             reference: .client(11), curatorID: 3, calendar: calendar)
        model.client = CuratorClient(id: 11, name: "Мария К.", timezone: "Asia/Yekaterinburg")
        let late = calendar.calendar.date(from: DateComponents(year: 2026, month: 10, day: 19, hour: 21, minute: 30)) ?? Date()
        XCTAssertEqual(FoodEntryDraft(photoTime: late, calendar: model.clientCalendar).meal, .snack)
        XCTAssertEqual(FoodEntryDraft(photoTime: late, calendar: calendar).meal, .dinner)
    }

    // Сценарий «Успех» и ошибка сети: лист сохраняет введённое (модель бросает).
    func testFoodEntrySubmitAndFailure() async throws {
        let (api, transport) = api { request in
            switch request.path {
            case "/api/v1/conversations/by-participant/42":
                return .success(#"{"id":"c9","client_id":42,"curator_id":3,"unread_count":0,"participant":{"id":42,"name":"Мария К."}}"#)
            case "/api/v1/conversations/c9/messages": return .success("[]")
            case "/api/v1/conversations/c9/messages/m2/food-entry":
                return .success(#"{"id":"m9","conversation_id":"c9","sender_id":3,"type":"food_entry","content":"Торт","#
                                + #""metadata":{"food_name":"Торт «Наполеон»","meal_type":"dinner","weight":180,"#
                                + #""calories":684,"protein":9,"fat":45,"carbs":0},"#
                                + #""created_at":"2026-10-19T17:40:00Z"}"#, status: 201)
            default: return .success(#"{"status":"ok"}"#)
            }
        }
        let model = CuratorConversationModel(api: api, reference: .client(42), curatorID: 3, calendar: calendar)
        await model.load()
        let photo = ChatMessage(id: "m2", conversationID: "c9", senderID: 42, kind: .image, content: nil, createdAt: Date())
        var draft = FoodEntryDraft(photoTime: Date(), calendar: calendar)
        draft.name = "Торт «Наполеон»"
        draft.meal = .dinner
        draft.weight = "180"
        draft.calories = "684"
        draft.protein = "9"
        draft.fat = "45"
        draft.carbs = "0"
        XCTAssertTrue(draft.isValid, "0 г углеводов — допустимо")
        try await model.submitFoodEntry(draft, photo: photo)
        let body = try XCTUnwrap(transport.requests(to: "/api/v1/conversations/c9/messages/m2/food-entry").first?.json)
        XCTAssertEqual(body["food_name"] as? String, "Торт «Наполеон»")
        XCTAssertEqual(body["meal_type"] as? String, "dinner")
        XCTAssertEqual(body["carbs"] as? Double, 0)
        XCTAssertEqual(model.messages.last?.foodEntry?.caption, "Записано в дневник · ужин")

        transport.setHandler { _ in .offline }
        do {
            try await model.submitFoodEntry(draft, photo: photo)
            XCTFail("ошибка сети должна дойти до листа")
        } catch {
            XCTAssertEqual(error as? APIError, .network)
        }
        XCTAssertEqual(draft.name, "Торт «Наполеон»")
    }

    func testFoodDraftValidation() {
        var draft = FoodEntryDraft(photoTime: Date(), calendar: calendar)
        XCTAssertFalse(draft.isValid)
        draft.name = "Суп"
        draft.weight = "0"
        draft.calories = "120"
        draft.protein = "5"
        draft.fat = "3"
        draft.carbs = "12"
        XCTAssertFalse(draft.isValid, "вес больше нуля")
        draft.weight = "300,5"
        XCTAssertTrue(draft.isValid)
        draft.fat = "-1"
        XCTAssertFalse(draft.isValid)
    }

    func testSendFailureKeepsText() async {
        let (api, transport) = api { request in
            switch request.path {
            case "/api/v1/conversations/by-participant/42":
                return .success(#"{"id":"c9","client_id":42,"curator_id":3,"participant":{"id":42,"name":"Мария К."}}"#)
            case "/api/v1/conversations/c9/messages" where request.method == "GET": return .success("[]")
            default: return .error(403, code: "curator_access_required")
            }
        }
        let model = CuratorConversationModel(api: api, reference: .client(42), curatorID: 3, calendar: calendar)
        await model.load()
        let sent = await model.send("Ничего страшного")
        XCTAssertFalse(sent)
        XCTAssertNotNil(model.notice)
        XCTAssertEqual(transport.requests(to: "/api/v1/conversations/c9/messages").last?.json?["content"] as? String, "Ничего страшного")
    }

    func testHeaderSubtitle() {
        let model = CuratorConversationModel(api: APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios"),
                                             reference: .client(11), curatorID: 3, calendar: calendar)
        XCTAssertEqual(model.subtitle, "клиент")
        model.client = CuratorClient(id: 11, name: "Мария К.", todayKBZHU: Macros(calories: 2960, protein: 0, fat: 0, carbs: 0),
                                     plan: Macros(calories: 2240, protein: 0, fat: 0, carbs: 0))
        XCTAssertEqual(model.subtitle, "сегодня 2\u{00A0}960 из 2\u{00A0}240 ккал")
    }

    // MARK: Ответ из пуша

    // Сценарий «Ответ с экрана блокировки»: «Принято» — в переписку из
    // `target.ids.conversation_id`, через очередь с Idempotency-Key.
    func testPushReplyGoesThroughOutbox() async throws {
        let userInfo: [AnyHashable: Any] = [
            "aps": ["category": "CHAT_MESSAGE", "alert": ["title": "Мария К.", "body": "Спасибо!"]],
            "target": ["kind": "chat", "ids": ["conversation_id": "c9", "participant_id": "42"]],
        ]
        let decision = PushRouting.decide(PushPayload(userInfo: userInfo), action: PushAction.reply, text: "Принято")
        XCTAssertEqual(decision, .reply(conversationID: "c9", text: "Принято"))
        let (api, transport) = api { _ in .success(#"{"id":"m1"}"#, status: 201) }
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api)
        let performed = await PushActionPerformer(outbox: outbox, userID: { 3 }).perform(decision)
        XCTAssertTrue(performed)
        let request = try XCTUnwrap(transport.requests(to: "/api/v1/conversations/c9/messages").first)
        XCTAssertEqual(request.json?["content"] as? String, "Принято")
        XCTAssertEqual(request.json?["type"] as? String, "text")
        XCTAssertNotNil(request.header("Idempotency-Key"))
        // Нажатие на сам пуш куратора — переписка во вкладке «Чаты».
        let open = PushRouting.decide(PushPayload(userInfo: userInfo), action: PushAction.tap)
        guard case let .open(link) = open else { return XCTFail("\(open)") }
        XCTAssertEqual(Router.target(for: link, shell: .curator), NavigationTarget(tab: .chats, path: [.conversation(id: "c9")]))
    }

    // MARK: Заявки

    private let leadsJSON = fixture("leads")

    func testLeadsKeepServerOrderAndLines() async {
        let leadsJSON = leadsJSON
        let (api, transport) = api { _ in .success(leadsJSON) }
        let model = LeadsModel(api: api)
        await model.load()
        XCTAssertEqual(transport.requests.first?.query, "limit=50")
        XCTAssertEqual(model.leads.map(\.id), ["l1", "l2", "l3"])
        XCTAssertEqual(model.waiting, 3)
        let first = model.leads[0]
        XCTAssertEqual(first.parametersLine, "Снижение · 168 см · 74 кг · 1\u{00A0}780 ккал")
        XCTAssertEqual(first.stepLine, "остановился: увидел расчёт")
        XCTAssertEqual(first.sourceLine, "yandex · cpc · kbzhu_autumn")
        XCTAssertEqual(first.waitingLine, "ждёт 3 дня")
        // Сценарий «Заявка без параметров».
        XCTAssertEqual(model.leads[1].parametersLine, "Параметры не заполнены")
        XCTAssertEqual(model.leads[1].title, "Без имени")
        XCTAssertEqual(model.leads[1].sourceLine, "t.me")
        XCTAssertEqual(model.leads[1].conversationID, "s1")
        XCTAssertEqual(model.leads[2].sourceLine, "Источник перехода неизвестен")
        XCTAssertFalse(model.leads[2].contactAllowed)
        XCTAssertEqual(model.leads[2].waitingLine, "сегодня")
        model.includeHandled = true
        await model.load()
        XCTAssertEqual(transport.requests.last?.query, "limit=50&include_handled=true")
    }

    // Сценарий «Заявку взял другой куратор».
    func testLeadAlreadyClaimed() async {
        let leadsJSON = leadsJSON
        let (api, _) = api { request in
            request.method == "GET" ? .success(leadsJSON) : .error(409, code: "lead_already_claimed")
        }
        let lookup: ErrorMessages.Lookup = { $0 == "error.lead_already_claimed" ? "Заявку уже обработал другой куратор" : nil }
        let model = LeadsModel(api: api, messages: ErrorMessages(lookup: lookup))
        await model.load()
        await model.markHandled("l1")
        XCTAssertEqual(model.notice, "Заявку уже обработал другой куратор")
        XCTAssertTrue(model.leads[0].handled)
        XCTAssertEqual(model.waiting, 2)
    }

    func testLeadHandled() async {
        let leadsJSON = leadsJSON
        let (api, transport) = api { request in request.method == "GET" ? .success(leadsJSON) : .success(#"{"handled":true}"#) }
        let model = LeadsModel(api: api)
        await model.load()
        await model.markHandled("l2")
        XCTAssertEqual(transport.requests.last?.path, "/api/v1/curator/leads/l2/handled")
        XCTAssertTrue(model.leads[1].handled)
        XCTAssertNil(model.notice)
    }

    // MARK: Обращения

    func testSupportQueueAndThread() async throws {
        let (api, transport) = api { request in
            switch (request.method, request.path) {
            case ("GET", "/api/v1/curator/support/conversations"):
                return .success(#"{"items":[{"id":"s1","channel":"telegram","status":"escalated","telegram_username":"nina_run","#
                                + #""escalation_reason":"вопрос про медицинские противопоказания","#
                                + #""last_message_at":"2026-10-19T09:00:00Z"},"#
                                + #"{"id":"s2","channel":"web","status":"open","last_message_at":"2026-10-19T08:00:00Z"},"#
                                + #"{"id":"s3","channel":"telegram","status":"closed","telegram_name":"Олег","#
                                + #""last_message_at":"2026-10-18T08:00:00Z"}],"total":3}"#)
            case ("GET", "/api/v1/curator/support/conversations/s1"):
                return .success(#"{"conversation":{"id":"s1","channel":"telegram","status":"escalated","telegram_username":"nina_run"},"#
                                + #""messages":[{"id":"u1","author":"user","text":"Можно ли?","created_at":"2026-10-19T09:00:00Z"},"#
                                + #"{"id":"o1","author":"operator","text":"Здравствуйте!","#
                                + #""created_at":"2026-10-19T09:10:00Z","delivered":false}],"#
                                + #""lead":{"id":"l9","email":"n@mail.ru","last_step":"contact","summary":"цель: loss"}}"#)
            case ("POST", "/api/v1/curator/support/conversations/s1/messages/o1/retry"):
                return .success(#"{"message":{"id":"o1","author":"operator","text":"Здравствуйте!","#
                                + #""created_at":"2026-10-19T09:10:00Z","delivered":true}}"#)
            case ("POST", "/api/v1/curator/support/conversations/s1/close"):
                return .success(#"{"closed":true}"#)
            default:
                return .error(404, code: "not_found")
            }
        }
        let queue = SupportQueueModel(api: api)
        await queue.load()
        XCTAssertEqual(queue.conversations.map(\.statusTitle), ["Ждёт ответа", "Отвечает бот", "Закрыто"])
        XCTAssertEqual(queue.conversations.map(\.title), ["@nina_run", "Без имени", "Олег"])
        XCTAssertEqual(queue.escalated, 1)
        // Подпись поля ответа — по каналу (сценарий «Обращение с сайта»).
        XCTAssertEqual(queue.conversations[0].replyPlaceholder, "Ответ уйдёт в Telegram")
        XCTAssertEqual(queue.conversations[1].replyPlaceholder, "Ответ увидит посетитель сайта")

        let thread = SupportThreadModel(api: api, conversationID: "s1")
        await thread.load()
        XCTAssertEqual(thread.thread?.messages.map(\.authorTitle), ["Пользователь", "Оператор"])
        XCTAssertEqual(thread.thread?.lead?.line, "n@mail.ru · остановился: оставил контакт · цель: loss")
        // Сценарий «Telegram не принял ответ»: подпись, затем повтор без дубля.
        XCTAssertEqual(thread.thread?.messages.map(\.undelivered), [false, true])
        await thread.retry("o1")
        XCTAssertEqual(thread.thread?.messages.map(\.undelivered), [false, false])
        XCTAssertEqual(thread.thread?.messages.count, 2)
        let closed = await thread.close()
        XCTAssertTrue(closed)
        XCTAssertEqual(transport.requests.last?.path, "/api/v1/curator/support/conversations/s1/close")
    }

    func testRetryFailureKeepsCaption() async {
        let (api, _) = api { request in
            request.method == "GET"
                ? .success(#"{"conversation":{"id":"s1","channel":"telegram","status":"escalated"},"#
                           + #""messages":[{"id":"o1","author":"operator","text":"Ответ","#
                           + #""created_at":"2026-10-19T09:10:00Z","delivered":false}],"lead":null}"#)
                : .error(502, code: "delivery_failed")
        }
        let lookup: ErrorMessages.Lookup = { $0 == "error.delivery_failed" ? "Telegram снова не принял" : nil }
        let thread = SupportThreadModel(api: api, conversationID: "s1", messages: ErrorMessages(lookup: lookup))
        await thread.load()
        await thread.retry("o1")
        XCTAssertEqual(thread.thread?.messages.first?.undelivered, true)
        XCTAssertEqual(thread.notice, "Telegram снова не принял")
    }

    func testSupportSubtitle() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let escalated = SupportConversation(id: "s", status: "escalated", escalatedAt: now.addingTimeInterval(-12 * 60))
        XCTAssertEqual(escalated.subtitle(now: now), "Telegram · ждёт ответа 12 мин")
        XCTAssertEqual(SupportConversation(id: "w", channel: "web", status: "open").subtitle(now: now), "Сайт · отвечает бот")
    }
}
