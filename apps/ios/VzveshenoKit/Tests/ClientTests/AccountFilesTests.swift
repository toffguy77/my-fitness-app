@testable import Client
import Foundation
import XCTest

/// Вложения и архив выгрузки: проверенные адреса, путь внутри каталога аккаунта, стирание.
final class TrustedMediaTests: XCTestCase {
    func testStorageAndOwnHostsAreTrusted() {
        XCTAssertEqual(TrustedMedia.url("https://storage.yandexcloud.net/burcev-chat/a.jpg")?.host, "storage.yandexcloud.net")
        XCTAssertEqual(TrustedMedia.url("https://new.burcev.team/media/a.png")?.host, "new.burcev.team")
    }

    /// Собеседник может вписать в сообщение любой адрес — приложение по нему не ходит.
    func testForeignAndTrickyAddressesAreRejected() {
        for raw in ["https://tracker.example.com/pixel.png", "http://storage.yandexcloud.net/a.jpg",
                    "https://storage.yandexcloud.net.evil.com/a.jpg", "file:///etc/passwd",
                    "https://storage.yandexcloud.net@evil.com/a.jpg", "https://user:pw@storage.yandexcloud.net/a.jpg",
                    "https://storage.yandexcloud.net:8443/a.jpg", "https://evil.com\\@storage.yandexcloud.net/a.jpg",
                    "javascript:alert(1)", "https://storage.yandexcloud.net/a.jpg#frag", ""] {
            XCTAssertNil(TrustedMedia.url(raw), raw)
        }
    }

    func testURLIsRebuiltFromCheckedParts() {
        XCTAssertEqual(TrustedMedia.url("HTTPS://Storage.YandexCloud.net:443/bucket/a%20b.jpg?x=1")?.absoluteString,
                       "https://storage.yandexcloud.net/bucket/a%20b.jpg?x=1")
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
        XCTAssertEqual(try message("https://storage.yandexcloud.net/c/a.jpg").fileURL?.host, "storage.yandexcloud.net")
        XCTAssertNil(try message("https://storage.yandexcloud.net/c/a.jpg", attachment: "https://evil.com/x.pdf").fileURL,
                     "непроверенное вложение не подменяется текстом")
        let text = try JSONDecoder().decode(ChatMessage.self, from: Data(
            #"{"id":"t","sender_id":3,"type":"text","content":"https://storage.yandexcloud.net/c/a.jpg","created_at":"2026-10-18T10:00:00Z"}"#
                .utf8))
        XCTAssertNil(text.fileURL, "у текстового сообщения вложения нет")
    }

    func testArticleImagesAndCoversOnlyFromTrustedHosts() {
        XCTAssertEqual(ArticleDocument(markdown: "![a](https://tracker.example.com/p.png)").blocks, [.image(url: nil, alt: "a")])
        XCTAssertNil(Article(id: "a", title: "т", coverImageURL: "https://tracker.example.com/c.jpg").coverURL)
        XCTAssertNotNil(Article(id: "a", title: "т", coverImageURL: "https://storage.yandexcloud.net/c/c.jpg").coverURL)
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
