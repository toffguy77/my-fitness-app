@testable import Client
import Foundation
import XCTest

/// Кэш изображений: предел размера, только проверенные хосты, стирание.
final class ImageCacheTests: XCTestCase {
    private let root = FileManager.default.temporaryDirectory.appendingPathComponent("images-\(UUID().uuidString)")

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var value: [URL] = []
        var urls: [URL] { lock.withLock { value } }
        func add(_ url: URL) { lock.withLock { value.append(url) } }
    }

    func testLoadsOnceThenFromDisk() async throws {
        let counter = Counter()
        let loader = ImageLoader(cache: ImageCache(directory: root, limit: 1_000)) { url in
            counter.add(url)
            return Data(repeating: 1, count: 100)
        }
        let url = try XCTUnwrap(URL(string: "https://storage.yandexcloud.net/curator-content/cover.jpg"))
        let first = await loader.load(url)
        let second = await loader.load(url)
        XCTAssertEqual(first?.count, 100)
        XCTAssertEqual(second, first)
        XCTAssertEqual(counter.urls.count, 1, "второй раз — с диска, без сети")
        // Новый процесс: тот же каталог.
        let offline = ImageLoader(cache: ImageCache(directory: root, limit: 1_000)) { _ in throw URLError(.notConnectedToInternet) }
        let cached = await offline.load(url)
        XCTAssertEqual(cached?.count, 100)
    }

    func testUntrustedHostIsNeverFetched() async throws {
        let counter = Counter()
        let loader = ImageLoader(cache: ImageCache(directory: root, limit: 1_000)) { url in
            counter.add(url)
            return Data([1])
        }
        let foreign = await loader.load(try XCTUnwrap(URL(string: "https://evil.example/tracker.png")))
        XCTAssertNil(foreign)
        XCTAssertTrue(counter.urls.isEmpty)
    }

    func testSizeCapEvictsLeastRecentlyUsed() throws {
        let cache = ImageCache(directory: root, limit: 250)
        let urls = try (0..<3).map { try XCTUnwrap(URL(string: "https://burcev.team/a\($0).jpg")) }
        cache.store(Data(repeating: 0, count: 100), for: urls[0])
        // Разные отметки времени для порядка вытеснения.
        try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -100)],
                                              ofItemAtPath: try XCTUnwrap(FileManager.default.contentsOfDirectory(
                                                at: root, includingPropertiesForKeys: nil).first).path)
        cache.store(Data(repeating: 0, count: 100), for: urls[1])
        cache.store(Data(repeating: 0, count: 100), for: urls[2])
        XCTAssertLessThanOrEqual(cache.size, 250)
        XCTAssertNil(cache.data(for: urls[0]), "давно не открывавшееся вытеснено")
        XCTAssertNotNil(cache.data(for: urls[2]))
        cache.store(Data(repeating: 0, count: 300), for: urls[0])
        XCTAssertNil(cache.data(for: urls[0]), "больше предела — не кэшируется")
        cache.eraseAll()
        XCTAssertNil(cache.data(for: urls[2]), "выход стирает")
    }
}
