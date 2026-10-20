import API
import Client
@testable import Curator
import Foundation
import Outbox
import TestSupport
import XCTest

/// «Клиенты», «Чаты», переписка и карточка куратора без сети
/// (`ios-offline-outbox`): кэш только на чтение, свой у каждого куратора.
@MainActor
final class CuratorOfflineTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)
    nonisolated private let root = FileManager.default.temporaryDirectory.appendingPathComponent("curator-offline-\(UUID().uuidString)")
    private let now = Date(timeIntervalSince1970: 1_792_400_400)

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    nonisolated static let online = StubTransport { request in
        switch request.path {
        case "/api/v1/curator/analytics": return .success(analyticsFixture)
        case "/api/v1/curator/attention": return .success(attentionFixture)
        case "/api/v1/curator/clients": return .success(clientsFixture)
        case "/api/v1/curator/analytics/benchmark": return .success(#"{"own_snapshots":[],"platform_benchmarks":[]}"#)
        case "/api/v1/curator/clients/11": return .success(clientDetailFixture)
        case "/api/v1/curator/clients/11/notices": return .success("[]")
        case "/api/v1/conversations":
            return .success(#"[{"id":"c1","client_id":11,"curator_id":3,"unread_count":1,"participant":{"id":11,"name":"Мария К."}}]"#)
        case "/api/v1/conversations/c1/messages":
            return .success(#"[{"id":"m1","conversation_id":"c1","sender_id":11,"type":"text","content":"Привет","#
                            + #""created_at":"2026-10-19T09:00:00Z"}]"#)
        default: return .error(404, code: "not_found")
        }
    }

    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios", transport: transport)
    }

    private var offline: StubTransport { StubTransport { _ in .offline } }

    func testHubShowsSavedClientsAtOnceAndKeepsThemOffline() async {
        let cache = ScreenCache(root: root)
        let now = now
        await HubModel(api: api(Self.online), calendar: calendar, cache: cache, account: 3, now: { now }).load()

        let hub = HubModel(api: api(offline), calendar: calendar, cache: cache, account: 3, now: { now })
        XCTAssertEqual(hub.phase, .loaded, "первый кадр — из кэша")
        XCTAssertFalse(hub.clients.isEmpty)
        XCTAssertEqual(hub.updatedLabel, "Обновлено в 12:00")
        await hub.load()
        XCTAssertEqual(hub.phase, .loaded, "без сети — не «Не удалось загрузить»")
        XCTAssertTrue(hub.offline)
        XCTAssertNotNil(hub.updatedLabel)

        let fresh = HubModel(api: api(Self.online), calendar: calendar, cache: cache, account: 3, now: { now })
        await fresh.load()
        XCTAssertNil(fresh.updatedLabel)
        XCTAssertFalse(fresh.offline)

        let other = HubModel(api: api(offline), calendar: calendar, cache: cache, account: 4, now: { now })
        XCTAssertTrue(other.clients.isEmpty, "кэш другого куратора не показывается")
        await other.load()
        XCTAssertEqual(other.phase, .failed)
        XCTAssertTrue(other.offline)
    }

    func testConversationListAndConversationFromCache() async {
        let cache = ScreenCache(root: root)
        await ConversationListModel(api: api(Self.online), cache: cache, account: 3).load()
        let online = CuratorConversationModel(api: api(Self.online), reference: .conversation("c1"), curatorID: 3,
                                              calendar: calendar, cache: cache)
        await online.load()

        let list = ConversationListModel(api: api(offline), cache: cache, account: 3)
        XCTAssertEqual(list.conversations.map(\.id), ["c1"])
        await list.load()
        XCTAssertEqual(list.conversations.map(\.id), ["c1"])
        XCTAssertNil(list.error)
        XCTAssertTrue(list.offline)

        let conversation = CuratorConversationModel(api: api(offline), reference: .conversation("c1"), curatorID: 3,
                                                    calendar: calendar, cache: cache)
        XCTAssertEqual(conversation.phase, .chat)
        XCTAssertEqual(conversation.messages.map(\.id), ["m1"])
        await conversation.load()
        XCTAssertEqual(conversation.phase, .chat)
        XCTAssertTrue(conversation.offline)
        let sent = await conversation.send("Ответ")
        XCTAssertFalse(sent, "отправка куратора — только онлайн")
        XCTAssertNotNil(conversation.notice)

        XCTAssertTrue(ConversationListModel(api: api(offline), cache: cache, account: 4).conversations.isEmpty)
    }

    func testClientCardFromCacheIsReadOnly() async {
        let cache = ScreenCache(root: root)
        let now = now
        await ClientCardModel(api: api(Self.online), clientID: 11, calendar: calendar, cache: cache, account: 3, now: { now }).load()
        let card = ClientCardModel(api: api(offline), clientID: 11, calendar: calendar, cache: cache, account: 3, now: { now })
        XCTAssertEqual(card.phase, .loaded)
        XCTAssertNotNil(card.detail)
        await card.load()
        XCTAssertEqual(card.phase, .loaded)
        XCTAssertTrue(card.offline)
        await card.setWaterGoal(10)
        XCTAssertEqual(card.notice, ClientCardModel.saveFailed, "действие без сети — понятный отказ, значение возвращено")
        cache.eraseAll()
        XCTAssertNil(ClientCardModel(api: api(offline), clientID: 11, calendar: calendar, cache: cache, account: 3).detail)
    }
}
