import API
import Client
import Foundation
import Health
import Outbox
import Session
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Всё, что связано с аккаунтом на устройстве, кроме Keychain: стирается при выходе.
struct AccountEraser: AccountDataEraser {
    let cache: ScreenCache
    let outbox: Outbox
    let snapshot: DaySnapshotStore
    let health: HealthSync
    let photoWeeks: FilePhotoWeekStore

    func eraseAccountData() async {
        // Наблюдатели и фоновая доставка Здоровья останавливаются: иначе
        // HealthKit будил бы приложение без сессии.
        await health.erase()
        cache.eraseAll()
        await outbox.eraseAll()
        snapshot.erase()
        photoWeeks.erase()
        #if canImport(WidgetKit)
        // Виджет не показывает данные прежнего аккаунта ни минуты.
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// Отметки «фото недели загружено» — файл в каталоге аккаунта; выход стирает
/// каталог вместе с кэшем.
final class FilePhotoWeekStore: PhotoWeekStore, @unchecked Sendable {
    private let url: URL
    private let lock = NSLock()

    init(url: URL) { self.url = url }

    func contains(_ week: String, userID: Int64) -> Bool {
        lock.withLock { load().contains("\(userID):\(week)") }
    }

    func insert(_ week: String, userID: Int64) {
        lock.withLock {
            var weeks = load()
            weeks.insert("\(userID):\(week)")
            if let data = try? JSONEncoder().encode(weeks) { try? ProtectedFiles.write(data, to: url) }
        }
    }

    func erase() {
        lock.withLock { _ = try? FileManager.default.removeItem(at: url) }
    }

    private func load() -> Set<String> {
        (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(Set<String>.self, from: $0) } ?? []
    }
}

/// Ссылка на сессию для Здоровья: кто вошёл сейчас.
final class SessionRef: @unchecked Sendable {
    private let lock = NSLock()
    private weak var _store: SessionStore?

    var store: SessionStore? {
        get { lock.withLock { _store } }
        set { lock.withLock { _store = newValue } }
    }
}
