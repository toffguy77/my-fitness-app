import Foundation

/// Файлы с данными о здоровье и питании: кэш экранов, очередь изменений,
/// снимок дня (`ios-platform-compliance`).
///
/// Класс защиты `completeUntilFirstUserAuthentication` — файл доступен фоновой
/// досылке и расширению после первой разблокировки; `isExcludedFromBackup` —
/// не уезжает в iCloud.
public enum ProtectedFiles {
    /// Атрибуты файла, как их видит система.
    public struct Attributes: Equatable, Sendable {
        /// `FileProtectionType.rawValue` или `nil`, где защиты нет (Linux, macOS).
        public let protection: String?
        public let excludedFromBackup: Bool?
    }

    /// Имя класса защиты, которого требуют спеки.
    public static let requiredProtection = "NSFileProtectionCompleteUntilFirstUserAuthentication"

    /// Каталог для файлов аккаунта: общий контейнер App Group, иначе
    /// Application Support (тесты, предпросмотр).
    public static func directory(appGroup: String?, fileManager: FileManager = .default) -> URL {
        #if canImport(Darwin)
        if let appGroup, !appGroup.isEmpty,
           let container = fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
            return container.appendingPathComponent("Library/Application Support/Vzvesheno", isDirectory: true)
        }
        #endif
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        return base.appendingPathComponent("Vzvesheno", isDirectory: true)
    }

    /// Создаёт каталог с той же защитой: новые файлы в нём её наследуют.
    public static func prepareDirectory(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: protectionAttributes)
        try apply(to: url)
    }

    /// Ставит класс защиты и исключение из резервной копии.
    public static func apply(to url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        if !protectionAttributes.isEmpty {
            try FileManager.default.setAttributes(protectionAttributes, ofItemAtPath: url.path)
        }
        #if canImport(Darwin)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutable = url
        try mutable.setResourceValues(values)
        #endif
    }

    /// Пишет данные атомарно и сразу защищает файл.
    public static func write(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true,
                                                attributes: protectionAttributes)
        #if os(iOS) || os(watchOS) || os(tvOS) || os(visionOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
        try apply(to: url)
    }

    /// Атрибуты, с которыми создаются файлы и каталоги аккаунта.
    public static var requestedAttributes: [FileAttributeKey: Any] { protectionAttributes }

    /// Хранит ли файловая система класс защиты. Симулятор его не хранит —
    /// там проверяется, что класс запрошен, а на устройстве — что он стоит.
    public static var platformKeepsProtectionClass: Bool {
        #if os(iOS) && !targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    public static func attributes(of url: URL) -> Attributes {
        let protection = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.protectionKey]
            .flatMap { ($0 as? FileProtectionType)?.rawValue ?? ($0 as? String) }
        #if canImport(Darwin)
        let excluded = (try? url.resourceValues(forKeys: [.isExcludedFromBackupKey]))?.isExcludedFromBackup
        #else
        let excluded: Bool? = nil
        #endif
        return Attributes(protection: protection, excludedFromBackup: excluded)
    }

    private static var protectionAttributes: [FileAttributeKey: Any] {
        #if os(iOS) || os(watchOS) || os(tvOS) || os(visionOS)
        return [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        #else
        return [:]
        #endif
    }
}
