import Foundation

/// Версия `MAJOR.MINOR.PATCH`; недостающие части — нули.
public struct AppVersion: Comparable, Sendable, CustomStringConvertible {
    public let parts: [Int]

    public init?(_ string: String) {
        let pieces = string.trimmingCharacters(in: .whitespaces).split(separator: ".", omittingEmptySubsequences: false)
        guard (1...3).contains(pieces.count) else { return nil }
        var parts: [Int] = []
        for piece in pieces {
            guard let value = Int(piece), value >= 0 else { return nil }
            parts.append(value)
        }
        self.parts = parts + Array(repeating: 0, count: 3 - parts.count)
    }

    public static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        lhs.parts.lexicographicallyPrecedes(rhs.parts)
    }

    public static func == (lhs: AppVersion, rhs: AppVersion) -> Bool { lhs.parts == rhs.parts }

    public var description: String { parts.map(String.init).joined(separator: ".") }
}

/// Тело `GET /api/v1/config`.
public struct ClientConfig: Codable, Sendable, Equatable {
    public struct IOS: Codable, Sendable, Equatable {
        public let minSupportedVersion: String

        public init(minSupportedVersion: String) { self.minSupportedVersion = minSupportedVersion }

        enum CodingKeys: String, CodingKey { case minSupportedVersion = "min_supported_version" }
    }

    public struct Legal: Codable, Sendable, Equatable {
        public let termsURL: String
        public let privacyURL: String

        enum CodingKeys: String, CodingKey {
            case termsURL = "terms_url"
            case privacyURL = "privacy_url"
        }
    }

    public let features: [String: Bool]
    public let ios: IOS
    public let supportURL: String?
    public let legal: Legal?

    public init(features: [String: Bool] = [:], ios: IOS, supportURL: String? = nil, legal: Legal? = nil) {
        self.features = features
        self.ios = ios
        self.supportURL = supportURL
        self.legal = legal
    }

    enum CodingKeys: String, CodingKey {
        case features, ios, legal
        case supportURL = "support_url"
    }
}

/// Проверка минимальной версии (`ios-role-shell`): ниже минимальной —
/// блокирующий экран; нет конфигурации или она не разобралась — не блокировать.
public enum VersionGate {
    public static func isUpdateRequired(current: String, config: ClientConfig?) -> Bool {
        guard let config,
              let minimum = AppVersion(config.ios.minSupportedVersion),
              let current = AppVersion(current) else {
            return false
        }
        return current < minimum
    }
}

/// Последняя полученная конфигурация: без сети приложение работает с ней.
public protocol ConfigCache: Sendable {
    func load() -> ClientConfig?
    func save(_ config: ClientConfig)
}

public final class FileConfigCache: ConfigCache, @unchecked Sendable {
    private let url: URL

    public init(url: URL) { self.url = url }

    public func load() -> ClientConfig? {
        (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(ClientConfig.self, from: $0) }
    }

    public func save(_ config: ClientConfig) {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(config).write(to: url, options: .atomic)
    }
}

/// Конфигурация: свежая с сервера или последняя сохранённая.
public struct ConfigLoader: Sendable {
    let fetch: @Sendable () async throws -> ClientConfig
    let cache: ConfigCache

    public init(cache: ConfigCache, fetch: @escaping @Sendable () async throws -> ClientConfig) {
        self.fetch = fetch
        self.cache = cache
    }

    public func load() async -> ClientConfig? {
        do {
            let fresh = try await fetch()
            cache.save(fresh)
            return fresh
        } catch {
            return cache.load()
        }
    }
}
