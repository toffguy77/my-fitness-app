import API
@testable import Client
import Foundation
import TestSupport
import XCTest

/// «Статьи» (`ios-content-reader`, задача 5.3).
@MainActor
final class ArticlesTests: XCTestCase {
    nonisolated static func feedServer() -> StubTransport {
        StubTransport { request in
            guard request.path == "/api/v1/content/feed" else { return .error(404, code: "not_found") }
            let query = request.query ?? ""
            let offset = query.contains("offset=20") ? 20 : 0
            let count = offset == 0 ? 20 : 5
            let category = query.contains("category=recipes") ? "recipes" : "nutrition"
            let items = (0..<count).map { #"{"id":"a\#(offset + $0)","title":"Статья \#(offset + $0)","category":"\#(category)"}"# }
            return .success(#"{"articles":[\#(items.joined(separator: ","))],"total":25}"#)
        }
    }

    // Сценарий «Категория «Рецепты»».
    func testRecipesChipRequestsCategoryAndReplacesFirstPage() async {
        let transport = Self.feedServer()
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let model = ArticleFeedModel(api: api)
        await model.select(nil)
        await model.loadMore()
        XCTAssertEqual(model.articles.count, 25)
        XCTAssertFalse(model.hasMore)
        await model.select(.recipes)
        let request = transport.requests.last
        XCTAssertEqual(request?.query?.contains("category=recipes"), true, request?.query ?? "")
        XCTAssertEqual(request?.query?.contains("offset=0"), true)
        XCTAssertEqual(model.articles.count, 20, "первая страница заменила прежнюю")
        XCTAssertTrue(model.articles.allSatisfy { $0.category == "recipes" })
    }

    func testFeedLoadsNextPageAtTheEnd() async {
        let transport = Self.feedServer()
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let model = ArticleFeedModel(api: api)
        await model.select(nil)
        XCTAssertTrue(model.hasMore)
        XCTAssertEqual(transport.requests.first?.query, "limit=20&offset=0")
        await model.loadMore()
        XCTAssertEqual(transport.requests.last?.query, "limit=20&offset=20")
        XCTAssertEqual(model.articles.last?.id, "a24")
    }

    func testArticleByUUIDUsesPersonalFeedAndBySlugPublic() async {
        let transport = StubTransport { _ in
            .success(##"{"id":"0b6e5b9c-6c1c-4a5c-9a3e-1f2d3c4b5a69","slug":"x","title":"Т","category":"health","body":"# Т"}"##)
        }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        await ArticleModel(api: api, reference: "0b6e5b9c-6c1c-4a5c-9a3e-1f2d3c4b5a69").load()
        let byID = ArticleModel(api: api, reference: "ostatok-vazhnee")
        await byID.load()
        XCTAssertEqual(transport.requests.map(\.path), ["/api/v1/content/feed/0b6e5b9c-6c1c-4a5c-9a3e-1f2d3c4b5a69",
                                                        "/api/v1/public/content/ostatok-vazhnee"])
        XCTAssertEqual(byID.document?.blocks, [.heading(level: 1, text: "Т")])
    }
}

/// Разбор статьи и адрес «Поделиться» — без главного актора.
final class ArticleDocumentTests: XCTestCase {
    // Сценарий «Поделиться статьёй».
    func testShareURLIsCanonicalProductionAddress() {
        let article = Article(id: "a1", slug: "ostatok-vazhnee", title: "Почему остаток важнее съеденного")
        XCTAssertEqual(article.shareURL?.absoluteString, "https://burcev.team/content/ostatok-vazhnee")
        XCTAssertNil(Article(id: "a2", slug: nil, title: "Личная").shareURL, "у личной статьи адреса нет")
        XCTAssertNil(Article(id: "a3", slug: "", title: "Пустой").shareURL)
        XCTAssertEqual(ArticleShare.url(slug: "вода и вес")?.absoluteString,
                       "https://burcev.team/content/%D0%B2%D0%BE%D0%B4%D0%B0%20%D0%B8%20%D0%B2%D0%B5%D1%81")
    }

    func testCategoryChipsMatchServerEnum() throws {
        let migration = try RepositoryFiles.read("apps/api/migrations/031_create_articles_up.sql")
        for category in ArticleCategory.allCases {
            XCTAssertTrue(migration.contains("'\(category.rawValue)'"), category.rawValue)
        }
        XCTAssertEqual(ArticleCategory.allCases.map(\.title), ["Питание", "Тренировки", "Рецепты", "Здоровье", "Мотивация", "Общее"])
    }

    // Сценарий «Таблица шире экрана»: таблица из 6 столбцов — отдельным блоком.
    func testMarkdownTableAndImageBecomeBlocks() {
        let markdown = """
        ---
        title: служебное
        ---
        # Почему остаток важнее

        Норма — **не цель**, а *ориентир*. Подробнее — [в статье](/content/kbzhu).

        ![Тарелка](https://cdn.burcev.team/plate.jpg)

        | Приём | Ккал | Б | Ж | У | Время |
        |---|---|---|---|---|---|
        | Завтрак | 420 | 30 | 15 | 40 | 08:10 |

        - один
        - два

        > Цитата
        """
        let blocks = ArticleDocument(markdown: markdown).blocks
        XCTAssertEqual(blocks.count, 6, "\(blocks)")
        XCTAssertEqual(blocks[0], .heading(level: 1, text: "Почему остаток важнее"))
        XCTAssertEqual(blocks[1], .paragraph("Норма — **не цель**, а *ориентир*. Подробнее — [в статье](https://burcev.team/content/kbzhu)."))
        XCTAssertEqual(blocks[2], .image(url: URL(string: "https://cdn.burcev.team/plate.jpg"), alt: "Тарелка"))
        guard case let .table(table) = blocks[3] else { return XCTFail("нет таблицы") }
        XCTAssertEqual(table.columnCount, 6)
        XCTAssertEqual(table.header, ["Приём", "Ккал", "Б", "Ж", "У", "Время"])
        XCTAssertEqual(table.rows, [["Завтрак", "420", "30", "15", "40", "08:10"]])
        XCTAssertEqual(blocks[4], .list(ordered: false, start: 1, items: [[.paragraph("один")], [.paragraph("два")]]))
        XCTAssertEqual(blocks[5], .quote([.paragraph("Цитата")]))
    }

    /// Ссылки на тарифы в статье — только текст; калькулятор — «Тело и цели».
    func testPricingLinksAreDroppedAndCalculatorLeadsToBodyGoals() {
        let blocks = ArticleDocument(markdown: "Смотрите [тарифы](https://burcev.team/pricing) и [калькулятор](/kalkulyator-kbzhu).")
            .blocks
        XCTAssertEqual(blocks, [.paragraph("Смотрите тарифы и [калькулятор](vzvesheno-app:body-goals).")])
        XCTAssertEqual(ArticleLinks.decide("https://new.burcev.team/pricing?plan=1"), .drop)
        XCTAssertEqual(ArticleLinks.decide("javascript:alert(1)"), .drop)
        XCTAssertEqual(ArticleLinks.decide("https://example.org/a"), .keep(URL(string: "https://example.org/a")!))
    }

    func testMarkdownCharactersInTextAreEscaped() {
        XCTAssertEqual(ArticleDocument(markdown: "2 \\* 3 = 6").blocks, [.paragraph("2 \\* 3 = 6")])
    }

    func testReadingMinutes() {
        XCTAssertEqual(ArticleDocument.readingMinutes(String(repeating: "слово ", count: 1080)), 6)
        XCTAssertEqual(ArticleDocument.readingMinutes("коротко"), 1)
    }
}
