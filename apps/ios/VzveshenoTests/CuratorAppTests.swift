import Client
import Curator
import Foundation
import Navigation
@testable import Vzvesheno
import XCTest

/// Оболочка куратора на модели приложения со сценарием UI-теста.
@MainActor
final class CuratorAppTests: XCTestCase {
    private func started(_ scenario: UITestScenario) async -> AppModel {
        let model = scenario.makeModel(environment: AppEnvironment.current())
        await model.start()
        await model.curator?.refresh()
        return model
    }

    func testCoordinatorWorkspace() async {
        let model = await started(.coordinator)
        let curator = model.curator
        XCTAssertNotNil(curator?.hub)
        XCTAssertEqual(curator?.hub?.phase, .loaded)
        XCTAssertEqual(curator?.chatsBadge, 6)
        XCTAssertEqual(curator?.supportBadge, 1)
        XCTAssertEqual(curator?.hub?.groups.first?.name, "Мария К.")
    }

    // Суперадмин: только заявки и обращения — «Клиентов» и «Чатов» нет.
    func testSuperAdminWorkspace() async {
        let model = await started(.superAdmin)
        XCTAssertNil(model.curator?.hub)
        XCTAssertNil(model.curator?.chats)
        XCTAssertEqual(model.selectedTab, .leads)
    }

    // Выход не оставляет чужих данных: модели куратора уходят вместе с оболочкой.
    func testSignOutDropsCuratorData() async {
        let model = await started(.coordinator)
        XCTAssertNotNil(model.curator)
        await model.signOut()
        // Конец сессии доходит до модели через поток окончаний — дождаться.
        for _ in 0..<100 where model.launch != .signedOut { try? await Task.sleep(for: .milliseconds(20)) }
        XCTAssertEqual(model.launch, .signedOut)
        XCTAssertNil(model.curator)
    }

    // Ссылка `/curator/clients/7?tab=reports` — карточка на вкладке «Отчёты».
    func testCardLinkOpensTab() async throws {
        let model = await started(.coordinator)
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/curator/clients/7?tab=reports")))
        XCTAssertEqual(model.selectedTab, .clients)
        XCTAssertEqual(model.paths[.clients], [.client(id: "7", tab: "reports")])
        XCTAssertEqual(ClientCardTab(link: "reports"), .reports)
    }

    // 4.3: обработчик ответа из пуша — текст поля `UNTextInputNotificationResponse`
    // уходит в переписку из `target.ids.conversation_id` через очередь.
    func testTextInputReplyGoesToConversation() async {
        let userInfo: [AnyHashable: Any] = [
            "aps": ["category": "CHAT_MESSAGE", "alert": ["title": "Мария К.", "body": "Спасибо!"]],
            "target": ["kind": "chat", "ids": ["conversation_id": "c11", "participant_id": "11"]],
        ]
        let decision = PushCenter.decision(userInfo: userInfo, action: PushAction.reply, text: "Принято")
        XCTAssertEqual(decision, .reply(conversationID: "c11", text: "Принято"))
        let model = await started(.coordinator)
        await model.handlePush(decision)
        let pending = (try? await model.outbox.pending()) ?? []
        XCTAssertTrue(pending.isEmpty, "ответ доставлен, а не ждёт в очереди")
        let conversation = model.curator?.chats?.conversations.first { $0.id == "c11" }
        XCTAssertEqual(conversation?.lastMessage?.content, "Принято")
        // Пустой ответ — ничего не отправляется.
        XCTAssertEqual(PushCenter.decision(userInfo: userInfo, action: PushAction.reply, text: "  "), .ignore)
    }

    // Пуш об эскалации открывает тред на вкладке «Обращения».
    func testSupportEscalatedPushOpensThread() async {
        let model = await started(.coordinator)
        let userInfo: [AnyHashable: Any] = [
            "aps": ["category": "SUPPORT_ESCALATED", "alert": ["title": "Обращение"]],
            "target": ["kind": "support_conversation", "ids": ["conversation_id": "s1"]],
        ]
        await model.handlePush(PushCenter.decision(userInfo: userInfo, action: PushAction.tap, text: nil))
        XCTAssertEqual(model.selectedTab, .support)
        XCTAssertEqual(model.paths[.support], [.supportConversation(id: "s1")])
    }
}
