import Foundation

/// Адреса медиа, по которым приложение готово ходить.
///
/// Сервер кладёт файлы в Object Storage и отдаёт публичные ссылки вида
/// `https://storage.yandexcloud.net/<бакет>/…`. Ссылку с другого адреса не
/// грузим: её мог вписать собеседник или автор статьи, и тогда запрос уходил
/// бы на чужой сервер с адресом и временем открытия (перенесено из 0.3.x).
public enum TrustedMedia {
    /// Object Storage Яндекса — общий хост всех клиентов облака: сам по себе
    /// он ничего не гарантирует, проверяется ещё и бакет.
    public static let storageHost = "storage.yandexcloud.net"

    /// Наши бакеты — те же имена на dev и проде (значения по умолчанию в
    /// `apps/api/internal/config/config.go`; сверяет `TrustedMediaTests`).
    public static let buckets: Set<String> = ["weekly-progress-photos", "profiles-photos", "chats", "curator-content",
                                              "food-photos", "data-exports"]

    /// Свои домены: файлы, которые отдаёт API.
    public static let ownHosts: Set<String> = ["burcev.team", "www.burcev.team", "new.burcev.team"]

    /// Проверенная ссылка, собранная заново только из проверенных частей:
    /// загружается ровно то, что прошло проверку, а не исходная строка,
    /// которую другой разборщик мог бы прочитать иначе.
    public static func url(_ raw: String) -> URL? {
        guard !raw.contains("\\"), let parts = URLComponents(string: raw.trimmingCharacters(in: .whitespaces)),
              parts.scheme?.lowercased() == "https",
              parts.user == nil, parts.password == nil,
              parts.port == nil || parts.port == 443,
              let host = parts.host?.lowercased(),
              parts.fragment == nil,
              isCleanPath(parts.percentEncodedPath),
              isTrusted(host: host, path: parts.percentEncodedPath) else {
            return nil
        }
        var clean = URLComponents()
        clean.scheme = "https"
        clean.host = host
        clean.percentEncodedPath = parts.percentEncodedPath
        clean.percentEncodedQuery = parts.percentEncodedQuery
        return clean.url
    }

    /// Путь без `.`/`..`, закодированных разделителей и пустых сегментов.
    static func isCleanPath(_ path: String) -> Bool {
        let lowered = path.lowercased()
        guard path.hasPrefix("/"), !lowered.contains("%2f"), !lowered.contains("%5c"), !lowered.contains("%2e"),
              !path.contains("\\") else { return false }
        let segments = path.split(separator: "/", omittingEmptySubsequences: false).dropFirst()
        return !segments.contains { $0 == "." || $0 == ".." || $0.isEmpty }
    }

    static func isTrusted(host: String, path: String) -> Bool {
        if ownHosts.contains(host) { return true }
        if host == storageHost {
            // Путь: /<бакет>/<ключ>.
            let bucket = path.split(separator: "/").first.map(String.init) ?? ""
            return buckets.contains(bucket) && path.split(separator: "/").count >= 2
        }
        // Виртуальный хост: <бакет>.storage.yandexcloud.net.
        let suffix = "." + storageHost
        guard host.hasSuffix(suffix) else { return false }
        return buckets.contains(String(host.dropLast(suffix.count)))
    }
}

/// Файлы аккаунта на устройстве вне кэша экранов: вложения переписки,
/// открытые в QuickLook, и архив выгрузки данных. Живут в защищённом каталоге
/// аккаунта и стираются при выходе вместе с остальными данными.
public struct AccountFiles: Sendable {
    public let root: URL

    public init(root: URL) {
        self.root = root.standardizedFileURL
    }

    public var attachments: URL { root.appendingPathComponent("attachments", isDirectory: true) }
    public var exports: URL { root.appendingPathComponent("exports", isDirectory: true) }

    /// Каталоги, которые выход стирает.
    public var erasable: [URL] { [attachments, exports] }

    /// Имя файла без каталогов; пустое, `.`, `..` и скрытое — отказ.
    public static func safeName(_ raw: String) -> String? {
        let last = raw.replacingOccurrences(of: "\\", with: "/").split(separator: "/").last.map(String.init) ?? ""
        let cleaned = last.filter { !$0.isNewline && $0 != "\0" && $0 != ":" }.trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty, cleaned != ".", cleaned != "..", !cleaned.hasPrefix(".") else { return nil }
        return String(cleaned.prefix(120))
    }

    /// Каталог по идентификатору: только буквы, цифры и дефис.
    static func safeID(_ raw: String) -> String? {
        let allowed = raw.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || $0 == "-" }
        return allowed && !raw.isEmpty && raw.count <= 64 ? raw : nil
    }

    /// `attachments/<аккаунт>/<сообщение>/<имя>`; имя от сервера — только для
    /// заголовка QuickLook. Путь вне каталога вложений не выдаётся.
    public func attachment(accountID: Int64, messageID: String, displayName: String) -> URL? {
        guard let id = Self.safeID(messageID), let name = Self.safeName(displayName) else { return nil }
        let url = attachments.appendingPathComponent(String(accountID), isDirectory: true)
            .appendingPathComponent(id, isDirectory: true)
            .appendingPathComponent(name)
            .standardizedFileURL
        return Self.isInside(url, attachments) ? url : nil
    }

    /// Архив выгрузки.
    public func export(named raw: String) -> URL? {
        guard let name = Self.safeName(raw) else { return nil }
        let url = exports.appendingPathComponent(name).standardizedFileURL
        return Self.isInside(url, exports) ? url : nil
    }

    static func isInside(_ url: URL, _ directory: URL) -> Bool {
        url.path.hasPrefix(directory.standardizedFileURL.path + "/")
    }

    /// Выход: вложения и архивы аккаунта удаляются.
    public func eraseAll() {
        for directory in erasable { try? FileManager.default.removeItem(at: directory) }
    }
}
