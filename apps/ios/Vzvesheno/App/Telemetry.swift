import Foundation
import Sentry

/// Отчёты о сбоях в Sentry — и только они (решение 2026-10-17).
///
/// Ни трассировки, ни сетевых крошек, ни снимков экрана: стек, версия,
/// устройство, числовой id и роль. Аналитика — только собственные события
/// (`POST /api/v1/public/analytics/events`), запроса ATT нет.
enum Telemetry {
    static func start(environment: AppEnvironment) {
        let info = Bundle.main.infoDictionary ?? [:]
        guard let dsn = info["SentryDSN"] as? String, !dsn.isEmpty,
              ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil,
              !ProcessInfo.processInfo.arguments.contains("-uiTestScenario") else {
            return
        }
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = info["SentryEnvironment"] as? String ?? "production"
            options.releaseName = "\(environment.bundleID)@\(environment.version)+\(environment.build)"
            options.sendDefaultPii = false
            options.tracesSampleRate = 0
            options.enableAutoPerformanceTracing = false
            options.enableNetworkTracking = false
            options.enableNetworkBreadcrumbs = false
            options.enableCaptureFailedRequests = false
            options.enableAppHangTracking = false
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            options.enableUserInteractionTracing = false
            options.beforeSend = { event in
                event.request = nil
                return event
            }
        }
    }

    static func identify(id: Int64?, role: String?) {
        guard SentrySDK.isEnabled else { return }
        guard let id else {
            SentrySDK.setUser(nil)
            return
        }
        let user = User(userId: String(id))
        user.data = ["role": role ?? ""]
        SentrySDK.setUser(user)
    }
}
