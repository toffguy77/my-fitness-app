import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Настройки, которые задаёт сборка (project.yml → Info.plist), а не код.
struct AppEnvironment: Sendable {
    /// `dev` или `prod`.
    let name: String
    let apiBaseURL: URL
    let appGroupID: String?
    let keychainAccessGroup: String?
    let bundleID: String
    let version: String
    let build: String

    static func current(_ bundle: Bundle = .main) -> AppEnvironment {
        let info = bundle.infoDictionary ?? [:]
        guard let raw = info["APIBaseURL"] as? String, let url = URL(string: raw), url.scheme == "https" else {
            // Без адреса приложению некуда ходить — это ошибка сборки.
            fatalError("APIBaseURL не задан в Info.plist")
        }
        let group = (info["KeychainAccessGroup"] as? String).flatMap { value -> String? in
            // Без команды (AppIdentifierPrefix пуст) группа недействительна —
            // тогда группа Keychain по умолчанию.
            value.isEmpty || value.hasPrefix(".") ? nil : value
        }
        return AppEnvironment(
            name: info["AppEnvironment"] as? String ?? "prod",
            apiBaseURL: url,
            appGroupID: info["AppGroupID"] as? String,
            keychainAccessGroup: group,
            bundleID: bundle.bundleIdentifier ?? "team.burcev.app",
            version: info["CFBundleShortVersionString"] as? String ?? "0",
            build: info["CFBundleVersion"] as? String ?? "0"
        )
    }

    /// Заголовок `X-Client`: по нему сервер видит, какие сборки куда ходят.
    var clientHeader: String { "ios/\(version)/\(build)" }

    var isDev: Bool { name == "dev" }

    var siteURL: URL {
        var components = URLComponents(url: apiBaseURL, resolvingAgainstBaseURL: false)
        components?.path = ""
        return components?.url ?? apiBaseURL
    }

    /// Идентификатор фоновой досылки очереди (BGTaskSchedulerPermittedIdentifiers).
    var outboxTaskID: String { "\(bundleID).outbox" }

    @MainActor
    static var deviceName: String {
        #if canImport(UIKit)
        UIDevice.current.name
        #else
        "iPhone"
        #endif
    }
}
