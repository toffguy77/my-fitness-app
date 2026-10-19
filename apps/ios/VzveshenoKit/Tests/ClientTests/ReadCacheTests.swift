import API
@testable import Client
import Foundation
import Outbox
import TestSupport
import XCTest

/// «Меню», «Статьи» и уведомления из кэша (`ios-offline-outbox`); «Съел» без сети.
@MainActor
final class ReadCacheTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)
    nonisolated private static let now = Date(timeIntervalSince1970: 1_760_696_400)
    nonisolated private let root = FileManager.default.temporaryDirectory.appendingPathComponent("read-cache-\(UUID().uuidString)")

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
    }

    private var offline: StubTransport { StubTransport { _ in .offline } }

    func testMenuPlanFromCacheAndEatenOffline() async throws {
        let cache = ScreenCache(root: root)
        let online = MealPlanAndNutrientsTests.planTransport()
        await MealPlanModel(api: api(online), calendar: calendar, cache: cache, account: 7, now: { Self.now }).load()

        let store = InMemoryOutboxStore()
        let outbox = Outbox(store: store, api: api(offline))
        let menu = MealPlanModel(api: api(offline), calendar: calendar, outbox: outbox, cache: cache, account: 7, now: { Self.now })
        XCTAssertEqual(menu.plan?.item(for: "breakfast")?.name, "Сырники", "первый кадр — из кэша")
        XCTAssertNotNil(menu.updatedLabel)
        await menu.load()
        XCTAssertTrue(menu.offline)
        XCTAssertNotNil(menu.plan)

        var eaten: [String] = []
        menu.onEaten = { day, _ in eaten.append(day) }
        let item = try XCTUnwrap(menu.plan?.items.first)
        let done = await menu.eat(item, grams: 90)
        XCTAssertTrue(done, "«Съел» без сети — в очереди, а не ошибка")
        XCTAssertEqual(menu.plan?.items.first?.eaten, true)
        XCTAssertEqual(eaten, ["2025-10-17"])
        let queued = try XCTUnwrap(try store.pending().first)
        XCTAssertEqual(queued.kind, DiaryModel.eatKind)
        XCTAssertEqual(queued.path, "/api/v1/meal-plans/2025-10-17/items/breakfast/eat")
        let preview = try JSONDecoder().decode(EatenPreview.self, from: try XCTUnwrap(queued.preview))
        XCTAssertEqual(preview.entry.foodName, "Сырники")
        XCTAssertEqual(preview.entry.portionAmount, 90)
        XCTAssertEqual(preview.entry.calories ?? 0, 210, accuracy: 0.5)

        // Перезапуск без сети: блюдо всё ещё отмечено.
        let relaunched = MealPlanModel(api: api(offline), calendar: calendar, outbox: outbox, cache: cache, account: 7,
                                       now: { Self.now })
        await relaunched.load()
        XCTAssertEqual(relaunched.plan?.items.first?.eaten, true)

        // Сеть вернулась: тот же ключ, сервер записал один раз.
        let delivering = Outbox(store: store, api: api(online))
        let report = await delivering.drain(userID: 7)
        XCTAssertEqual(report.delivered, [queued.id])
        XCTAssertEqual(online.requests(to: queued.path).first?.header("Idempotency-Key"), queued.idempotencyKey)
    }

    func testArticlesFeedAndArticleFromCache() async {
        let cache = ScreenCache(root: root)
        let online = StubTransport { request in
            if request.path == "/api/v1/content/feed/0b6e5b9c-6c1c-4a5c-9a3e-1f2d3c4b5a69" {
                return .success(##"{"id":"0b6e5b9c-6c1c-4a5c-9a3e-1f2d3c4b5a69","title":"Остаток","category":"nutrition","##
                                + ##""body":"# Текст"}"##)
            }
            return ArticlesTests.feedServer().handle(request)
        }
        let feed = ArticleFeedModel(api: api(online), cache: cache, account: 7)
        await feed.select(nil)
        let article = ArticleModel(api: api(online), reference: "0b6e5b9c-6c1c-4a5c-9a3e-1f2d3c4b5a69", cache: cache, account: 7)
        await article.load()

        let cachedFeed = ArticleFeedModel(api: api(offline), cache: cache, account: 7)
        XCTAssertEqual(cachedFeed.articles.count, 20, "первый кадр — из кэша")
        XCTAssertNotNil(cachedFeed.updatedLabel)
        await cachedFeed.reload()
        XCTAssertEqual(cachedFeed.articles.count, 20)
        XCTAssertNil(cachedFeed.error, "без сети с кэшем — плашка, не ошибка")
        XCTAssertTrue(cachedFeed.offline)

        let opened = ArticleModel(api: api(offline), reference: "0b6e5b9c-6c1c-4a5c-9a3e-1f2d3c4b5a69", cache: cache, account: 7)
        XCTAssertEqual(opened.article?.title, "Остаток")
        XCTAssertNotNil(opened.document)
        await opened.load()
        XCTAssertNil(opened.error)

        XCTAssertTrue(ArticleFeedModel(api: api(offline), cache: cache, account: 8).articles.isEmpty, "чужой кэш")
        let empty = ArticleFeedModel(api: api(offline), cache: ScreenCache(root: root.appendingPathComponent("x")), account: 7)
        await empty.reload()
        XCTAssertTrue(empty.articles.isEmpty)
        XCTAssertTrue(empty.offline)
    }

    func testNotificationsFromCache() async {
        let cache = ScreenCache(root: root)
        let online = StubTransport { request in
            switch request.path {
            case "/api/v1/notifications/unread-counts": return .success(#"{"main":1,"content":0}"#)
            case "/api/v1/notifications": return .success(#"{"notifications":[{"id":"n1","title":"Отзыв куратора"}],"hasMore":false}"#)
            default: return .error(404, code: "not_found")
            }
        }
        await NotificationsModel(api: api(online), sleeper: ManualSleeper(), cache: cache, account: 7).load()
        let model = NotificationsModel(api: api(offline), sleeper: ManualSleeper(), cache: cache, account: 7)
        XCTAssertEqual(model.visible.map(\.id), ["n1"])
        XCTAssertEqual(model.counts.main, 1)
        await model.load()
        XCTAssertEqual(model.visible.map(\.id), ["n1"])
        XCTAssertNil(model.error)
        XCTAssertTrue(model.offline)
        XCTAssertTrue(NotificationsModel(api: api(offline), cache: cache, account: 8).visible.isEmpty)
    }
}
