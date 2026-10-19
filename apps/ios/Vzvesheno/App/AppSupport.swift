import API
import Client
import Foundation
import Health
import Outbox
import Session
import Surfaces

/// Всё, что связано с аккаунтом на устройстве, кроме Keychain: стирается при выходе.
struct AccountEraser: AccountDataEraser {
    let cache: ScreenCache
    let outbox: Outbox
    let surfaces: SnapshotPublisher
    let surfaceRoutes: PendingRouteStore
    let health: HealthSync
    let photoWeeks: FilePhotoWeekStore
    let barcodes: BarcodeCache
    let shoppingMarks: FileShoppingMarks
    let timeZones: FileTimeZoneSuggestionStore
    let files: AccountFiles
    let rejections: RejectionLog

    func eraseAccountData() async {
        // Наблюдатели и фоновая доставка Здоровья останавливаются: иначе
        // HealthKit будил бы приложение без сессии.
        await health.erase()
        // Кэш экранов и изображения аккаунта (аватары, фото переписки) —
        // один каталог `Cache/`.
        cache.eraseAll()
        await outbox.eraseAll()
        // Снимок дня и виджеты: «Войдите во Взвешено» сразу, без данных
        // прежнего аккаунта; запоздалая запись «Сегодня» уже не пройдёт.
        surfaces.erase()
        surfaceRoutes.erase()
        photoWeeks.erase()
        barcodes.eraseAll()
        shoppingMarks.erase()
        timeZones.erase()
        // Вложения переписки и архив выгрузки данных.
        files.eraseAll()
        rejections.erase()
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

/// Отметки «куплено» списка покупок — только на устройстве, в каталоге аккаунта.
final class FileShoppingMarks: ShoppingMarksStore, @unchecked Sendable {
    private let url: URL
    private let lock = NSLock()

    init(url: URL) { self.url = url }

    func load() -> Set<String> {
        lock.withLock { (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(Set<String>.self, from: $0) } ?? [] }
    }

    func save(_ marks: Set<String>) {
        lock.withLock {
            if let data = try? JSONEncoder().encode(marks) { try? ProtectedFiles.write(data, to: url) }
        }
    }

    func erase() {
        lock.withLock { _ = try? FileManager.default.removeItem(at: url) }
    }
}

/// Состояние предложения сменить часовой пояс — файл в каталоге аккаунта.
final class FileTimeZoneSuggestionStore: TimeZoneSuggestionStore, @unchecked Sendable {
    private let url: URL
    private let lock = NSLock()

    init(url: URL) { self.url = url }

    func load() -> TimeZoneSuggestion {
        lock.withLock {
            (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(TimeZoneSuggestion.self, from: $0) }
                ?? TimeZoneSuggestion()
        }
    }

    func save(_ state: TimeZoneSuggestion) {
        lock.withLock {
            if let data = try? JSONEncoder().encode(state) { try? ProtectedFiles.write(data, to: url) }
        }
    }

    func erase() {
        lock.withLock { _ = try? FileManager.default.removeItem(at: url) }
    }
}

/// Последний токен APNs — для повторной регистрации и отписки при выходе.
struct UserDefaultsDeviceTokenStore: DeviceTokenStore {
    private static let key = "push.deviceToken"

    func load() -> String? { UserDefaults.standard.string(forKey: Self.key) }

    func save(_ token: String?) { UserDefaults.standard.set(token, forKey: Self.key) }
}
