@testable import Client
import Foundation
import TestSupport
import XCTest

/// Вложения и архив выгрузки: проверенные адреса, путь внутри каталога аккаунта, стирание.
final class TrustedMediaTests: XCTestCase {
    func testOurBucketsAndOwnHostsAreTrusted() {
        XCTAssertEqual(TrustedMedia.url("https://storage.yandexcloud.net/chats/dev/a.jpg")?.host, "storage.yandexcloud.net")
        XCTAssertNotNil(TrustedMedia.url("https://storage.yandexcloud.net/weekly-progress-photos/7/2026-W42.jpg"))
        XCTAssertNotNil(TrustedMedia.url("https://curator-content.storage.yandexcloud.net/a.png"), "виртуальный хост нашего бакета")
        XCTAssertEqual(TrustedMedia.url("https://new.burcev.team/media/a.png")?.host, "new.burcev.team")
    }

    /// Хост хранилища общий для всех клиентов облака — чужой бакет не наш.
    func testForeignBucketIsRejected() {
        for raw in ["https://storage.yandexcloud.net/attacker-bucket/a.jpg", "https://storage.yandexcloud.net/chats",
                    "https://storage.yandexcloud.net/", "https://attacker.storage.yandexcloud.net/a.jpg",
                    "https://chats.evil.storage.yandexcloud.net/a.jpg", "https://storage.yandexcloud.net/chatsx/a.jpg"] {
            XCTAssertNil(TrustedMedia.url(raw), raw)
        }
    }

    func testPathTricksAreRejected() {
        for raw in ["https://storage.yandexcloud.net/chats/../attacker/a.jpg", "https://storage.yandexcloud.net/chats/./a.jpg",
                    "https://storage.yandexcloud.net/chats%2F..%2Fattacker/a.jpg", "https://storage.yandexcloud.net/chats/%2e%2e/x",
                    "https://storage.yandexcloud.net/chats//a.jpg", "https://storage.yandexcloud.net/chats\\..\\x/a.jpg",
                    "https://u@storage.yandexcloud.net/chats/a.jpg", "https://storage.yandexcloud.net:444/chats/a.jpg",
                    "https://new.burcev.team/../etc/passwd"] {
            XCTAssertNil(TrustedMedia.url(raw), raw)
        }
    }

    /// Список бакетов совпадает со значениями по умолчанию сервера.
    func testBucketsMatchServerConfig() throws {
        let config = try RepositoryFiles.read("apps/api/internal/config/config.go")
        let pattern = #"getEnvWithFallback\("\w+_S3_BUCKET", "S3_BUCKET", "([a-z0-9-]+)"\)"#
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(config.startIndex..., in: config)
        let names = Set(regex.matches(in: config, range: range).compactMap { match in
            Range(match.range(at: 1), in: config).map { String(config[$0]) }
        })
        XCTAssertFalse(names.isEmpty)
        XCTAssertEqual(names, TrustedMedia.buckets)
    }

    /// Собеседник может вписать в сообщение любой адрес — приложение по нему не ходит.
    func testForeignAndTrickyAddressesAreRejected() {
        for raw in ["https://tracker.example.com/pixel.png", "http://storage.yandexcloud.net/a.jpg",
                    "https://storage.yandexcloud.net.evil.com/a.jpg", "file:///etc/passwd",
                    "https://storage.yandexcloud.net@evil.com/a.jpg", "https://user:pw@storage.yandexcloud.net/a.jpg",
                    "https://storage.yandexcloud.net:8443/a.jpg", "https://evil.com\\@storage.yandexcloud.net/a.jpg",
                    "javascript:alert(1)", "https://storage.yandexcloud.net/chats/a.jpg#frag", ""] {
            XCTAssertNil(TrustedMedia.url(raw), raw)
        }
    }

    func testURLIsRebuiltFromCheckedParts() {
        XCTAssertEqual(TrustedMedia.url("HTTPS://Storage.YandexCloud.net:443/chats/a%20b.jpg?x=1")?.absoluteString,
                       "https://storage.yandexcloud.net/chats/a%20b.jpg?x=1")
    }

