import Client
import DesignSystem
import Navigation
import SwiftUI

/// Изображение статьи по адресу. В снапшотах — заглушка без сети, иначе
/// снимок ловил бы случайную фазу загрузки.
typealias ArticleImage = @MainActor (URL?) -> AnyView

@MainActor let remoteArticleImage: ArticleImage = { url in
    AnyView(CachedImage(url: url) { ArticleImagePlaceholder() })
}

/// Заглушка изображения: мягкий градиент поверхностей токенов.
struct ArticleImagePlaceholder: View {
    var body: some View {
        LinearGradient(colors: [DS.Color.bgSubtle, DS.Color.primarySoft], startPoint: .topLeading, endPoint: .bottomTrailing)
            .accessibilityHidden(true)
    }
}

// MARK: Лента

/// «Статьи» без модели (макет Articles.png): заголовок, чипы категорий,
/// первая статья крупно, остальные строками.
struct ArticlesContent: View {
    let category: ArticleCategory?
    let articles: [Article]
    let loading: Bool
    let error: String?
    var image: ArticleImage = remoteArticleImage
    var onSelect: (ArticleCategory?) -> Void = { _ in }
    var onReachEnd: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            Text("Статьи")
                .dsText(DS.Typography.display)
                .foregroundStyle(DS.Color.fgDefault)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, DS.Space.screenX)
            CategoryChips(selected: category, onSelect: onSelect)
            if let error, articles.isEmpty {
                Text(error).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted).padding(.horizontal, DS.Space.screenX)
            } else if articles.isEmpty, !loading {
                Text("В этой категории пока нет статей.")
                    .dsText(DS.Typography.body)
                    .foregroundStyle(DS.Color.fgMuted)
                    .padding(.horizontal, DS.Space.screenX)
                    .accessibilityIdentifier("articles.empty")
            }
            ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                NavigationLink(value: Destination.article(slug: article.id)) {
                    if index == 0 {
                        FeaturedArticleCard(article: article, image: image)
                    } else {
                        ArticleRow(article: article, image: image)
                    }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, DS.Space.screenX)
                .accessibilityIdentifier("article.\(article.id)")
                // Последняя статья на экране — следующая страница.
                .onScrollVisibilityChange(threshold: 0.2) { visible in
                    if visible, index == articles.count - 1 { onReachEnd() }
                }
            }
            if loading, !articles.isEmpty {
                DSSpinner("Загружаем статьи").frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, DS.Space.s4)
    }
}

private struct CategoryChips: View {
    let selected: ArticleCategory?
    let onSelect: (ArticleCategory?) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: DS.Space.s2) {
                chip("Все", id: "all", isOn: selected == nil) { onSelect(nil) }
                ForEach(ArticleCategory.allCases) { category in
                    chip(category.title, id: category.rawValue, isOn: selected == category) { onSelect(category) }
                }
            }
            .padding(.horizontal, DS.Space.screenX)
        }
    }

    private func chip(_ title: String, id: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .callout))
                .foregroundStyle(isOn ? DS.Color.fgInverse : DS.Color.fgDefault)
                .padding(.horizontal, DS.Space.s4)
                .frame(minHeight: DS.Size.touch)
                .background(Capsule().fill(isOn ? DS.Color.fgDefault : DS.Color.bgSubtle))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .accessibilityIdentifier("articles.chip.\(id)")
    }
}

private struct FeaturedArticleCard: View {
    let article: Article
    let image: ArticleImage

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        VStack(alignment: .leading, spacing: 0) {
            image(article.coverURL)
                .frame(height: 150)
                .frame(maxWidth: .infinity)
                .clipped()
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                Text(article.meta).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                Text(article.title)
                    .dsText(DS.Typography.title2)
                    .foregroundStyle(DS.Color.fgDefault)
                    .fixedSize(horizontal: false, vertical: true)
                if let excerpt = article.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(DS.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(DS.Color.bgSurface)
        .clipShape(shape)
        .overlay(shape.strokeBorder(DS.Color.lineDefault))
        .accessibilityElement(children: .combine)
    }
}

private struct ArticleRow: View {
    let article: Article
    let image: ArticleImage

    var body: some View {
        HStack(alignment: .top, spacing: DS.Space.s4) {
            image(article.coverURL)
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous))
            VStack(alignment: .leading, spacing: DS.Space.s1) {
                Text(article.meta).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                Text(article.title)
                    .dsText(DS.Typography.title3)
                    .foregroundStyle(DS.Color.fgDefault)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, DS.Space.s2)
        .overlay(alignment: .bottom) { Rectangle().fill(DS.Color.lineDefault).frame(height: 1).offset(y: DS.Space.s2) }
        .accessibilityElement(children: .combine)
    }
}

// MARK: Статья

