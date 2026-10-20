import Foundation
#if canImport(Security)
import Security
#endif

/// Хранилище секретов. В приложении — Keychain, в тестах на Linux — память.
public protocol SecureStore: Sendable {
    func read(_ key: String) throws -> Data?
    func write(_ data: Data, for key: String) throws
    func delete(_ key: String) throws
    /// Удаляет все записи этого хранилища (сброс после переустановки, выход).
    func deleteAll() throws
}

/// Ошибка Keychain с кодом `OSStatus`.
public struct SecureStoreError: Error, Equatable, Sendable {
    public let status: Int32
    public init(status: Int32) { self.status = status }
}

/// Атрибуты записи Keychain — отдельно от вызовов Security, чтобы их можно
/// было проверить и там, где Security нет.
public struct KeychainItemAttributes: Equatable, Sendable {
    public enum Accessibility: String, Sendable {
        /// `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`: доступна фоновой
        /// доставке и расширению после первой разблокировки и не переезжает на
        /// другое устройство ни в резервной копии, ни через iCloud.
        case afterFirstUnlockThisDeviceOnly
    }

    public let service: String
    public let account: String
    public let accessGroup: String?
    public let accessibility: Accessibility
    /// Не синхронизировать через iCloud Keychain.
    public let synchronizable: Bool
}

/// Сессия приложения хранится в Keychain с одной политикой на все записи.
public struct KeychainPolicy: Sendable, Equatable {
    public let service: String
    /// Группа доступа, общая с расширением виджетов: `<TeamID>.team.burcev.app[.dev].shared`.
    public let accessGroup: String?

    public init(service: String, accessGroup: String?) {
        self.service = service
        self.accessGroup = accessGroup
    }

    public func attributes(for account: String) -> KeychainItemAttributes {
        KeychainItemAttributes(service: service, account: account, accessGroup: accessGroup,
                               accessibility: .afterFirstUnlockThisDeviceOnly, synchronizable: false)
    }
}

/// Хранилище в памяти — для тестов и для предпросмотров.
public final class InMemorySecureStore: SecureStore, @unchecked Sendable {
    private let lock = NSLock()
    private var items: [String: Data] = [:]

    public init(_ items: [String: Data] = [:]) {
        self.items = items
    }

    public var keys: [String] { lock.withLock { Array(items.keys) } }

    public func read(_ key: String) throws -> Data? { lock.withLock { items[key] } }
    public func write(_ data: Data, for key: String) throws { lock.withLock { items[key] = data } }
    public func delete(_ key: String) throws { _ = lock.withLock { items.removeValue(forKey: key) } }
    public func deleteAll() throws { lock.withLock { items.removeAll() } }
}

#if canImport(Security)
/// Keychain с политикой `KeychainPolicy`.
public struct KeychainStore: SecureStore {
    public let policy: KeychainPolicy

    public init(policy: KeychainPolicy) {
        self.policy = policy
    }

    /// Словарь запроса Security для записи с этими атрибутами.
    public static func query(_ attributes: KeychainItemAttributes) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: attributes.service,
            kSecAttrAccount as String: attributes.account,
            kSecAttrSynchronizable as String: attributes.synchronizable ? kCFBooleanTrue as Any : kCFBooleanFalse as Any,
        ]
        if let group = attributes.accessGroup {
            query[kSecAttrAccessGroup as String] = group
        }
        return query
    }

    static func accessible(_ value: KeychainItemAttributes.Accessibility) -> CFString {
        switch value {
        case .afterFirstUnlockThisDeviceOnly: return kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        }
    }

    public func read(_ key: String) throws -> Data? {
        var query = Self.query(policy.attributes(for: key))
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw SecureStoreError(status: status) }
        return item as? Data
    }

    public func write(_ data: Data, for key: String) throws {
        let attributes = policy.attributes(for: key)
        let query = Self.query(attributes)
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: Self.accessible(attributes.accessibility),
        ]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert.merge(update) { _, new in new }
            status = SecItemAdd(insert as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw SecureStoreError(status: status) }
    }

    public func delete(_ key: String) throws {
        let status = SecItemDelete(Self.query(policy.attributes(for: key)) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw SecureStoreError(status: status) }
    }

    public func deleteAll() throws {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: policy.service,
        ]
        if let group = policy.accessGroup {
            query[kSecAttrAccessGroup as String] = group
        }
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw SecureStoreError(status: status) }
    }

    /// Атрибуты сохранённой записи, как их видит Keychain, — для теста политики.
    public func storedAttributes(_ key: String) throws -> [String: Any]? {
        var query = Self.query(policy.attributes(for: key))
        query[kSecReturnAttributes as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw SecureStoreError(status: status) }
        return item as? [String: Any]
    }
}
#endif
