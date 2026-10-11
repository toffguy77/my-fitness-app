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
        SentrySDK.capture(message: "API contract mismatch: \(path)") { scope in
            scope.setTag(value: path, key: "api.path")
            scope.setExtra(value: String(detail.prefix(500)), key: "decoding")
        }
    }
}
