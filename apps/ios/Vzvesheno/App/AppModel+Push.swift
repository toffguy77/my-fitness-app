import API
import Client
import Foundation
import Navigation
import UIKit
import UserNotifications

// Пуши, значок, разрешение на уведомления и часовой пояс устройства
// (`ios-notifications-center`, `ios-client-settings`, `ios-push-notifications`).
extension AppModel {
    /// Передний план с сессией: разрешение, регистрация токена (тихие пуши
    /// со значком работают и без разрешения на баннеры), значок.
    func refreshPushState() async {
        notificationPermission = await permissions.current()
        guard user != nil, case .shell = launch else { return }
        if notificationPermission == .notDetermined, !isUITest, !preferences.bool(forKey: "push.asked") {
            // Один раз после входа — системный запрос; дальше — «Разрешить» в настройках.
            preferences.set(true, forKey: "push.asked")
            _ = await permissions.request()
            notificationPermission = await permissions.current()
        }
        if !isUITest { UIApplication.shared.registerForRemoteNotifications() }
        await push.register()
        await refreshBadge()
    }

    /// «Разрешить» в настройках уведомлений.
    func requestNotificationPermission() async {
        _ = await permissions.request()
        notificationPermission = await permissions.current()
        if notificationPermission == .authorized, !isUITest { UIApplication.shared.registerForRemoteNotifications() }
    }

    /// Значок: непрочитанные «Основные» и сообщения чата.
    func refreshBadge() async {
        struct ChatUnread: Decodable, Sendable { let count: Int }
        let unread: UnreadCounts? = try? await api.send(.get("/api/v1/notifications/unread-counts"))
        let chat: ChatUnread? = try? await api.send(.get("/api/v1/conversations/unread"))
        let count = Badge.count(unread: unread, chatUnread: chat?.count ?? 0)
        try? await UNUserNotificationCenter.current().setBadgeCount(count)
    }

    /// Ответ на действие с пушем.
    func handlePush(_ response: PushResponse) async {
        // Нажатие на пуш может разбудить приложение раньше восстановления сессии.
        await ensureRestored()
        switch response {
        case let .open(link):
            open(link)
        case .completeTask, .reply:
            // Без открытия приложения: очередь с Idempotency-Key.
            let performer = PushActionPerformer(outbox: outbox) { [session] in
                if let id = await session.user?.id { return id }
                return await session.restore()?.id
            }
            await performer.perform(response)
            await today?.refresh()
            // Ответ куратора из пуша — в открытой переписке сразу.
            try? await curator?.openConversation?.loadLatest()
            await curator?.chats?.load()
        case let .openWorkoutSheet(taskID):
            open(.dashboard(task: taskID))
            workoutSheetTask = taskID
        case .ignore:
            break
        }
    }

    // MARK: Часовой пояс

    /// Пояс устройства отличается от профиля больше суток — однократный вопрос.
    func checkTimeZone(device: TimeZone = .current, now: Date = Date()) {
        guard user != nil else { return }
        let result = timeZones.load().evaluate(profile: profileTimeZone.identifier, device: device.identifier, now: now)
        timeZones.save(result.state)
        if let zone = result.suggest { timeZoneOffer = zone }
    }

    /// «Сменить» или «Оставить».
    func answerTimeZoneOffer(change: Bool) async {
        guard let zone = timeZoneOffer else { return }
        timeZoneOffer = nil
        timeZones.save(timeZones.load().answering(zone))
        guard change else { return }
        try? await ProfileService(api: api).saveSettings(["timezone": .string(zone)])
        await refreshProfile()
    }

    var isUITest: Bool {
        #if DEBUG
        return UITestScenario.current != nil
        #else
        return false
        #endif
    }
}
