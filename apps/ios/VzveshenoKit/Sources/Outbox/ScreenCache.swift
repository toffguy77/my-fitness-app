import Foundation

/// Последний ответ экрана.
public struct CachedScreen: Equatable, Sendable {
    public let data: Data
    public let updatedAt: Date

    /// Подпись «Обновлено в 14:20» — сегодня; «Обновлено 15 окт. в 14:20» — раньше.
    public func updatedLabel(now: Date = Date(), timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let time = Self.formatter("HH:mm", timeZone).string(from: updatedAt)
        if calendar.isDate(updatedAt, inSameDayAs: now) {
            return "Обновлено в \(time)"
        }
        return "Обновлено \(Self.formatter("d MMM", timeZone).string(from: updatedAt)) в \(time)"
    }

    private static func formatter(_ format: String, _ timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        return formatter
    }
}

/// Кэш экранов на чтение (`ios-offline-outbox`): «Сегодня», «Дневник»,
/// «Статьи», список переписок, «Клиенты».
///
/// Файл JSON на экран в каталоге пользователя, с классом защиты и без
/// резервной копии. Кэш принадлежит пользователю: чужой не читается, выход
/// стирает всё.
public final class ScreenCache: @unchecked Sendable {
    /// Сколько ответов держится на аккаунт: день дневника, статья и переписка —
    /// у каждого свой ключ, и без предела каталог рос бы бесконечно.
    public static let defaultLimit = 300

    public let root: URL
    private let limit: Int
    private let lock = NSLock()

    public init(root: URL, limit: Int = ScreenCache.defaultLimit) {
        self.root = root
        self.limit = limit
    }

    public func store(_ data: Data, for key: String, userID: Int64, at date: Date = Date()) throws {
        let record = Record(userID: userID, updatedAt: date, payload: data)
        let encoded = try JSONEncoder().encode(record)
        try lock.withLock {
            try ProtectedFiles.prepareDirectory(directory(userID))
            try ProtectedFiles.write(encoded, to: url(for: key, userID: userID))
            prune(directory(userID))
        }
    }

    public func load(_ key: String, userID: Int64) -> CachedScreen? {
        lock.withLock {
            guard let data = try? Data(contentsOf: url(for: key, userID: userID)),
                  let record = try? JSONDecoder().decode(Record.self, from: data),
                  record.userID == userID else {
                return nil
            }
            return CachedScreen(data: record.payload, updatedAt: record.updatedAt)
        }
    }

    /// Выход: кэш всех аккаунтов на устройстве удаляется.
    public func eraseAll() {
        lock.withLock { _ = try? FileManager.default.removeItem(at: root) }
    }

    func url(for key: String, userID: Int64) -> URL {
        directory(userID).appendingPathComponent("\(Self.fileName(key)).json")
    }

    /// Имя файла по ключу без совпадений: латиница и цифры — как есть,
    /// остальное — `_` и код символа. Длинный ключ — с хэшем вместо хвоста.
    static func fileName(_ key: String) -> String {
        var name = ""
        for scalar in key.unicodeScalars {
            let ascii = scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar))
            name += ascii ? String(scalar) : "_" + String(scalar.value, radix: 16) + "_"
        }
        guard name.count > 180 else { return name }
        // FNV-1a: имя файла, а не защита; хвост ключа различает дни и статьи.
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in key.utf8 {
            hash = (hash ^ UInt64(byte)) &* 0x100000001b3
        }
        return String(name.prefix(160)) + "_" + String(hash, radix: 16)
    }

    /// Старейшие ответы сверх предела удаляются.
    private func prune(_ directory: URL) {
        let keys: [URLResourceKey] = [.contentModificationDateKey]
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: keys),
              files.count > limit else { return }
        let dated = files.map { url in
            (url, (try? url.resourceValues(forKeys: Set(keys)))?.contentModificationDate ?? .distantPast)
        }
        for (url, _) in dated.sorted(by: { $0.1 < $1.1 }).prefix(files.count - limit) {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private func directory(_ userID: Int64) -> URL {
        root.appendingPathComponent(String(userID), isDirectory: true)
    }

    private struct Record: Codable {
        let userID: Int64
        let updatedAt: Date
        let payload: Data
    }
}

/// Снимок дня для виджетов в общем контейнере. Пишет приложение, читает
/// расширение; выход стирает.
public final class DaySnapshotStore: @unchecked Sendable {
    public let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func save(_ data: Data) throws {
        try ProtectedFiles.write(data, to: url)
    }

    public func load() -> Data? {
        try? Data(contentsOf: url)
    }

    public func erase() {
        try? FileManager.default.removeItem(at: url)
    }
}
