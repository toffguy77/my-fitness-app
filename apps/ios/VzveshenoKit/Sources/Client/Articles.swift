import API
import Foundation
import Markdown
import Observation

/// Категория статьи (`content_category` сервера).
public enum ArticleCategory: String, CaseIterable, Sendable, Identifiable {
    case nutrition, training, recipes, health, motivation, general

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .nutrition: return "Питание"
        case .training: return "Тренировки"
        case .recipes: return "Рецепты"
        case .health: return "Здоровье"
        case .motivation: return "Мотивация"
        case .general: return "Общее"
        }
    }
}

/// Статья ленты и статья целиком (`GET /content/feed`, `/content/feed/:id`,
/// `/public/content/:ref`).
public struct Article: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    /// Есть только у статей для всех; личные статьи адреса не имеют.
    public var slug: String?
    public var title: String
    public var excerpt: String?
    public var authorName: String?
    public var coverImageURL: String?
    public var category: String
    public var publishedAt: String?
    public var body: String?

    public init(id: String, slug: String? = nil, title: String, excerpt: String? = nil, authorName: String? = nil,
                coverImageURL: String? = nil, category: String = "general", publishedAt: String? = nil, body: String? = nil) {
        self.id = id
        self.slug = slug
        self.title = title
        self.excerpt = excerpt
        self.authorName = authorName
        self.coverImageURL = coverImageURL
        self.category = category
        self.publishedAt = publishedAt
        self.body = body
    }

    enum CodingKeys: String, CodingKey {
        case id, slug, title, excerpt, category, body
        case authorName = "author_name"
        case coverImageURL = "cover_image_url"
        case publishedAt = "published_at"
    }

    public var categoryTitle: String { ArticleCategory(rawValue: category)?.title ?? "Общее" }

    /// «Питание · 17 октября».
    public var meta: String {
        guard let publishedAt else { return categoryTitle }
        return "\(categoryTitle) · \(DayText.dayMonth(String(publishedAt.prefix(10))))"
    }

    /// Обложка — только с проверенного хоста.
    public var coverURL: URL? { coverImageURL.flatMap(TrustedMedia.url) }

    /// Адрес для «Поделиться»; у личной статьи его нет.
    public var shareURL: URL? { slug.flatMap { $0.isEmpty ? nil : ArticleShare.url(slug: $0) } }
}

/// «Поделиться» — всегда канонический адрес прода, из любой сборки.
public enum ArticleShare {
    public static func url(slug: String) -> URL? {
        let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))
        guard let encoded = slug.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: "https://burcev.team/content/\(encoded)")
    }
}

/// Лента статей по категориям (`ios-content-reader`).
@MainActor
@Observable
public final class ArticleFeedModel {
    public static let pageSize = 20

    public private(set) var category: ArticleCategory?
    public private(set) var articles: [Article] = []
    public private(set) var total = 0
    public private(set) var loading = false
    public private(set) var loaded = false
    public private(set) var error: String?
    private let api: APIClient
    @ObservationIgnored private var generation = 0

    public init(api: APIClient) {
        self.api = api
    }

    public var hasMore: Bool { articles.count < total }

    /// Чип категории: первая страница заменяет прежнюю.
    public func select(_ category: ArticleCategory?) async {
        self.category = category
        generation += 1
        await fetch(offset: 0, generation: generation)
    }

    public func reload() async {
        generation += 1
        await fetch(offset: 0, generation: generation)
    }

    /// Прокрутка к концу — следующая страница.
    public func loadMore() async {
        guard hasMore, !loading else { return }
        await fetch(offset: articles.count, generation: generation)
    }

    private func fetch(offset: Int, generation: Int) async {
        struct Page: Decodable, Sendable {
            let articles: [Article]
            let total: Int
        }
        var query = [URLQueryItem(name: "limit", value: "\(Self.pageSize)"), URLQueryItem(name: "offset", value: "\(offset)")]
        if let category { query.insert(URLQueryItem(name: "category", value: category.rawValue), at: 0) }
        loading = true
        defer { loading = false }
        do {
            let page: Page = try await api.send(.get("/api/v1/content/feed", query: query))
            guard generation == self.generation else { return }
            articles = offset == 0 ? page.articles : articles + page.articles.filter { new in !articles.contains { $0.id == new.id } }
            total = page.total
            error = nil
            loaded = true
        } catch {
            guard generation == self.generation else { return }
            self.error = ErrorMessages().message(for: error)
            loaded = true
        }
    }
}

/// Статья по ссылке, пушу или из ленты: uuid — личная лента, иначе slug — публичная.
@MainActor
@Observable
public final class ArticleModel {
    public private(set) var article: Article?
    public private(set) var document: ArticleDocument?
    public private(set) var error: String?
    public let reference: String
    private let api: APIClient

    public init(api: APIClient, reference: String, preview: Article? = nil) {
        self.api = api
        self.reference = reference
        article = preview
    }

    public static func isUUID(_ value: String) -> Bool { UUID(uuidString: value) != nil }

