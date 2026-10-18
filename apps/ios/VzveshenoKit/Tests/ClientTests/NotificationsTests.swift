import API
@testable import Client
import Foundation
import Navigation
import Outbox
import Session
import TestSupport
import XCTest

/// Уведомления (`ios-notifications-center`, задача 5.4).
@MainActor
final class NotificationsModelTests: XCTestCase {
    nonisolated static func server() -> StubTransport {
        StubTransport { request in
            switch (request.method, request.path) {
            case ("GET", "/api/v1/notifications/unread-counts"):
                return .success(#"{"main":2,"content":3}"#)
            case ("GET", "/api/v1/notifications"):
                let category = (request.query ?? "").contains("category=content") ? "content" : "main"
                let items = (0..<2).map {
                    #"{"id":"\#(category)\#($0)","category":"\#(category)","type":"task_assigned","title":"Задача","#
                        + #""content":"Новая задача","createdAt":"2026-10-17T10:00:00Z","#
                        + #""target":{"kind":"task","ids":{"task_id":"9"}}}"#
                }
                return .success(#"{"notifications":[\#(items.joined(separator: ","))],"total":2,"hasMore":false}"#)
            case let ("POST", path) where path.hasSuffix("/read"):
                return .success(#"{"success":true,"readAt":"2026-10-17T10:00:02Z"}"#)
            case ("POST", "/api/v1/notifications/mark-all-read"):
                return .success(#"{"success":true,"markedCount":2}"#)
            default:
                return .error(404, code: "not_found")
            }
        }
    }

    private func makeModel(_ transport: StubTransport, sleeper: ManualSleeper = ManualSleeper()) -> NotificationsModel {
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        return NotificationsModel(api: api, sleeper: sleeper)
    }

    // Сценарий «Открытие экрана»: «Контент» остаётся непрочитанным.
    func testOpeningMainLeavesContentUnread() async {
        let transport = Self.server()
        let model = makeModel(transport)
        await model.load()
        XCTAssertEqual(model.tab, .main)
        XCTAssertEqual(model.count(.content), 3)
        XCTAssertEqual(transport.requests.filter { $0.method != "GET" }.count, 0, "открытие ничего не помечает")
        XCTAssertEqual(transport.requests(to: "/api/v1/notifications").first?.query, "category=main&limit=20&offset=0")
    }

    func testReadAfterTwoSecondsOnScreen() async {
        let transport = Self.server()
        let sleeper = ManualSleeper()
        let model = makeModel(transport, sleeper: sleeper)
        await model.load()
        let first = model.visible[0]
        model.appeared(first)
        await sleeper.waitForSleepers()
        await sleeper.advance(by: .milliseconds(1900))
        XCTAssertTrue(transport.requests(to: "/api/v1/notifications/main0/read").isEmpty)
        await sleeper.advance(by: .milliseconds(100))
        for _ in 0..<200 where transport.requests(to: "/api/v1/notifications/main0/read").isEmpty { await Task.yield() }
        for _ in 0..<200 where model.count(.main) == 2 { await Task.yield() }
        XCTAssertEqual(transport.requests(to: "/api/v1/notifications/main0/read").count, 1)
        XCTAssertTrue(model.visible[0].isRead)
        XCTAssertEqual(model.count(.main), 1)
    }

    func testScrolledAwayBeforeTwoSecondsStaysUnread() async {
        let transport = Self.server()
        let sleeper = ManualSleeper()
        let model = makeModel(transport, sleeper: sleeper)
        await model.load()
        model.appeared(model.visible[1])
        await sleeper.waitForSleepers()
        model.disappeared("main1")
        await sleeper.advance(by: .seconds(3))
        XCTAssertTrue(transport.requests.filter { $0.path.hasSuffix("/read") }.isEmpty)
    }

    /// «Прочитать все» — только открытая вкладка.
    func testMarkAllReadOnlyTouchesTheOpenTab() async {
        let transport = Self.server()
        let model = makeModel(transport)
        await model.load()
        await model.markAllRead()
        XCTAssertEqual(transport.requests(to: "/api/v1/notifications/mark-all-read").first?.json?["category"] as? String, "main")
        XCTAssertEqual(model.count(.main), 0)
        XCTAssertEqual(model.count(.content), 3)
        await model.select(.content)
        XCTAssertTrue(model.visible.allSatisfy { !$0.isRead })
    }

    // Сценарий «Задача от куратора»: target → «Сегодня» с задачей 9.
    func testTaskNotificationLinksToToday() async {
        let model = makeModel(Self.server())
        await model.load()
        XCTAssertEqual(model.visible[0].link, .dashboard(task: "9"))
        XCTAssertNil(AppNotification(id: "x", title: "t").link, "kind notifications — остаться на экране")
    }

    // Сценарий «Отзыв получен».
    func testWeeklyFeedbackShowsRatingsSummaryAndRecommendations() async {
        let transport = StubTransport { request in
            guard request.path == "/api/v1/dashboard/weekly-reports/42/feedback" else { return .error(404, code: "not_found") }
            return .success(#"{"nutrition":{"rating":"excellent","comment":"Белок в норме"},"activity":{"rating":"good"},"#
                            + #""water":{"rating":"needs_improvement","comment":"Пейте больше"},"photo_uploaded":true,"#
                            + #""summary":"Хорошая неделя","recommendations":"Добавьте овощей к ужину"}"#)
        }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let model = WeeklyFeedbackModel(api: api, reportID: "42")
        await model.load()
        XCTAssertEqual(model.feedback?.ratings.map(\.title), ["Питание", "Активность", "Вода"])
        XCTAssertEqual(model.feedback?.ratings.map(\.rating.title), ["Отлично", "Хорошо", "Есть над чем поработать"])
        XCTAssertEqual(model.feedback?.summary, "Хорошая неделя")
        XCTAssertEqual(model.feedback?.recommendations, "Добавьте овощей к ужину")
    }

    func testWeeklyFeedbackNotYetGiven() async {
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test",
                            transport: StubTransport { _ in .error(404, code: "not_found") })
        let model = WeeklyFeedbackModel(api: api, reportID: "42")
        await model.load()
        XCTAssertEqual(model.error, "Куратор ещё не оставил отзыв на этот отчёт.")
    }
}

/// Пуши: таблица переходов по `target`, действия, регистрация устройства.
final class PushTests: XCTestCase {
    /// Таблица переходов: `target.kind` → ссылка → экран клиента.
    func testTargetToRouteTable() {
        let table: [(PushTarget, ScreenLink, NavigationTarget)] = [
            (PushTarget(kind: "chat", ids: ["conversation_id": "c1", "participant_id": "3"]), .curatorConversation(id: "c1"),
             NavigationTarget(tab: .today, path: [.curatorChat])),
            (PushTarget(kind: "task", ids: ["task_id": "9"]), .dashboard(task: "9"),
             NavigationTarget(tab: .today, path: [.task(id: "9")])),
            (PushTarget(kind: "weekly_feedback", ids: ["report_id": "42"]), .weeklyFeedback(reportID: "42"),
             NavigationTarget(tab: .today, path: [.weeklyFeedback(reportID: "42")])),
            (PushTarget(kind: "plan", ids: ["plan_id": "p"]), .plan, NavigationTarget(tab: .today)),
            (PushTarget(kind: "article", ids: ["article_id": "a1", "slug": "ostatok"]), .article(slug: "ostatok"),
             NavigationTarget(tab: .articles, path: [.article(slug: "ostatok")])),
            (PushTarget(kind: "article", ids: ["article_id": "a1"]), .article(slug: "a1"),
             NavigationTarget(tab: .articles, path: [.article(slug: "a1")])),
            (PushTarget(kind: "export", ids: ["export_id": "e"]), .export, NavigationTarget(tab: .today, path: [.profile, .export])),
            (PushTarget(kind: "notifications"), .notifications, NavigationTarget(tab: .today, path: [.notifications])),
            (PushTarget(kind: "unknown_kind"), .notifications, NavigationTarget(tab: .today, path: [.notifications])),
            (PushTarget(kind: "weekly_feedback"), .notifications, NavigationTarget(tab: .today, path: [.notifications])),
        ]
        for (target, link, navigation) in table {
            XCTAssertEqual(Router.link(for: target), link, target.kind)
            XCTAssertEqual(Router.target(for: link, shell: .client), navigation, target.kind)
        }
    }

    private func payload(_ category: String, target: [String: Any]) -> PushPayload {
        PushPayload(userInfo: ["aps": ["category": category, "alert": ["title": "Задача", "body": "Выпить воду"], "badge": 2],
                               "target": target, "notification_id": "n1"])
    }

    func testPayloadParsing() {
        let parsed = payload("TASK", target: ["kind": "task", "ids": ["task_id": "9"]])
        XCTAssertEqual(parsed.category, .task)
        XCTAssertEqual(parsed.target, PushTarget(kind: "task", ids: ["task_id": "9"]))
        XCTAssertEqual(parsed.notificationID, "n1")
        XCTAssertEqual(parsed.badge, 2)
        XCTAssertFalse(parsed.isSilent)
        let silent = PushPayload(userInfo: ["aps": ["content-available": 1, "badge": 0]])
        XCTAssertTrue(silent.isSilent)
        XCTAssertEqual(silent.badge, 0)
        XCTAssertEqual(silent.target.kind, "notifications")
    }

    // Сценарии «Привычка с экрана блокировки» и «Тренировка».
    func testActionTable() {
        let habit = payload("TASK", target: ["kind": "task", "ids": ["task_id": "9", "task_type": "habit"]])
        XCTAssertEqual(PushRouting.decide(habit, action: PushAction.complete), .completeTask(id: "9"))
        XCTAssertEqual(PushRouting.decide(habit, action: PushAction.open), .open(.dashboard(task: "9")))
        XCTAssertEqual(PushRouting.decide(habit, action: PushAction.tap), .open(.dashboard(task: "9")))
        XCTAssertEqual(PushRouting.decide(habit, action: PushAction.dismiss), .ignore)
        let workout = payload("TASK_WORKOUT", target: ["kind": "task", "ids": ["task_id": "5", "task_type": "workout"]])
        XCTAssertEqual(PushRouting.decide(workout, action: PushAction.complete), .openWorkoutSheet(taskID: "5"))
        let chat = payload("CHAT_MESSAGE", target: ["kind": "chat", "ids": ["conversation_id": "c1", "participant_id": "3"]])
        XCTAssertEqual(PushRouting.decide(chat, action: PushAction.reply, text: "  Спасибо!  "),
                       .reply(conversationID: "c1", text: "Спасибо!"))
        XCTAssertEqual(PushRouting.decide(chat, action: PushAction.reply, text: "   "), .ignore)
        XCTAssertEqual(PushRouting.decide(chat, action: PushAction.tap), .open(.curatorConversation(id: "c1")))
    }

    private func outbox(_ transport: StubTransport) -> Outbox {
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        return Outbox(store: InMemoryOutboxStore(), api: api)
    }

    /// «Выполнено» — `POST /dashboard/tasks/9/complete` через очередь, без открытия.
    func testCompleteActionGoesThroughOutbox() async {
        let transport = StubTransport { _ in .success(#"{"task":{"id":"9"},"metric_synced":false}"#) }
        let performer = PushActionPerformer(outbox: outbox(transport), userID: { 7 })
        let queued = await performer.perform(.completeTask(id: "9"))
        XCTAssertTrue(queued)
        let request = transport.requests.first
        XCTAssertEqual(request?.path, "/api/v1/dashboard/tasks/9/complete")
        XCTAssertNotNil(request?.header("Idempotency-Key"))
    }

    /// Ответ из пуша переживает обрыв сети: тот же `Idempotency-Key` при досылке.
    func testReplySurvivesNetworkDrop() async {
        let offline = LockedFlag(true)
        let transport = StubTransport { _ in offline.value ? .offline : .success("{}", status: 201) }
        let queue = outbox(transport)
        let performer = PushActionPerformer(outbox: queue, userID: { 7 })
        await performer.perform(.reply(conversationID: "c1", text: "Спасибо!"))
        let waiting = try? await queue.pending().count
        XCTAssertEqual(waiting, 1, "без сети ответ ждёт в очереди")
        offline.value = false
        await queue.drain(userID: 7)
        let left = try? await queue.pending().count
        XCTAssertEqual(left, 0)
        let posts = transport.requests(to: "/api/v1/conversations/c1/messages")
        XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(posts[1].json?["content"] as? String, "Спасибо!")
        XCTAssertEqual(posts[1].json?["type"] as? String, "text")
        XCTAssertEqual(posts[0].header("Idempotency-Key"), posts[1].header("Idempotency-Key"))
    }

    func testWithoutSessionNothingIsQueued() async {
        let transport = StubTransport { _ in .success("{}") }
        let performer = PushActionPerformer(outbox: outbox(transport), userID: { nil })
        let queued = await performer.perform(.completeTask(id: "9"))
        XCTAssertFalse(queued)
        XCTAssertTrue(transport.requests.isEmpty)
    }

    func testEnvironmentByBuild() {
        XCTAssertEqual(PushEnvironment.forApp("dev"), "sandbox")
        XCTAssertEqual(PushEnvironment.forApp("prod"), "production")
    }

    func testRegistrationBodyAndUnregister() async {
        let transport = StubTransport { request in request.method == "POST" ? StubResponse(status: 204) : StubResponse(status: 204) }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let secure = InMemorySecureStore()
        let installation = InstallationID.value(in: secure)
        XCTAssertEqual(InstallationID.value(in: secure), installation, "один на установку")
        let registrar = PushRegistrar(api: api, tokens: InMemoryDeviceTokenStore(), environment: PushEnvironment.forApp("dev"),
                                      appVersion: "1.0.0", installationID: { installation })
        let registered = await registrar.didReceive(token: Data([0xAB, 0x01, 0xFF]))
        XCTAssertTrue(registered)
        let body = transport.requests.first?.json
        XCTAssertEqual(transport.requests.first?.path, "/api/v1/notifications/devices")
        XCTAssertEqual(body?["token"] as? String, "ab01ff")
        XCTAssertEqual(body?["environment"] as? String, "sandbox")
        XCTAssertEqual(body?["app_version"] as? String, "1.0.0")
        XCTAssertEqual(body?["installation_id"] as? String, installation)
        await registrar.unregister()
        XCTAssertEqual(transport.requests.last?.method, "DELETE")
        XCTAssertEqual(transport.requests.last?.path, "/api/v1/notifications/devices/ab01ff")
    }

    func testBadgeCountsMainAndChatButNotContent() {
        XCTAssertEqual(Badge.count(unread: UnreadCounts(main: 0, content: 2), chatUnread: 1), 1)
        XCTAssertEqual(Badge.count(unread: UnreadCounts(main: 3, content: 5), chatUnread: 2), 5)
        XCTAssertEqual(Badge.count(unread: nil, chatUnread: 0), 0)
    }
}
