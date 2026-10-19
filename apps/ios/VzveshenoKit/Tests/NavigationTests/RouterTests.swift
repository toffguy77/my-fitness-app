import Foundation
@testable import Navigation
import XCTest

/// Таблица «адрес → путь» на каждую строку `ios-deep-links`.
final class RouterTests: XCTestCase {
    private func target(_ url: String, _ shell: Shell) throws -> NavigationTarget {
        let link = try XCTUnwrap(Router.parse(XCTUnwrap(URL(string: url))), url)
        guard case let .screen(screen) = link else {
            XCTFail("\(url) — ссылка входа, а не экран")
            return NavigationTarget(tab: nil)
        }
        return Router.target(for: screen, shell: shell)
    }

    func testClientTable() throws {
        let rows: [(String, NavigationTarget)] = [
            ("https://burcev.team/content/kak-schitat-kbzhu",
             NavigationTarget(tab: .articles, path: [.article(slug: "kak-schitat-kbzhu")])),
            ("https://burcev.team/dashboard?task=17", NavigationTarget(tab: .today, path: [.task(id: "17")])),
            ("https://burcev.team/dashboard", NavigationTarget(tab: .today)),
            ("https://burcev.team/food-tracker?date=2026-10-15&add=barcode",
             NavigationTarget(tab: .diary, path: [.diaryDay(date: "2026-10-15", add: .barcode)])),
            ("https://burcev.team/food-tracker", NavigationTarget(tab: .diary, path: [.diaryDay(date: nil, add: nil)])),
            ("https://burcev.team/chat", NavigationTarget(tab: .today, path: [.curatorChat])),
            ("https://burcev.team/notifications", NavigationTarget(tab: .today, path: [.notifications])),
            ("https://new.burcev.team/food-tracker?date=2026-10-15&add=photo",
             NavigationTarget(tab: .diary, path: [.diaryDay(date: "2026-10-15", add: .photo)])),
            ("https://burcev.team/food-tracker?add=manual",
             NavigationTarget(tab: .diary, path: [.diaryDay(date: nil, add: .manual)])),
            ("https://burcev.team/food-tracker?add=search",
             NavigationTarget(tab: .diary, path: [.diaryDay(date: nil, add: .search)])),
        ]
        for (url, expected) in rows {
            XCTAssertEqual(try target(url, .client), expected, url)
        }
    }

    func testCuratorTable() throws {
        let rows: [(String, NavigationTarget)] = [
            ("https://burcev.team/curator/clients/7?tab=plan", NavigationTarget(tab: .clients, path: [.client(id: "7", tab: "plan")])),
            ("https://burcev.team/curator/clients/7", NavigationTarget(tab: .clients, path: [.client(id: "7", tab: nil)])),
            ("https://burcev.team/curator/chat/42", NavigationTarget(tab: .chats, path: [.conversation(id: "42")])),
            ("https://burcev.team/curator/support?conversation=9",
             NavigationTarget(tab: .support, path: [.supportConversation(id: "9")])),
            ("https://burcev.team/curator", NavigationTarget(tab: .clients)),
            ("https://burcev.team/notifications", NavigationTarget(tab: .clients, path: [.notifications])),
        ]
        for (url, expected) in rows {
            XCTAssertEqual(try target(url, .curator), expected, url)
        }
    }

    // Сценарий «Ссылка на день и способ».
    func testDiaryDayAndBarcode() throws {
        let result = try target("https://burcev.team/food-tracker?date=2026-10-15&add=barcode", .client)
        XCTAssertEqual(result.tab, .diary)
        XCTAssertEqual(result.path, [.diaryDay(date: "2026-10-15", add: .barcode)])
    }

    func testMalformedDateIsIgnored() throws {
        XCTAssertEqual(try target("https://burcev.team/food-tracker?date=вчера&add=лопата", .client).path,
                       [.diaryDay(date: nil, add: nil)])
    }

