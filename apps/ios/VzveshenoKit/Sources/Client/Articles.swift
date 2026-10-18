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

/// Блок статьи для отрисовки на токенах. Встроенный текст — Markdown без
/// блоков (жирный, курсив, код, ссылки): его разбирает `AttributedString`.
public indirect enum ArticleBlock: Equatable, Sendable {
    case heading(level: Int, text: String)
    case paragraph(String)
    case image(url: URL?, alt: String)
    case list(ordered: Bool, start: Int, items: [[ArticleBlock]])
    case quote([ArticleBlock])
    case code(String)
    case table(ArticleTable)
    case rule
}

public struct ArticleTable: Equatable, Sendable {
    public var header: [String]
    public var rows: [[String]]

    public init(header: [String], rows: [[String]]) {
        self.header = header
        self.rows = rows
    }

    public var columnCount: Int { max(header.count, rows.map(\.count).max() ?? 0) }
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
            return text.isEmpty ? [] : [.paragraph(text)]
        case let list as UnorderedList:
            return [.list(ordered: false, start: 1, items: list.listItems.map { $0.children.flatMap(blocks) })]
        case let list as OrderedList:
            return [.list(ordered: true, start: Int(list.startIndex), items: list.listItems.map { $0.children.flatMap(blocks) })]
        case let quote as BlockQuote:
            return [.quote(quote.children.flatMap(blocks))]
        case let code as CodeBlock:
            return [.code(code.code.hasSuffix("\n") ? String(code.code.dropLast()) : code.code)]
        case let table as Markdown.Table:
            let header: [String] = table.head.cells.map { inline($0.children) }
            let rows: [[String]] = table.body.rows.map { row in Array(row.cells.map { inline($0.children) }) }
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
        let alt = image.children.compactMap { ($0 as? Text)?.string }.joined()
        let url = image.source.flatMap { URL(string: $0, relativeTo: ArticleLinks.site)?.absoluteURL }
        return .image(url: url, alt: alt)
    }

    /// Встроенное содержимое → Markdown для `AttributedString`.
    static func inline<S: Sequence>(_ children: S) -> String where S.Element == Markup {
        children.map(inline).joined().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func inline(_ markup: Markup) -> String {
        switch markup {
        case let text as Text: return escape(text.string)
        case let emphasis as Emphasis: return "*\(inlineRaw(emphasis.children))*"
        case let strong as Strong: return "**\(inlineRaw(strong.children))**"
        case let strike as Strikethrough: return "~~\(inlineRaw(strike.children))~~"
        case let code as InlineCode: return "`\(code.code)`"
        case let link as Markdown.Link:
            let label = inlineRaw(link.children)
            switch ArticleLinks.decide(link.destination ?? "") {
            case .drop: return label
            case .bodyGoals: return "[\(label)](\(ArticleLinks.bodyGoals.absoluteString))"
            case let .keep(url): return "[\(label)](\(url.absoluteString))"
            }
        case is SoftBreak: return " "
        case is LineBreak: return "\n"
        case let image as Markdown.Image: return image.children.compactMap { ($0 as? Text)?.string }.joined()
        default: return ""
        }
    }

    private static func inlineRaw<S: Sequence>(_ children: S) -> String where S.Element == Markup {
        children.map(inline).joined()
    }

    static func escape(_ text: String) -> String {
        var result = ""
        for character in text {
            if "\\`*_[]<>~#".contains(character) { result.append("\\") }
            result.append(character)
        }
        return result
    }
}
