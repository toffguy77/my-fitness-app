import Foundation
import Sentry

/// Отчёты о сбоях в Sentry.
///
/// Только то, что нужно для разбора сбоя: стек, версия и сборка, устройство,
/// числовой ID и роль пользователя. Ни почты, ни имени, ни текстов переписки,
/// ни данных о питании и здоровье — запросы и ответы API из отчётов вырезаются.
enum Telemetry {
    static func start() {
        let info = Bundle.main.infoDictionary ?? [:]
        guard let dsn = info["SentryDSN"] as? String, !dsn.isEmpty,
              !Demo.isActive,
              // В юнит-тестах приложение-хозяин тоже запускается.
              ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else {
            return
        }
        let version = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = info["SentryEnvironment"] as? String ?? "production"
            options.releaseName = "team.burcev.app@\(version)+\(build)"
            options.sendDefaultPii = false
            options.enableAppHangTracking = true
            options.tracesSampleRate = 0.1
            // Сетевые запросы Sentry собирает сам с полным адресом — вместе
            // с параметрами: поисковой строкой с едой, датами. Не нужно.
            options.enableNetworkTracking = false
            options.enableCaptureFailedRequests = false
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            options.beforeSend = { event in
                event.request = nil
                return event
            }
            // В хлебных крошках остаются только путь и статус запроса —
            // без адресов с параметрами, где бывают даты и токены.
            options.beforeBreadcrumb = { crumb in
                if crumb.category == "http", var data = crumb.data {
                    if let url = data["url"] as? String, let parts = URLComponents(string: url) {
                        data["url"] = parts.path
                    }
                    crumb.data = data
                }
                return crumb
            }
        }
    }

    static func identify(_ user: SessionUser?) {
        guard SentrySDK.isEnabled else { return }
        guard let user else {
            SentrySDK.setUser(nil)
            return
        }
        let sentryUser = User(userId: String(user.id))
        sentryUser.data = ["role": user.role.rawValue]
        SentrySDK.setUser(sentryUser)
    }

    /// Ответ API не совпал с моделью приложения — расхождение контракта,
    /// которое в выпущенной сборке иначе видно только по жалобам.
    static func contractMismatch(path: String, detail: String) {
        guard SentrySDK.isEnabled else { return }
        let route = route(path)
        SentrySDK.capture(message: "API contract mismatch: \(route)") { scope in
            scope.setTag(value: route, key: "api.route")
            scope.setExtra(value: String(detail.prefix(300)), key: "decoding")
        }
    }

    /// Путь без идентификаторов: ID клиентов и переписок, даты, штрихкоды —
    /// это данные человека, а не адрес эндпоинта.
    static func route(_ path: String) -> String {
        path.split(separator: "/", omittingEmptySubsequences: false).map { segment -> String in
            let s = String(segment)
            if s.wholeMatch(of: /\d{4}-\d{2}-\d{2}/) != nil { return "{date}" }
            if s.wholeMatch(of: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/) != nil { return "{id}" }
            if s.wholeMatch(of: /\d+/) != nil { return s.count >= 8 ? "{code}" : "{id}" }
            if s.hasPrefix("ai-") { return "{id}" }
            return s
        }.joined(separator: "/")
    }

    /// Ошибка декодирования без значений из ответа: только вид и путь ключей.
    /// Описание DecodingError может содержать сами данные («invalid value …»).
    static func describe(_ error: Error) -> String {
        guard let error = error as? DecodingError else { return "\(type(of: error))" }
        func keys(_ context: DecodingError.Context) -> String {
            context.codingPath.map { $0.intValue.map { "[\($0)]" } ?? $0.stringValue }.joined(separator: ".")
        }
        switch error {
        case let .keyNotFound(key, context): return "keyNotFound \(key.stringValue) at \(keys(context))"
        case let .typeMismatch(type, context): return "typeMismatch \(type) at \(keys(context))"
        case let .valueNotFound(type, context): return "valueNotFound \(type) at \(keys(context))"
        case let .dataCorrupted(context): return "dataCorrupted at \(keys(context))"
        @unknown default: return "unknown"
        }
    }
}