/// Статья без модели: обложка, рубрика, заголовок, текст блоками на
/// токенах и призыв «Рассчитать мою норму» → «Тело и цели».
struct ArticleContent: View {
    let article: Article
    let document: ArticleDocument?
    var image: ArticleImage = remoteArticleImage
    var onCalculate: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            if let cover = article.coverURL {
                image(cover)
                    .frame(height: 200)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous))
            }
            Text(metaLine).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
            Text(article.title)
                .dsText(DS.Typography.title1)
                .foregroundStyle(DS.Color.fgDefault)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("article.title")
            if let document {
                ForEach(Array(document.blocks.enumerated()), id: \.offset) { _, block in
                    ArticleBlockView(block: block, image: image)
                }
            } else {
                DSSpinner("Загружаем статью").frame(maxWidth: .infinity)
            }
            ArticleCallToAction(onCalculate: onCalculate)
                .padding(.top, DS.Space.s4)
        }
        .padding(.horizontal, DS.Space.screenX)
        .padding(.vertical, DS.Space.s4)
    }

    private var metaLine: String {
        var parts = [article.meta]
        if let author = article.authorName, !author.isEmpty { parts.append(author) }
        if let body = article.body { parts.append("\(ArticleDocument.readingMinutes(body)) мин") }
        return parts.joined(separator: " · ")
    }
}

/// Призыв статьи — в приложении: «Тело и цели», а не калькулятор сайта и не тарифы.
struct ArticleCallToAction: View {
    let onCalculate: () -> Void

    var body: some View {
        DSCard {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                Text("Узнайте свою норму КБЖУ")
                    .dsText(DS.Typography.title3)
                    .foregroundStyle(DS.Color.fgDefault)
                Text("Укажите рост, вес и цель — приложение пересчитает норму калорий и БЖУ.")
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Рассчитать мою норму", action: onCalculate)
                    .buttonStyle(DSButtonStyle(.primary))
                    .accessibilityIdentifier("article.calculate")
            }
        }
    }
}

/// Блок статьи на токенах: заголовки Literata, текст Golos, таблицы — в
/// горизонтальной прокрутке, изображения — с заглушкой. Текст — с Dynamic Type.
struct ArticleBlockView: View {
    let block: ArticleBlock
    let image: ArticleImage

    var body: some View {
        switch block {
        case let .heading(level, text):
            Text(text)
                .dsText(level <= 2 ? DS.Typography.title2 : DS.Typography.title3)
                .foregroundStyle(DS.Color.fgDefault)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, DS.Space.s2)
                .accessibilityAddTraits(.isHeader)
        case let .paragraph(text):
            Text(text)
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgDefault)
                .tint(DS.Color.primaryDefault)
                .fixedSize(horizontal: false, vertical: true)
        case let .image(url, alt):
            image(url)
                .frame(maxWidth: .infinity)
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous))
                .accessibilityElement()
                .accessibilityLabel(alt.isEmpty ? "Изображение" : alt)
                .accessibilityAddTraits(.isImage)
        case let .list(ordered, start, items):
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: DS.Space.s2) {
                        Text(ordered ? "\(start + index)." : "•")
                            .dsText(DS.Typography.body)
                            .foregroundStyle(DS.Color.fgMuted)
                        VStack(alignment: .leading, spacing: DS.Space.s2) {
                            ForEach(Array(item.enumerated()), id: \.offset) { _, inner in
                                ArticleBlockView(block: inner, image: image)
                            }
                        }
                    }
                }
            }
        case let .quote(blocks):
            HStack(spacing: DS.Space.s3) {
                Rectangle().fill(DS.Color.primaryDefault).frame(width: 3)
                VStack(alignment: .leading, spacing: DS.Space.s2) {
                    ForEach(Array(blocks.enumerated()), id: \.offset) { _, inner in
                        ArticleBlockView(block: inner, image: image)
                    }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        case let .code(text):
            ScrollView(.horizontal, showsIndicators: false) {
                Text(text)
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(DS.Color.fgDefault)
                    .padding(DS.Space.s3)
            }
            .background(RoundedRectangle(cornerRadius: DS.Radius.s).fill(DS.Color.bgSubtle))
        case let .table(table):
            ArticleTableView(table: table)
        case .rule:
            Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
        }
    }
}

/// Таблица GFM: шире экрана — прокручивается, текст статьи не сжимается.
struct ArticleTableView: View {
    let table: ArticleTable

    var body: some View {
        ScrollView(.horizontal, showsIndicators: true) {
            Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    ForEach(0..<table.columnCount, id: \.self) { column in
                        cell(column < table.header.count ? table.header[column] : AttributedString(), header: true)
                    }
                }
                ForEach(Array(table.rows.enumerated()), id: \.offset) { _, row in
                    GridRow {
                        ForEach(0..<table.columnCount, id: \.self) { column in
                            cell(column < row.count ? row[column] : AttributedString(), header: false)
                        }
                    }
                }
            }
            .overlay(RoundedRectangle(cornerRadius: DS.Radius.s).strokeBorder(DS.Color.lineDefault))
        }
        .accessibilityIdentifier("article.table")
    }

    private func cell(_ text: AttributedString, header: Bool) -> some View {
        Text(text)
            .dsText(header ? DS.Typography.headline : DS.Typography.callout)
            .foregroundStyle(DS.Color.fgDefault)
            .padding(.horizontal, DS.Space.s3)
            .padding(.vertical, DS.Space.s2)
            .frame(minWidth: 72, alignment: .leading)
            .background(header ? DS.Color.bgSubtle : DS.Color.bgSurface)
            .overlay(alignment: .bottom) { Rectangle().fill(DS.Color.lineDefault).frame(height: 1) }
    }
}
