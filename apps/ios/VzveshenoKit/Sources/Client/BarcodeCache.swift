import Foundation

/// Найденные по штрихкоду продукты на устройстве — на 90 дней, как в вебе
/// (`ios-food-logging`): повторный скан того же йогурта не ходит в сеть.
/// «Не найдено» не кэшируется: продукт могут завести завтра.
public final class BarcodeCache: @unchecked Sendable {
    public static let lifetime: TimeInterval = 90 * 24 * 60 * 60

    struct Record: Codable {
        let food: FoodItem
        let storedAt: Date
    }

    private let lock = NSLock()
    private let url: URL?
    private let now: @Sendable () -> Date
    private var records: [String: Record]

    /// `url == nil` — только в памяти.
    public init(url: URL?, now: @escaping @Sendable () -> Date = { Date() }) {
        self.url = url
        self.now = now
        if let url, let data = try? Data(contentsOf: url),
           let stored = try? JSONDecoder().decode([String: Record].self, from: data) {
            records = stored
        } else {
            records = [:]
        }
    }

    /// Продукт по коду, если он найден не раньше 90 дней назад.
    public func food(for code: String) -> FoodItem? {
        lock.withLock {
            guard let record = records[code] else { return nil }
            guard now().timeIntervalSince(record.storedAt) < Self.lifetime else {
                records[code] = nil
                return nil
            }
            return record.food
        }
    }

    public func store(_ food: FoodItem, for code: String) {
        lock.withLock {
            records[code] = Record(food: food, storedAt: now())
            // Просроченное не копится.
            let moment = now()
            records = records.filter { moment.timeIntervalSince($0.value.storedAt) < Self.lifetime }
            persist()
        }
    }

    /// Выход из аккаунта.
    public func eraseAll() {
        lock.withLock {
            records = [:]
            if let url { try? FileManager.default.removeItem(at: url) }
        }
    }

    private func persist() {
        guard let url, let data = try? JSONEncoder().encode(records) else { return }
        try? data.write(to: url, options: .atomic)
    }
}

/// Штрихкод из ручного ввода или сканера: 8–14 цифр.
public enum BarcodeInput {
    public static func normalize(_ raw: String) -> String? {
        let digits = raw.filter(\.isASCIIDigit)
        guard digits.count == raw.filter({ !$0.isWhitespace }).count, (8...14).contains(digits.count) else { return nil }
        return digits
    }
}

extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}