    public func load() async {
        do {
            let endpoint: Endpoint = Self.isUUID(reference)
                ? .get("/api/v1/content/feed/\(reference)")
                : .get("/api/v1/public/content/\(reference)", requiresAuth: false)
            let loaded: Article = try await api.send(endpoint)
            article = loaded
            document = ArticleDocument(markdown: loaded.body ?? "")
            error = nil
        } catch {
            self.error = ErrorMessages().message(for: error)
        }
    }
}

// MARK: Markdown

/// Блок статьи для отрисовки на токенах. Встроенный текст — `AttributedString`,
/// собранный прямо из дерева разбора (жирный, курсив, код, зачёркивание —
/// `inlinePresentationIntent`, ссылки — атрибут `link`). Обратно в Markdown
/// текст не превращается: повторный разбор позволил бы содержимому кода или
/// подписи изображения стать ссылкой в обход проверки `ArticleLinks`.
public indirect enum ArticleBlock: Equatable, Sendable {
    case heading(level: Int, text: AttributedString)
    case paragraph(AttributedString)
    case image(url: URL?, alt: String)
    case list(ordered: Bool, start: Int, items: [[ArticleBlock]])
    case quote([ArticleBlock])
    case code(String)
    case table(ArticleTable)
    case rule
}

public struct ArticleTable: Equatable, Sendable {
    public var header: [AttributedString]
    public var rows: [[AttributedString]]

    public init(header: [AttributedString], rows: [[AttributedString]]) {
        self.header = header
        self.rows = rows
    }

    public var columnCount: Int { max(header.count, rows.map(\.count).max() ?? 0) }
}

/// Оформление встроенного текста статьи. Своё, а не `InlinePresentationIntent`:
/// того нет в Foundation на Linux, где разбор проверяется тестами. На
/// платформах Apple дублируется в `inlinePresentationIntent` для SwiftUI `Text`.
public struct ArticleStyle: OptionSet, Hashable, Sendable, Codable {
    public let rawValue: Int

    public init(rawValue: Int) { self.rawValue = rawValue }

    public static let emphasized = ArticleStyle(rawValue: 1)
    public static let strong = ArticleStyle(rawValue: 2)
    public static let code = ArticleStyle(rawValue: 4)
    public static let strikethrough = ArticleStyle(rawValue: 8)

    #if canImport(Darwin)
    var presentationIntent: InlinePresentationIntent {
        var intent: InlinePresentationIntent = []
        if contains(.emphasized) { intent.insert(.emphasized) }
        if contains(.strong) { intent.insert(.stronglyEmphasized) }
        if contains(.code) { intent.insert(.code) }
        if contains(.strikethrough) { intent.insert(.strikethrough) }
        return intent
    }
    #endif
}

public enum ArticleStyleAttribute: AttributedStringKey {
    public typealias Value = ArticleStyle
    public static let name = "team.burcev.articleStyle"
}

/// Куда ведут ссылки статьи в приложении.
public enum ArticleLinks {
    /// Внутренний адрес «Тело и цели»: калькулятор нормы сайта в приложении — этот экран.
    public static let bodyGoals = URL(string: "vzvesheno-app:body-goals")!
    public static let site = URL(string: "https://burcev.team")!

    public enum Decision: Equatable, Sendable {
        /// Ссылка остаётся (статьи, внешние источники).
        case keep(URL)
        /// Калькулятор нормы — «Тело и цели».
        case bodyGoals
        /// Тарифы и оплата: в приложении — только текст без ссылки (App Review 3.1.1(a)).
        case drop
    }

    public static func decide(_ destination: String) -> Decision {
        guard let url = URL(string: destination, relativeTo: site)?.absoluteURL else { return .drop }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        let ours = ["burcev.team", "www.burcev.team", "new.burcev.team"].contains(host)
        if ours, ["/pricing", "/tariffs", "/tarify", "/oplata", "/checkout"].contains(where: path.hasPrefix) { return .drop }
        if ours, path.hasPrefix("/kalkulyator-kbzhu") || path.hasPrefix("/calculator") { return .bodyGoals }
        guard ["https", "http", "mailto"].contains(url.scheme ?? "") else { return .drop }
        return .keep(url)
    }
}

/// Статья, разобранная `swift-markdown` (GFM: таблицы, зачёркивание).
public struct ArticleDocument: Equatable, Sendable {
    public var blocks: [ArticleBlock]

    public init(markdown: String) {
        let document = Document(parsing: Self.stripFrontmatter(markdown))
        blocks = document.children.flatMap(Self.blocks)
    }

    /// Минут чтения: 180 слов в минуту, не меньше одной.
    public static func readingMinutes(_ markdown: String) -> Int {
        let words = markdown.split { $0.isWhitespace || $0.isNewline }.count
        return max(1, Int((Double(words) / 180).rounded()))
    }

    static func stripFrontmatter(_ text: String) -> String {
        guard text.hasPrefix("---\n") else { return text }
        let rest = text.dropFirst(4)
        guard let end = rest.range(of: "\n---\n") else { return text }
        return String(rest[end.upperBound...])
    }

