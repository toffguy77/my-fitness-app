import SwiftUI

// MARK: - Уведомления

struct NotificationsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openURL) private var openURL

    @State private var category = "main"
    @State private var items: [AppNotification] = []
    @State private var hasMore = false
    @State private var loading = false
    @State private var errorText: String?
    @State private var counts: UnreadCounts?

    var body: some View {
        List {
            Section {
                Picker("Раздел", selection: $category) {
                    Text(label("Основные", counts?.main)).tag("main")
                    Text(label("Статьи", counts?.content)).tag("content")
                }
                .pickerStyle(.segmented)
            }
            if let errorText {
                Text(errorText).foregroundStyle(.red)
            }
            if items.isEmpty && !loading {
                ContentUnavailableView("Уведомлений нет", systemImage: "bell.slash")
            }
            ForEach(items) { item in
                NavigationLink {
                    destination(item)
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: item.icon)
                            .foregroundStyle(item.isRead ? Color.secondary : Color.accentColor)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).fontWeight(item.isRead ? .regular : .semibold)
                            Text(item.content).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
                            if let created = item.created {
                                Text(created.formatted(.relative(presentation: .named)))
                                    .font(.caption).foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
                .simultaneousGesture(TapGesture().onEnded { Task { await markRead(item) } })
            }
            if hasMore {
                Button("Показать ещё") { Task { await load(reset: false) } }
            }
        }
        .navigationTitle("Уведомления")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Прочитать все") { Task { await markAll() } }
                    .disabled(items.allSatisfy(\.isRead))
            }
        }
        .refreshable { await load(reset: true) }
        .task(id: category) { await load(reset: true) }
    }

    @ViewBuilder
    private func destination(_ item: AppNotification) -> some View {
        if let articleID = item.articleID {
            ArticleView(articleID: articleID)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(item.title).font(.title2.weight(.semibold))
                    Text(item.content)
                    if let path = item.actionUrl, let url = URL(string: path, relativeTo: AppConfig.apiBaseURL) {
                        Button("Открыть на сайте") { openURL(url) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
            }
        }
    }

    private func label(_ title: String, _ count: Int?) -> String {
        guard let count, count > 0 else { return title }
        return "\(title) · \(count)"
    }

    private func load(reset: Bool) async {
        loading = true
        defer { loading = false }
        do {
            let offset = reset ? 0 : items.count
            let page = try await session.api.send(Endpoint<NotificationsPage>.get(
                "/api/v1/notifications",
                query: [URLQueryItem(name: "category", value: category),
                        URLQueryItem(name: "limit", value: "50"),
                        URLQueryItem(name: "offset", value: String(offset))]))
            items = reset ? page.notifications : items + page.notifications
            hasMore = page.hasMore
            errorText = nil
            counts = try? await session.api.send(Endpoint<UnreadCounts>.get("/api/v1/notifications/unread-counts"))
        } catch is CancellationError {
            return
        } catch {
            errorText = error.userMessage
        }
    }

    private func markRead(_ item: AppNotification) async {
        guard !item.isRead else { return }
        // 404 — уже прочитано или удалено: для человека это одно и то же.
        _ = try? await session.api.send(Endpoint<Empty>.post("/api/v1/notifications/\(item.id)/read", body: [String: String]()))
        await load(reset: true)
    }

    private func markAll() async {
        _ = try? await session.api.send(Endpoint<Empty>.post("/api/v1/notifications/mark-all-read",
                                                             body: MarkAllRequest(category: category)))
        await load(reset: true)
    }
}

/// Колокольчик со счётчиком для панели навигации.
struct NotificationsBell: View {
    @Environment(SessionStore.self) private var session
    @State private var unread = 0