    func testMessageFileURLOnlyFromTrustedHosts() throws {
        func message(_ content: String, attachment: String? = nil) throws -> ChatMessage {
            let attachments = attachment.map {
                #"[{"id":"a","file_url":"\#($0)","file_name":"x.pdf","file_size":1,"mime_type":"application/pdf"}]"#
            } ?? "[]"
            let json = #"{"id":"m","sender_id":3,"type":"image","content":"\#(content)","attachments":\#(attachments),"#
                + #""created_at":"2026-10-18T10:00:00Z"}"#
            return try JSONDecoder().decode(ChatMessage.self, from: Data(json.utf8))
        }
        XCTAssertNil(try message("https://tracker.example.com/p.png").fileURL)
        XCTAssertEqual(try message("https://storage.yandexcloud.net/chats/a.jpg").fileURL?.host, "storage.yandexcloud.net")
        XCTAssertNil(try message("https://storage.yandexcloud.net/chats/a.jpg", attachment: "https://evil.com/x.pdf").fileURL,
                     "непроверенное вложение не подменяется текстом")
        let text = try JSONDecoder().decode(ChatMessage.self, from: Data(
            #"{"id":"t","sender_id":3,"type":"text","content":"https://storage.yandexcloud.net/chats/a.jpg","created_at":"2026-10-18T10:00:00Z"}"#
                .utf8))
        XCTAssertNil(text.fileURL, "у текстового сообщения вложения нет")
    }

    func testArticleImagesAndCoversOnlyFromTrustedHosts() {
        XCTAssertEqual(ArticleDocument(markdown: "![a](https://tracker.example.com/p.png)").blocks, [.image(url: nil, alt: "a")])
        XCTAssertNil(Article(id: "a", title: "т", coverImageURL: "https://tracker.example.com/c.jpg").coverURL)
        XCTAssertNotNil(Article(id: "a", title: "т", coverImageURL: "https://storage.yandexcloud.net/curator-content/c.jpg").coverURL)
    }
}

final class AccountFilesTests: XCTestCase {
    private func files() -> AccountFiles {
        AccountFiles(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true))
    }

    func testAttachmentPathIsPerAccountAndMessage() throws {
        let files = files()
        let url = try XCTUnwrap(files.attachment(accountID: 7, messageID: "0b6e5b9c-6c1c", displayName: "анализы.pdf"))
        XCTAssertEqual(url.path, files.attachments.path + "/7/0b6e5b9c-6c1c/анализы.pdf")
    }

    /// Имя от сервера не выводит за каталог вложений.
    func testTraversalNamesStayInsideOrAreRejected() {
        let files = files()
        for name in ["../../session.json", "/etc/passwd", "..\\..\\x", "a/../../b.pdf"] {
            if let url = files.attachment(accountID: 7, messageID: "m1", displayName: name) {
                XCTAssertTrue(url.path.hasPrefix(files.attachments.path + "/7/m1/"), "\(name) → \(url.path)")
                XCTAssertFalse(url.path.contains(".."), name)
            }
        }
        for name in ["", ".", "..", "../", ".hidden", "   "] {
            XCTAssertNil(files.attachment(accountID: 7, messageID: "m1", displayName: name), "«\(name)»")
        }
        for id in ["../m1", "m/1", "", ".."] {
            XCTAssertNil(files.attachment(accountID: 7, messageID: id, displayName: "a.pdf"), "id «\(id)»")
        }
        XCTAssertNil(files.export(named: ".."))
        XCTAssertEqual(files.export(named: "../x.zip")?.deletingLastPathComponent(), files.exports.standardizedFileURL)
    }

    /// Выход стирает вложения и архивы выгрузки.
    func testEraseRemovesAttachmentsAndExports() throws {
        let files = files()
        let attachment = try XCTUnwrap(files.attachment(accountID: 7, messageID: "m1", displayName: "a.pdf"))
        let archive = try XCTUnwrap(files.export(named: "vzvesheno-export.zip"))
        for url in [attachment, archive] {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data("x".utf8).write(to: url)
        }
        XCTAssertEqual(Set(files.erasable), [files.attachments, files.exports])
        files.eraseAll()
        XCTAssertFalse(FileManager.default.fileExists(atPath: attachment.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: archive.path))
    }
}
