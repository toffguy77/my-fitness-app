import Client
import Foundation
import SwiftUI
import UIKit

/// Загрузчики изображений приложения: общий (статьи, рецепты) и аккаунта
/// (аватары, фото переписки — стираются при выходе).
struct ImageLoaders: Sendable {
    let shared: ImageLoader
    let account: ImageLoader

    /// Без cookie и без общего `URLCache`: кэш — свой, с пределом и стиранием.
    static func make(shared: URL, account: URL) -> ImageLoaders {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 30
        let session = URLSession(configuration: configuration)
        let fetch: ImageLoader.Fetch = { url in
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            return data
        }
        return ImageLoaders(shared: ImageLoader(cache: ImageCache(directory: shared, limit: 50 * 1024 * 1024), fetch: fetch),
                            account: ImageLoader(cache: ImageCache(directory: account, limit: 50 * 1024 * 1024), fetch: fetch))
    }
}

private struct ImageLoadersKey: EnvironmentKey {
    static let defaultValue: ImageLoaders? = nil
}

extension EnvironmentValues {
    var imageLoaders: ImageLoaders? {
        get { self[ImageLoadersKey.self] }
        set { self[ImageLoadersKey.self] = newValue }
    }
}

/// Изображение через дисковый кэш: без сети — сохранённое. Без загрузчика
/// (снапшоты, предпросмотр) — только заглушка.
struct CachedImage<Placeholder: View>: View {
    enum Scope { case shared, account }

    let url: URL?
    var scope: Scope = .shared
    @ViewBuilder var placeholder: () -> Placeholder
    @Environment(\.imageLoaders) private var loaders
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            guard let url, let loader = scope == .shared ? loaders?.shared : loaders?.account else { return }
            if let data = await loader.load(url), let decoded = UIImage(data: data) { image = decoded }
        }
    }
}