    var body: some View {
        NavigationLink {
            NotificationsView()
        } label: {
            Image(systemName: unread > 0 ? "bell.badge" : "bell")
                .symbolRenderingMode(.multicolor)
        }
        .accessibilityLabel(unread > 0 ? "Уведомления, непрочитанных \(unread)" : "Уведомления")
        .task {
            // Как на сайте: счётчик раз в 30 секунд, пока экран на виду.
            while !Task.isCancelled {
                if let counts = try? await session.api.send(Endpoint<UnreadCounts>.get("/api/v1/notifications/unread-counts")) {
                    unread = counts.total
                }
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }
}

// MARK: - Статьи

struct FeedView: View {
    @Environment(SessionStore.self) private var session

    @State private var category: ContentCategory?
    @State private var articles: [Article] = []
    @State private var total = 0
    @State private var errorText: String?

    var body: some View {
        List {
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        chip("Все", selected: category == nil) { category = nil }
                        ForEach(ContentCategory.allCases) { c in
                            chip(c.title, selected: category == c) { category = c }
                        }
                    }
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }
            if let errorText {
                Text(errorText).foregroundStyle(.red)
            }
            ForEach(articles) { article in
                // Прямая ссылка на экран, а не переход по значению: лента
                // открывается из разных стеков навигации, и переход по
                // значению в одном из них не находил получателя.
                NavigationLink {
                    ArticleView(articleID: article.id)
                } label: {
                    ArticleCard(article: article)
                }
            }
            if articles.count < total {
                Button("Показать ещё") { Task { await load(reset: false) } }
            }
        }
        .navigationTitle("Статьи")
        .refreshable { await load(reset: true) }
        .task(id: category) { await load(reset: true) }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.bordered)
            .tint(selected ? .accentColor : .secondary)
    }

    private func load(reset: Bool) async {
        var query = [URLQueryItem(name: "limit", value: "20"),
                     URLQueryItem(name: "offset", value: String(reset ? 0 : articles.count))]
        if let category { query.append(URLQueryItem(name: "category", value: category.rawValue)) }
        do {
            let page = try await session.api.send(Endpoint<FeedPage>.get("/api/v1/content/feed", query: query))
            articles = reset ? page.articles : articles + page.articles
            total = page.total
            errorText = nil
        } catch is CancellationError {
            return
        } catch {
            errorText = error.userMessage
        }
    }
}

private struct ArticleCard: View {
    let article: Article

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let cover = article.cover_image_url, let url = URL(string: cover) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Rectangle().fill(.quaternary)
                }
                .frame(height: 150)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            Text(article.categoryTitle.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(Color.accentColor)
            Text(article.title).font(.headline)
            if let excerpt = article.excerpt, !excerpt.isEmpty {
                Text(excerpt).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
            }
        }
        .padding(.vertical, 4)
    }
}

struct ArticleView: View {
    @Environment(SessionStore.self) private var session
    let articleID: String

    @State private var content: Loadable<Article> = .loading
    @State private var linked: InApp?
    @Environment(\.openURL) private var openURL

    /// Куда в приложении ведут ссылки статей вместо страниц сайта.
    private enum InApp: Identifiable {
        case article(String), pricing, norm
        var id: String {
            switch self {
            case let .article(id): return id
            case .pricing: return "pricing"
            case .norm: return "norm"
            }
        }
    }

