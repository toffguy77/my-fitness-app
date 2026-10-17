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
    private let root: URL
    private let lock = NSLock()

    public init(root: URL) {
        self.root = root
    }

    public func store(_ data: Data, for key: String, userID: Int64, at date: Date = Date()) throws {
        let record = Record(userID: userID, updatedAt: date, payload: data)
        let encoded = try JSONEncoder().encode(record)
        try lock.withLock {
            try ProtectedFiles.prepareDirectory(directory(userID))
            try ProtectedFiles.write(encoded, to: url(for: key, userID: userID))
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
        let safe = key.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? String($0) : "_" }.joined()
        return directory(userID).appendingPathComponent("\(safe).json")
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
