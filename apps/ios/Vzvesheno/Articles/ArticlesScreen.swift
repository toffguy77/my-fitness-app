import Client
import DesignSystem
import Navigation
import SwiftUI

/// Вкладка «Статьи» (`ios-content-reader`).
struct ArticlesScreen: View {
    @Environment(AppModel.self) private var model
    let offline: Bool

    var body: some View {
        ScrollView {
            if let feed = model.articles {
                FreshnessBanner(offline: offline || feed.offline, updatedLabel: feed.updatedLabel)
                    .padding(.horizontal, DS.Space.screenX)
                if feed.articles.isEmpty && feed.offline {
                    OfflineEmptyView(text: "Сохранённых статей пока нет. Лента обновится, когда появится сеть.")
                } else {
                    ArticlesContent(category: feed.category, articles: feed.articles, loading: feed.loading, error: feed.error,
                                onSelect: { category in Task { await feed.select(category) } },
                                    onReachEnd: { Task { await feed.loadMore() } })
                }
            }
        }
        .background(DS.Color.bgCanvas)
        .refreshable { await model.articles?.reload() }
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("screen.articles")
        .task {
            // Сохранённая лента уже на экране — свежая заменит её.
            if let feed = model.articles, !feed.loaded || feed.updatedLabel != nil { await feed.reload() }
        }
    }
}

/// Статья по ленте, ссылке `/content/<slug>` или пушу.
struct ArticleScreen: View {
    @Environment(AppModel.self) private var model
    let reference: String
    @State private var article: ArticleModel?

    var body: some View {
        ScrollView {
            if let article {
                FreshnessBanner(offline: article.offline && article.document != nil, updatedLabel: article.updatedLabel)
                    .padding(.horizontal, DS.Space.screenX)
            }
            if let article, let shown = article.article {
                ArticleContent(article: shown, document: article.document, onCalculate: { openBodyGoals() })
                    .environment(\.openURL, OpenURLAction { url in
                        // Калькулятор нормы из текста статьи — «Тело и цели» в приложении.
                        if url == ArticleLinks.bodyGoals {
                            MainActor.assumeIsolated { openBodyGoals() }
                            return .handled
                        }
                        return .systemAction
                    })
            } else if let error = article?.error {
                Text(error).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted).padding(DS.Space.screenX)
            } else {
                DSSpinner("Загружаем статью").frame(maxWidth: .infinity).padding(.top, DS.Space.s8)
            }
        }
        .background(DS.Color.bgCanvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = article?.article?.shareURL {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel("Поделиться")
                        .accessibilityIdentifier("article.share")
                }
            }
        }
        .accessibilityIdentifier("screen.article")
        .task {
            guard article == nil else { return }
            let preview = model.articles?.articles.first { $0.id == reference || $0.slug == reference }
            let loaded = ArticleModel(api: model.api, reference: reference, preview: preview, cache: model.cache,
                                      account: model.user?.id)
            article = loaded
            await loaded.load()
        }
    }

    private func openBodyGoals() {
        let tab = model.selectedTab ?? .articles
        model.paths[tab, default: []].append(.settings(section: SettingsSection.bodyGoals.rawValue))
    }
}
