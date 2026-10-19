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

/// Вошедший аккаунт — владелец личных изображений.
private struct ImageOwnerKey: EnvironmentKey {
    static let defaultValue: Int64? = nil
}

extension EnvironmentValues {
    var imageLoaders: ImageLoaders? {
        get { self[ImageLoadersKey.self] }
        set { self[ImageLoadersKey.self] = newValue }
    }

    var imageOwner: Int64? {
        get { self[ImageOwnerKey.self] }
        set { self[ImageOwnerKey.self] = newValue }
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
    @Environment(\.imageOwner) private var owner
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
            guard let url else { return }
            let data: Data?
            switch scope {
            case .shared:
                data = await loaders?.shared.load(url)
            case .account:
                // Без вошедшего аккаунта личное изображение не грузится и не кэшируется.
                guard let owner else { return }
                data = await loaders?.account.load(url, owner: owner)
            }
            if let data, let decoded = UIImage(data: data) { image = decoded }
        }
    }
}