    // Сценарий «Пуш об отзыве на отчёт».
    func testWeeklyFeedbackPush() throws {
        let json = Data(#"{"kind":"weekly_feedback","ids":{"report_id":42}}"#.utf8)
        let push = try JSONDecoder().decode(PushTarget.self, from: json)
        XCTAssertEqual(Router.target(for: Router.link(for: push), shell: .client),
                       NavigationTarget(tab: .today, path: [.weeklyFeedback(reportID: "42")]))
    }

    // Сценарий «Новый вид адреса на сервере»: неизвестный kind — уведомления.
    func testUnknownPushKindOpensNotifications() {
        let push = PushTarget(kind: "challenge", ids: ["id": "1"])
        XCTAssertEqual(Router.link(for: push), .notifications)
        XCTAssertEqual(Router.target(for: Router.link(for: push), shell: .client),
                       NavigationTarget(tab: .today, path: [.notifications]))
        XCTAssertEqual(Router.target(for: Router.link(for: push), shell: .curator),
                       NavigationTarget(tab: .clients, path: [.notifications]))
    }

    func testKnownPushKinds() {
        XCTAssertEqual(Router.link(for: PushTarget(kind: "task", ids: ["task_id": "5"])), .dashboard(task: "5"))
        XCTAssertEqual(Router.link(for: PushTarget(kind: "chat", ids: ["conversation_id": "3", "participant_id": "8"])),
                       .curatorConversation(id: "3"))
        XCTAssertEqual(Router.target(for: Router.link(for: PushTarget(kind: "chat", ids: ["conversation_id": "3"])), shell: .client),
                       NavigationTarget(tab: .today, path: [.curatorChat]))
        XCTAssertEqual(Router.link(for: PushTarget(kind: "client", ids: ["client_id": "7"])), .curatorClient(id: "7", tab: nil))
        XCTAssertEqual(Router.link(for: PushTarget(kind: "support_conversation", ids: ["conversation_id": "9"])),
                       .curatorSupport(conversation: "9"))
        XCTAssertEqual(Router.link(for: PushTarget(kind: "lead", ids: ["lead_id": "4"])), .curatorLeads(lead: "4"))
        XCTAssertEqual(Router.link(for: PushTarget(kind: "notifications")), .notifications)
        XCTAssertEqual(Router.link(for: PushTarget(kind: "export")), .export)
        XCTAssertEqual(Router.link(for: PushTarget(kind: "plan")), .plan)
    }

    // Неизвестный путь universal link — корень роли.
    func testUnknownPathOpensRoleRoot() throws {
        XCTAssertEqual(try target("https://burcev.team/some/new/page", .client), NavigationTarget(tab: .today))
        XCTAssertEqual(try target("https://burcev.team/some/new/page", .curator), NavigationTarget(tab: .clients))
    }

    // Сценарий «Клиент открыл ссылку куратора».
    func testForeignRoleLinkOpensOwnRoot() throws {
        XCTAssertEqual(try target("https://burcev.team/curator/clients/7", .client), NavigationTarget(tab: .today))
        XCTAssertEqual(try target("https://burcev.team/food-tracker?date=2026-10-15", .curator), NavigationTarget(tab: .clients))
        XCTAssertEqual(try target("https://burcev.team/chat", .admin), NavigationTarget(tab: .leads))
        XCTAssertEqual(try target("https://burcev.team/curator/support?conversation=9", .admin),
                       NavigationTarget(tab: .support, path: [.supportConversation(id: "9")]))
        XCTAssertEqual(try target("https://burcev.team/chat", .webOnly), NavigationTarget(tab: nil))
    }

    func testForeignHostIsNotOurs() {
        XCTAssertNil(Router.parse(URL(string: "https://example.com/chat")!))
    }

    // Ссылки входа обрабатываются без сессии.
    func testAuthLinks() {
        XCTAssertEqual(Router.parse(URL(string: "https://burcev.team/auth/link/consume?token=abc")!), .auth(.magicLink(token: "abc")))
        XCTAssertEqual(Router.parse(URL(string: "https://burcev.team/reset-password?token=r1")!), .auth(.resetPassword(token: "r1")))
        XCTAssertEqual(Router.parse(URL(string: "https://new.burcev.team/auth/native-complete?code=c")!),
                       .auth(.providerComplete(code: "c", error: nil)))
        XCTAssertEqual(Router.parse(URL(string: "https://burcev.team/auth/native-complete?error=cancelled")!),
                       .auth(.providerComplete(code: nil, error: "cancelled")))
    }

    func testIntents() {
        XCTAssertEqual(Router.target(for: Router.link(for: IntentRoute.openDiary(add: .photo)), shell: .client),
                       NavigationTarget(tab: .diary, path: [.diaryDay(date: nil, add: .photo)]))
        XCTAssertEqual(Router.target(for: Router.link(for: IntentRoute.openChat), shell: .client),
                       NavigationTarget(tab: .today, path: [.curatorChat]))
    }

    // Сценарий «Пуш на устройстве после выхода»: /chat без сессии, затем вход.
    func testLinkBeforeSignInOpensAfterSignIn() async throws {
        let store = PendingLinkStore()
        guard case let .screen(link) = try XCTUnwrap(Router.parse(URL(string: "https://burcev.team/chat")!)) else {
            return XCTFail("ожидался экран")
        }
        await store.remember(link)
        let afterSignIn = await store.take()
        XCTAssertEqual(afterSignIn.map { Router.target(for: $0, shell: .client) },
                       NavigationTarget(tab: .today, path: [.curatorChat]))
        let again = await store.take()
        XCTAssertNil(again, "ссылка открывается один раз")
    }
}

/// Сценарий «Ссылка входа при открытой сессии».
final class AuthLinkDecisionTests: XCTestCase {
    func testSignedInLinkNeedsConfirmation() {
        XCTAssertEqual(AuthLinkDecision.decide(.magicLink(token: "t"), hasSession: true), .confirmSwitchingAccount)
        XCTAssertEqual(AuthLinkDecision.decide(.resetPassword(token: "t"), hasSession: true), .confirmSwitchingAccount)
    }

    func testSignedOutLinkIsConsumed() {
        XCTAssertEqual(AuthLinkDecision.decide(.magicLink(token: "t"), hasSession: false), .handle)
        XCTAssertEqual(AuthLinkDecision.decide(.resetPassword(token: "t"), hasSession: false), .handle)
    }

    func testProviderReturnIsHandled() {
        XCTAssertEqual(AuthLinkDecision.decide(.providerComplete(code: "c", error: nil), hasSession: true), .handle)
    }
}
