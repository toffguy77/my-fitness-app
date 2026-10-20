import Client
import Foundation
import Navigation
import UIKit
import UserNotifications

/// Разрешение iOS на уведомления: система или подделка сценария UI-теста.
protocol NotificationPermissionProvider: Sendable {
    func current() async -> NotificationPermission
    /// Системный запрос (показывается один раз; дальше — только настройки iPhone).
    func request() async -> Bool
}

struct SystemNotificationPermission: NotificationPermissionProvider {
    func current() async -> NotificationPermission {
        let status = await withCheckedContinuation { (continuation: CheckedContinuation<UNAuthorizationStatus, Never>) in
            UNUserNotificationCenter.current().getNotificationSettings { continuation.resume(returning: $0.authorizationStatus) }
        }
        switch status {
        case .authorized: return .authorized
        case .provisional, .ephemeral: return .provisional
        case .denied: return .denied
        default: return .notDetermined
        }
    }

    func request() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }
}

/// Разрешение сценария UI-теста: `-uiTestPushPermission denied|notDetermined|authorized`.
final class FixedNotificationPermission: NotificationPermissionProvider, @unchecked Sendable {
    private let lock = NSLock()
    private var state: NotificationPermission

    init(_ state: NotificationPermission) { self.state = state }

    func current() async -> NotificationPermission { lock.withLock { state } }

    func request() async -> Bool {
        lock.withLock {
            if state == .notDetermined { state = .authorized }
            return state == .authorized
        }
    }
}

/// Делегат уведомлений: категории и действия, нажатие, ответ из пуша.
@MainActor
final class PushCenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushCenter()
    weak var model: AppModel?

    func install() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(Self.categories)
    }

    /// Категории сервера (`ios-push-notifications`) и действия
    /// (`ios-notifications-center`, «Действия в пуше задачи»).
    static var categories: Set<UNNotificationCategory> {
        let complete = UNNotificationAction(identifier: PushAction.complete, title: "Выполнено", options: [.authenticationRequired])
        // Тренировке нужны вид и длительность: «Выполнено» открывает приложение на листе.
        let completeWorkout = UNNotificationAction(identifier: PushAction.complete, title: "Выполнено", options: [.foreground])
        let open = UNNotificationAction(identifier: PushAction.open, title: "Открыть", options: [.foreground])
        let reply = UNTextInputNotificationAction(identifier: PushAction.reply, title: "Ответить", options: [.authenticationRequired],
                                                  textInputButtonTitle: "Отправить", textInputPlaceholder: "Сообщение")
        return [
            UNNotificationCategory(identifier: PushCategory.task.rawValue, actions: [complete, open], intentIdentifiers: []),
            UNNotificationCategory(identifier: PushCategory.taskWorkout.rawValue, actions: [completeWorkout, open], intentIdentifiers: []),
            UNNotificationCategory(identifier: PushCategory.chatMessage.rawValue, actions: [reply], intentIdentifiers: []),
            UNNotificationCategory(identifier: PushCategory.supportEscalated.rawValue, actions: [], intentIdentifiers: []),
        ]
    }

    /// Решение по ответу на пуш: текст поля «Ответить» — из
    /// `UNTextInputNotificationResponse`, остальное — из нагрузки и действия.
    nonisolated static func decision(for response: UNNotificationResponse) -> PushResponse {
        decision(userInfo: response.notification.request.content.userInfo, action: response.actionIdentifier,
                 text: (response as? UNTextInputNotificationResponse)?.userText)
    }

    nonisolated static func decision(userInfo: [AnyHashable: Any], action: String, text: String?) -> PushResponse {
        PushRouting.decide(PushPayload(userInfo: userInfo), action: action, text: text)
    }

    /// Пуш при открытом приложении: баннер, кроме сообщения в открытой переписке.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification)
        async -> UNNotificationPresentationOptions {
        let payload = PushPayload(userInfo: notification.request.content.userInfo)
        let conversation = payload.target.ids["conversation_id"]
        let chatOnScreen = await MainActor.run {
            model?.chat?.isVisible == true
                || (conversation != nil && model?.curator?.visibleConversationID == conversation)
        }
        if payload.category == .chatMessage, chatOnScreen { return [] }
        return [.banner, .list, .sound, .badge]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let decision = Self.decision(for: response)
        let model = await MainActor.run { self.model }
        await model?.handlePush(decision)
    }
}

/// Делегат приложения: токен APNs и тихие пуши со значком.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        PushCenter.shared.install()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard let model = PushCenter.shared.model else { return }
        Task { await model.push.didReceive(token: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Симулятор без APNs, нет связи — не повод что-то показывать.
    }

    /// Тихий пуш (`content-available`): новый счётчик значка и обновление
    /// «Сегодня»; значок из нагрузки система ставит сама.
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any])
        async -> UIBackgroundFetchResult {
        let payload = PushPayload(userInfo: userInfo)
        guard let model = PushCenter.shared.model else { return .noData }
        if let badge = payload.badge { try? await UNUserNotificationCenter.current().setBadgeCount(badge) }
        await model.drainOutbox()
        await model.today?.refresh()
        return .newData
    }
}
