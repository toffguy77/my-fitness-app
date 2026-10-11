import Foundation
import UIKit
import UserNotifications

/// Push-уведомления на iPhone через APNs.
///
/// iOS выдаёт токен устройства; приложение отдаёт его серверу
/// (`POST /api/v1/notifications/devices`), и с этого момента уведомления,
/// которые сайт шлёт в браузер, приходят и на телефон — по тем же правилам
/// доставки и с теми же тихими часами.
@MainActor
final class PushRegistrar: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushRegistrar()

    /// Сборка для TestFlight и App Store подписана профилем App Store и
    /// получает токен боевого APNs, сборка из Xcode — песочницы. Токен одной
    /// среды другая отвергает.
    #if DEBUG
    static let environment = "sandbox"
    #else
    static let environment = "production"
    #endif

    private static let tokenKey = "push.deviceToken"
    weak var session: SessionStore?

    /// Ссылка из уведомления, по которому нажали.
    var onOpen: ((String) -> Void)?

    var lastToken: String? {
        get { UserDefaults.standard.string(forKey: Self.tokenKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.tokenKey) }
    }

    /// После входа: спросить разрешение (iOS спросит один раз) и
    /// зарегистрироваться. Отказ — не ошибка: тогда просто без push.
    func enable() async {
        guard !Demo.isActive else { return }
        UNUserNotificationCenter.current().delegate = self
        let granted = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        lastToken = token
        Task { await upload(token) }
    }

    /// Идентификатор установки — случайный, создаётся один раз и живёт в
    /// Keychain. По нему сервер отличает «этот же телефон вошёл в другой
    /// аккаунт» от «кто-то узнал чужой токен».
    static var installationID: String {
        let keychain = Keychain(service: "team.burcev.app.installation")
        if let existing = keychain.read("id") { return existing }
        let fresh = UUID().uuidString.lowercased()
        keychain.write(fresh, for: "id")
        return fresh
    }

    private func upload(_ token: String) async {
        struct Body: Encodable {
            let token: String, environment: String, app_version: String, installation_id: String
        }
        _ = try? await session?.api.send(Endpoint<Empty>.post(
            "/api/v1/notifications/devices",
            body: Body(token: token, environment: Self.environment, app_version: AppConfig.clientHeader,
                       installation_id: Self.installationID)))
    }

    /// При выходе: телефон перестаёт получать уведомления этого аккаунта —
    /// следующий, кто войдёт на нём, не увидит чужих.
    func disable(using api: APIClient) async {
        guard let token = lastToken else { return }
        struct Body: Encodable { let token: String }
        _ = try? await api.send(Endpoint<Empty>.delete("/api/v1/notifications/devices", body: Body(token: token)))
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Уведомление, пришедшее, пока приложение открыто, тоже показываем.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification)
        async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let url = response.notification.request.content.userInfo["url"] as? String
        await MainActor.run {
            if let url, !url.isEmpty { self.onOpen?(url) }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { PushRegistrar.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Симулятор и устройство без связи с APNs — не повод что-то показывать.
    }
}