    var body: some View {
        Group {
            switch content {
            case .loading:
                ProgressView()
            case let .failed(message):
                ErrorRetryView(message: message) { Task { await load() } }
            case let .loaded(article):
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(article.categoryTitle.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(Color.accentColor)
                        Text(article.title).font(.title.weight(.bold))
                        HStack {
                            if let author = article.author_name { Text(author) }
                            if let date = article.published { Text("· \(date.formatted(date: .long, time: .omitted))") }
                        }
                        .font(.subheadline).foregroundStyle(.secondary)
                        if let cover = article.cover_image_url, let url = URL(string: cover) {
                            AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Rectangle().fill(.quaternary).frame(height: 200) }
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        if let body = article.body {
                            MarkdownView(markdown: body)
                        } else {
                            Text("Текст статьи сейчас недоступен. Попробуйте позже.").foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        // Ссылка на другую статью открывается в приложении, прочие — в браузере.
        .environment(\.openURL, OpenURLAction { link in
            let url = link.absoluteURL
            guard TrustedMedia.isTrusted(host: url.host?.lowercased() ?? "") else { return .systemAction }
            switch url.path {
            case let path where path.hasPrefix("/content/") && path.count == "/content/".count + 36:
                linked = .article(String(path.dropFirst("/content/".count)))
            case "/pricing":
                linked = .pricing
            case "/kalkulyator-kbzhu":
                linked = .norm
            default:
                return .systemAction
            }
            return .handled
        })
        .sheet(item: $linked) { target in
            NavigationStack {
                switch target {
                case let .article(id): ArticleView(articleID: id)
                case .pricing: CuratorOfferView(expired: false, source: "pricing").navigationTitle("Куратор")
                case .norm: BodySettingsView()
                }
            }
        }
    }

    private func load() async {
        do {
            content = .loaded(try await session.api.send(Endpoint<Article>.get("/api/v1/content/feed/\(articleID)")))
        } catch is CancellationError {
            return
        } catch {
            content = .failed(error.userMessage)
        }
    }
}

/// Markdown статей (GFM) по блокам: заголовки, абзацы, списки, цитаты,
/// картинки. Строчную разметку — жирный, курсив, ссылки — разбирает
/// `AttributedString`. Первый `# H1` пропускаем: заголовок статьи уже над текстом,
/// как и на сайте.
struct MarkdownView: View {
    let markdown: String

    enum Block: Identifiable {
        case heading(Int, String, Int)
        case paragraph(String, Int)
        case bullet(String, Int)
        case quote(String, Int)
        case image(URL, String, Int)

        var id: Int {
            switch self {
            case let .heading(_, _, i), let .paragraph(_, i), let .bullet(_, i), let .quote(_, i), let .image(_, _, i): return i
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Self.parse(markdown)) { block in
                switch block {
                case let .heading(level, text, _):
                    Text(inline(text)).font(level <= 2 ? .title2.weight(.bold) : .title3.weight(.semibold)).padding(.top, 6)
                case let .paragraph(text, _):
                    Text(inline(text))
                case let .bullet(text, _):
                    HStack(alignment: .firstTextBaseline, spacing: 8) { Text("•"); Text(inline(text)) }
                case let .quote(text, _):
                    Text(inline(text)).italic().padding(.leading, 12)
                        .overlay(alignment: .leading) { Rectangle().fill(Color.accentColor).frame(width: 3) }
                case let .image(url, alt, _):
                    AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Rectangle().fill(.quaternary).frame(height: 180) }
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .accessibilityLabel(alt)
                }
            }
        }
        .textSelection(.enabled)
    }

    /// Ссылки в статьях бывают относительными («/kalkulyator-kbzhu»): без
    /// адреса сайта они не открывались ничем.
    private func inline(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace),
                               baseURL: AppConfig.apiBaseURL))
            ?? AttributedString(text)
    }

    static func parse(_ markdown: String) -> [Block] {
        var blocks: [Block] = []
        var paragraph: [String] = []
        var skippedTitle = false
        func flush() {
            if !paragraph.isEmpty {
                blocks.append(.paragraph(paragraph.joined(separator: " "), blocks.count))
                paragraph = []
            }
        }
        for raw in markdown.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { flush(); continue }
            if let match = line.firstMatch(of: /^!\[(.*?)\]\((\S+?)\)$/) {
                flush()
                // Картинку с чужого адреса не грузим и разметку не показываем.
                if let url = TrustedMedia.url(String(match.2)) {
                    blocks.append(.image(url, String(match.1), blocks.count))
                }
                continue
            }
            if line.hasPrefix("#") {
                flush()
                let level = line.prefix(while: { $0 == "#" }).count
                let text = line.dropFirst(level).trimmingCharacters(in: .whitespaces)
                if level == 1 && !skippedTitle && blocks.isEmpty { skippedTitle = true; continue }
                blocks.append(.heading(level, text, blocks.count)); continue
            }
            if line.hasPrefix("- ") || line.hasPrefix("* ") || line.firstMatch(of: /^\d+\.\s/) != nil {
                flush()
                let text = line.replacing(/^(\-|\*|\d+\.)\s+/, with: "")
                blocks.append(.bullet(text, blocks.count)); continue
            }
            if line.hasPrefix(">") {
                flush(); blocks.append(.quote(line.dropFirst().trimmingCharacters(in: .whitespaces), blocks.count)); continue
            }
            paragraph.append(line)
        }
        flush()
        return blocks
    }
}