    static func blocks(_ markup: Markup) -> [ArticleBlock] {
        switch markup {
        case let heading as Heading:
            return [.heading(level: heading.level, text: inline(heading.children))]
        case let paragraph as Paragraph:
            let children = Array(paragraph.children)
            let meaningful = children.filter { child in
                let blank = (child as? Text)?.string.allSatisfy(\.isWhitespace) ?? false
                return !(child is SoftBreak) && !(child is LineBreak) && !blank
            }
            if !meaningful.isEmpty, meaningful.allSatisfy({ $0 is Markdown.Image }) {
                return meaningful.compactMap { $0 as? Markdown.Image }.map(image)
            }
            let text = inline(children)
            return text.characters.isEmpty ? [] : [.paragraph(text)]
        case let list as UnorderedList:
            return [.list(ordered: false, start: 1, items: list.listItems.map { $0.children.flatMap(blocks) })]
        case let list as OrderedList:
            return [.list(ordered: true, start: Int(list.startIndex), items: list.listItems.map { $0.children.flatMap(blocks) })]
        case let quote as BlockQuote:
            return [.quote(quote.children.flatMap(blocks))]
        case let code as CodeBlock:
            return [.code(code.code.hasSuffix("\n") ? String(code.code.dropLast()) : code.code)]
        case let table as Markdown.Table:
            let header: [AttributedString] = table.head.cells.map { inline($0.children) }
            let rows: [[AttributedString]] = table.body.rows.map { row in Array(row.cells.map { inline($0.children) }) }
            return [.table(ArticleTable(header: header, rows: rows))]
        case is ThematicBreak:
            return [.rule]
        case let image as Markdown.Image:
            return [self.image(image)]
        default:
            // HTML и прочее, чего на экране быть не должно.
            return []
        }
    }

    static func image(_ image: Markdown.Image) -> ArticleBlock {
        let alt = plainText(image)
        // Изображение грузится только с проверенного хоста (`TrustedMedia`).
        let url = image.source.flatMap { URL(string: $0, relativeTo: ArticleLinks.site)?.absoluteURL }
            .flatMap { TrustedMedia.url($0.absoluteString) }
        return .image(url: url, alt: alt)
    }

    /// Встроенное содержимое → `AttributedString`, без пробелов по краям.
    static func inline<S: Sequence>(_ children: S) -> AttributedString where S.Element == Markup {
        var result = AttributedString()
        for child in children { append(child, to: &result, intent: [], link: nil) }
        return trimmed(result)
    }

    /// Обход узла: текст получает накопленное оформление; ссылка ставится
    /// только узлом `Link`, прошедшим `ArticleLinks.decide`.
    static func append(_ markup: Markup, to result: inout AttributedString, intent: ArticleStyle, link: URL?) {
        func run(_ text: String, _ extra: ArticleStyle = []) {
            var piece = AttributedString(text)
            let combined = intent.union(extra)
            if !combined.isEmpty {
                piece[ArticleStyleAttribute.self] = combined
                #if canImport(Darwin)
                piece.inlinePresentationIntent = combined.presentationIntent
                #endif
            }
            if let link { piece.link = link }
            result.append(piece)
        }
        switch markup {
        case let text as Text: run(text.string)
        case let code as InlineCode: run(code.code, .code)
        case is SoftBreak: run(" ")
        case is LineBreak: run("\n")
        case let image as Markdown.Image: run(plainText(image))
        case let emphasis as Emphasis:
            for child in emphasis.children { append(child, to: &result, intent: intent.union(.emphasized), link: link) }
        case let strong as Strong:
            for child in strong.children { append(child, to: &result, intent: intent.union(.strong), link: link) }
        case let strike as Strikethrough:
            for child in strike.children { append(child, to: &result, intent: intent.union(.strikethrough), link: link) }
        case let anchor as Markdown.Link:
            let target: URL?
            switch ArticleLinks.decide(anchor.destination ?? "") {
            case .drop: target = nil
            case .bodyGoals: target = ArticleLinks.bodyGoals
            case let .keep(url): target = url
            }
            // Ссылка внутри ссылки невозможна; внешняя побеждает.
            for child in anchor.children { append(child, to: &result, intent: intent, link: link ?? target) }
        default:
            // Встроенный HTML и прочее — только текст потомков.
            for child in markup.children { append(child, to: &result, intent: intent, link: link) }
        }
    }

    /// Подпись изображения — только буквы текста, без разметки.
    static func plainText(_ markup: Markup) -> String {
        if let text = markup as? Text { return text.string }
        if let code = markup as? InlineCode { return code.code }
        return markup.children.map(plainText).joined()
    }

    static func trimmed(_ text: AttributedString) -> AttributedString {
        var text = text
        while let first = text.characters.first, first.isWhitespace || first.isNewline {
            text.removeSubrange(text.startIndex..<text.index(afterCharacter: text.startIndex))
        }
        while let last = text.characters.last, last.isWhitespace || last.isNewline {
            text.removeSubrange(text.index(beforeCharacter: text.endIndex)..<text.endIndex)
        }
        return text
    }
}
