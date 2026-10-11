import Foundation

/// Настройки, которые задаёт сборка, а не код.
enum AppConfig {
    /// Адрес API. Debug ходит в dev-стенд, Release — в прод (`project.yml`).
    static let apiBaseURL: URL = {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
              let url = URL(string: raw), url.scheme == "https" else {
            // Без адреса приложению некуда ходить — это ошибка сборки, а не
            // ситуация, которую можно пережить молча.
            fatalError("APIBaseURL не задан в Info.plist")
        }
        return url
    }()

    /// Версия и сборка для заголовка `X-Client` — по ним сервер видит, какие
    /// сборки ещё ходят в какие эндпоинты.
    static let clientHeader: String = {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        return "ios/\(version)/\(build)"
    }()
}
