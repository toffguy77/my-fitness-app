import Foundation
import Outbox
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Перезагрузка таймлайнов виджетов. В приложении и расширении —
/// `WidgetCenter`, в тестах — счётчик.
public protocol WidgetReloading: Sendable {
    func reloadAllTimelines()
}

#if canImport(WidgetKit)
public struct WidgetCenterReloader: WidgetReloading {
    public init() {}

    public func reloadAllTimelines() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
#endif

/// Перезагрузки не нужны (тесты, предпросмотр).
public final class CountingReloader: WidgetReloading, @unchecked Sendable {
    private let lock = NSLock()
    private var reloads = 0

    public init() {}

    public var count: Int { lock.withLock { reloads } }

    public func reloadAllTimelines() {
        lock.withLock { reloads += 1 }
    }
}

/// Снимок дня в файле App Group: чтение и запись типом, а не байтами.
public struct SnapshotRepository: Sendable {
    public let store: DaySnapshotStore

    public init(store: DaySnapshotStore) {
        self.store = store
    }

    public init(directory: URL) {
        self.init(store: DaySnapshotStore(url: directory.appendingPathComponent(Self.fileName)))
    }

    /// Имя файла — общее у приложения и расширения.
    public static let fileName = "today-snapshot.json"

    public func load() -> DaySnapshot? {
        store.load().flatMap(DaySnapshot.decode)
    }

    public func save(_ snapshot: DaySnapshot) throws {
        try store.save(try snapshot.encoded())
    }

    public func erase() {
        store.erase()
    }
}

/// Запись снимка приложением: только для вошедшего аккаунта.
///
/// Загрузка «Сегодня», начатая до выхода, может закончиться после него — и
/// записала бы данные прежнего аккаунта в файл, который выход только что
/// стёр. Поэтому записи разрешены только для `activate(userID:)`, а `erase()`
/// под той же блокировкой снимает разрешение: проверка и запись не
/// разделяются ожиданием, как было бы у `await session.user`.
public final class SnapshotPublisher: @unchecked Sendable {
    private let repository: SnapshotRepository
    private let reloader: WidgetReloading
    private let lock = NSLock()
    private var activeUser: Int64?

    public init(repository: SnapshotRepository, reloader: WidgetReloading) {
        self.repository = repository
        self.reloader = reloader
    }

    /// Вошедший аккаунт: его снимки записываются. Снимок другого аккаунта,
    /// оставшийся в файле, стирается сразу.
    public func activate(userID: Int64) {
        let stale: Bool = lock.withLock {
            activeUser = userID
            if let existing = repository.load(), existing.userID != userID {
                repository.erase()
                return true
            }
            return false
        }
        if stale { reloader.reloadAllTimelines() }
    }

    /// Записать снимок и перезагрузить виджеты. `false` — снимок не того
    /// аккаунта (или никто не вошёл), файл не тронут.
    @discardableResult
    public func publish(_ snapshot: DaySnapshot) -> Bool {
        let written: Bool = lock.withLock {
            guard activeUser == snapshot.userID else { return false }
            return (try? repository.save(snapshot)) != nil
        }
        if written { reloader.reloadAllTimelines() }
        return written
    }

    /// Выход и смена аккаунта: снимка нет, виджеты показывают «Войдите».
    public func erase() {
        lock.withLock {
            activeUser = nil
            repository.erase()
        }
        reloader.reloadAllTimelines()
    }

    public var current: DaySnapshot? { repository.load() }
}

/// Стаканы, поставленные в очередь виджетом, Пунктом управления или голосом,
/// но ещё не отправленные: приложение, перезаписывая снимок по данным
/// сервера, прибавляет их, иначе виджет на время показал бы стаканом меньше.
public enum PendingWater {
    /// Вид изменения в очереди у действий без приложения.
    public static let kind = "surface.water"

    public static func glasses(in items: [OutboxItem], userID: Int64, date: String) -> Int {
        items.reduce(0) { total, item in
            guard item.kind == kind, item.userID == userID, let body = item.body,
                  let water = try? JSONDecoder().decode(WaterRequest.self, from: body), water.date == date else {
                return total
            }
            return total + water.glasses
        }
    }
}

/// Тело `POST /api/v1/food-tracker/water`.
public struct WaterRequest: Codable, Equatable, Sendable {
    public let date: String
    public let glasses: Int

    public init(date: String, glasses: Int) {
        self.date = date
        self.glasses = glasses
    }
}
