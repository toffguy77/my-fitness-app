import Foundation
import Outbox

/// Дисковый кэш изображений с пределом размера (`ios-offline-outbox`):
/// обложки статей и фото рецептов — общий, аватары и фото переписки — в
/// каталоге аккаунта, который выход стирает.
///
/// Файл — по хэшу адреса; при превышении предела удаляются давно не
/// открывавшиеся. Ничего, кроме байтов изображения, не хранится.
public final class ImageCache: @unchecked Sendable {
    public let directory: URL
    public let limit: Int
    private let lock = NSLock()

    /// `limit` — байт на каталог.
    public init(directory: URL, limit: Int) {
        self.directory = directory
        self.limit = limit
    }

    public func data(for url: URL, owner: Int64? = nil) -> Data? {
        lock.withLock {
            let file = path(url, owner: owner)
            guard let data = try? Data(contentsOf: file) else { return nil }
            // Открыто — значит, нужно: отметка для вытеснения старых.
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
            return data
        }
    }

    /// `owner` — аккаунт для личных изображений: свой подкаталог, чужой
    /// аккаунт файл не найдёт даже по тому же адресу.
    public func store(_ data: Data, for url: URL, owner: Int64? = nil) {
        guard data.count <= limit else { return }
        lock.withLock {
            let file = path(url, owner: owner)
            try? ProtectedFiles.prepareDirectory(file.deletingLastPathComponent())
            try? ProtectedFiles.write(data, to: file)
            prune()
        }
    }

    public func eraseAll() {
        lock.withLock { _ = try? FileManager.default.removeItem(at: directory) }
    }

    /// Сколько занято сейчас — для тестов и диагностики.
    public var size: Int {
        lock.withLock { files().reduce(0) { $0 + $1.size } }
    }

    private func path(_ url: URL, owner: Int64?) -> URL {
        // FNV-1a по адресу: имя файла, а не защита.
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in url.absoluteString.utf8 {
            hash = (hash ^ UInt64(byte)) &* 0x100000001b3
        }
        let folder = owner.map { directory.appendingPathComponent(String($0), isDirectory: true) } ?? directory
        return folder.appendingPathComponent(String(hash, radix: 16) + ".img")
    }

    private func files() -> [(url: URL, size: Int, date: Date)] {
        let keys: Set<URLResourceKey> = [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
        let enumerator = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: Array(keys))
        let list = (enumerator?.allObjects as? [URL] ?? []).filter {
            (try? $0.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true
        }
        return list.map { url in
            let values = try? url.resourceValues(forKeys: keys)
            return (url, values?.fileSize ?? 0, values?.contentModificationDate ?? .distantPast)
        }
    }

    private func prune() {
        var all = files()
        var total = all.reduce(0) { $0 + $1.size }
        guard total > limit else { return }
        all.sort { $0.date < $1.date }
        for file in all where total > limit {
            try? FileManager.default.removeItem(at: file.url)
            total -= file.size
        }
    }
}

/// Загрузка изображения: только с проверенного хоста (`TrustedMedia`), из
/// кэша, если есть, иначе из сети — и в кэш.
public struct ImageLoader: Sendable {
    public typealias Fetch = @Sendable (URL) async throws -> Data

    public let cache: ImageCache
    private let fetch: Fetch

    public init(cache: ImageCache, fetch: @escaping Fetch) {
        self.cache = cache
        self.fetch = fetch
    }

    public func load(_ raw: URL, owner: Int64? = nil) async -> Data? {
        guard let url = TrustedMedia.url(raw.absoluteString) else { return nil }
        if let cached = cache.data(for: url, owner: owner) { return cached }
        guard let data = try? await fetch(url), !data.isEmpty else { return nil }
        cache.store(data, for: url, owner: owner)
        return data
    }
}
