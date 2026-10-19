import API
import Client
@testable import Curator
import Foundation
import Navigation
import TestSupport
import XCTest

/// Фикстура `GET /curator/attention`: порядок и формат `detail` — как у
/// `collectAttention` (priority по возрастанию, затем имя).
let attentionFixture = fixture("attention")

let clientsFixture = fixture("clients")

let analyticsFixture = fixture("analytics")

@MainActor
final class HubModelTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)
    /// 19 октября 2026, 12:00 по Москве.
    private let now = Date(timeIntervalSince1970: 1_792_400_400)

    private func decode<T: Decodable>(_ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func hub(benchmark: StubResponse = .success(#"{"own_snapshots":[],"platform_benchmarks":[]}"#),
                     attention: StubResponse = .success(attentionFixture)) -> (HubModel, StubTransport) {
        let transport = StubTransport { request in
            switch request.path {
            case "/api/v1/curator/analytics": return .success(analyticsFixture)
            case "/api/v1/curator/attention": return attention
            case "/api/v1/curator/clients": return .success(clientsFixture)
            case "/api/v1/curator/analytics/benchmark": return benchmark
            default: return .error(404, code: "not_found")
            }
        }
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios", transport: transport)
        let now = now
        return (HubModel(api: api, calendar: calendar, now: { now }), transport)
    }

    // «Требуют внимания» по приоритету сервера: одна строка на клиента,
    // порядок — по наивысшему приоритету группы.
    func testGroupsByClientInPriorityOrder() throws {
        let items: [AttentionItem] = try decode(attentionFixture)
        let groups = AttentionGrouping.groups(items)
        XCTAssertEqual(groups.map(\.name), ["Мария К.", "Игорь П.", "Ольга С.", "Анна Р.", "Денис Л."])
        XCTAssertEqual(groups.map(\.topPriority), [1, 2, 3, 4, 5])
    }

    // Сценарий «Алерт и сообщение у одного клиента».
    func testAlertAndMessageOfOneClient() throws {
        let items: [AttentionItem] = try decode(attentionFixture)
        let maria = try XCTUnwrap(AttentionGrouping.groups(items).first)
        XCTAssertEqual(maria.badges.map(\.text), ["Алерт КБЖУ · 132%", "Сообщение · 2"])
        XCTAssertEqual(maria.badges.map(\.details), [["Калории: 2960 из 2240 (132%)"], ["Непрочитанных сообщений: 2"]])
        // Нажатие — адрес пункта с наивысшим приоритетом: карточка, а не переписка.
        XCTAssertEqual(maria.link, .curatorClient(id: "11", tab: nil))
        XCTAssertEqual(Router.target(for: maria.link, shell: .curator),
                       NavigationTarget(tab: .clients, path: [.client(id: "11", tab: nil)]))
        // Клиент только с сообщением — в переписку.
        let anna = try XCTUnwrap(AttentionGrouping.groups(items).first { $0.clientID == 15 })
        XCTAssertEqual(anna.link, .curatorClientChat(clientID: "15"))
    }

    func testOtherBadges() throws {
        let items: [AttentionItem] = try decode(attentionFixture)
        let clients: [CuratorClient] = try decode(clientsFixture)
        let groups = AttentionGrouping.groups(items, clients: clients, today: "2026-10-19", calendar: calendar)
        XCTAssertEqual(groups.first { $0.clientID == 13 }?.badges.first?.text, "Нет активности 2 дня")
        XCTAssertEqual(groups.first { $0.clientID == 12 }?.badges.first?.text, "Просроченная задача")
        XCTAssertEqual(groups.first { $0.clientID == 14 }?.badges.first?.text, "Ожидает отзыв")
        XCTAssertEqual(groups.first { $0.clientID == 11 }?.badges.map(\.tone), [.danger, .info])
    }

    func testEmptyAttentionHidesBlock() async {
        let (model, _) = hub(attention: .success("[]"))
        await model.load()
        XCTAssertEqual(model.phase, .loaded)
        XCTAssertTrue(model.visibleGroups.isEmpty)
        XCTAssertEqual(model.visibleOthers.count, 7)
    }

    // «Остальные» — без повторов, по имени.
    func testOthersWithoutRepeats() async {
        let (model, _) = hub()
        await model.load()
        XCTAssertEqual(model.visibleOthers.map(\.displayName), ["Алексей В.", "Марина Т."])
        XCTAssertEqual(model.visibleOthers.first?.kbzhuPercent, 76)
    }

    // Сценарий «Поиск»: «мар» оставляет в обоих списках только подходящих.
    func testSearchFiltersBothLists() async {
        let (model, transport) = hub()
        await model.load()
        let before = transport.requests.count
        model.query = "мар"
        XCTAssertEqual(model.visibleGroups.map(\.name), ["Мария К."])
        XCTAssertEqual(model.visibleOthers.map(\.displayName), ["Марина Т."])
        XCTAssertEqual(transport.requests.count, before, "поиск без сервера")
    }

    // Сценарий «Бенчмарк недоступен».
    func testBenchmarkFailureDoesNotBreakScreen() async {
        let (model, _) = hub(benchmark: .error(500, code: "internal"))
        await model.load()
        XCTAssertEqual(model.phase, .loaded)
        XCTAssertNotNil(model.analytics)
        XCTAssertFalse(model.groups.isEmpty)
        XCTAssertNil(model.benchmark)
    }

    func testAnyMainFailureShowsError() async {
        let (model, _) = hub(attention: .error(500, code: "internal"))
        await model.load()
        XCTAssertEqual(model.phase, .failed)
    }

    // Сценарий «Новое сообщение клиента»: `unread_count_update` обновляет
    // показатель и бейдж «Чатов» без перезагрузки экрана.
    func testUnreadCountUpdateWithoutReload() async {
        let (model, transport) = hub()
        await model.load()
        XCTAssertEqual(model.unread, 6)
        let before = transport.requests.count
        await model.handle(.unreadCount(9))
        XCTAssertEqual(model.unread, 9)
        XCTAssertEqual(model.analytics?.totalUnread, 9)
        XCTAssertEqual(transport.requests.count, before)
        XCTAssertEqual(model.phase, .loaded)
    }

    // `new_message` — тихое обновление: без «загрузки» на экране.
    func testNewMessageRefreshesQuietly() async {
        let (model, transport) = hub()
        await model.load()
        await model.handle(.newMessage(conversationID: "c1"))
        XCTAssertEqual(transport.requests(to: "/api/v1/curator/attention").count, 2)
        XCTAssertEqual(model.phase, .loaded)
    }
}
