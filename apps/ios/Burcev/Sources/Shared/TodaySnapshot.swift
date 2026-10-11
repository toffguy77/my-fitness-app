import Foundation
import Security

/// Сводка дня для виджета: съедено и цель, вода. Приложение пишет её после
/// каждой загрузки «Сегодня», виджет читает.
///
/// Лежит в общем элементе Keychain, а не в App Group: группу приложений API
/// App Store Connect создать не позволяет, а общие группы Keychain команды
/// профиль подписи уже разрешает. В сеть виджет не ходит и токенов не видит.
struct TodaySnapshot: Codable, Sendable, Equatable {
    /// Чей это день. Сводку другого аккаунта, вошедшего на этом телефоне,
    /// ни виджет, ни приложение не показывают.
    var userID: Int64
    var day: String
    var calories: Double
    var caloriesTarget: Double?
    var protein: Double
    var fat: Double
    var carbs: Double
    var waterGlasses: Int?
    var waterGoal: Int?
    var updatedAt: Date

    static let accessGroup = "3GWRDGA8B7.team.burcev.shared"
    private static let service = "team.burcev.today"

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        let query = Self.query()
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(insert as CFDictionary, nil)
        }
    }

    static func load() -> TodaySnapshot? {
        var query = query()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return try? JSONDecoder().decode(TodaySnapshot.self, from: data)
    }

    static func clear() {
        SecItemDelete(query() as CFDictionary)
    }

    private static func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "today",
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }

    /// Сводка за вчера и раньше виджету не нужна — показываем пустой день.
    var isToday: Bool {
        day == Self.dayString(Date())
    }

    static func dayString(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}
