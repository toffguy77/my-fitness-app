import Client
import Foundation
import Navigation
import Surfaces

// Снимок дня для виджетов и маршруты App Intents (`ios-system-surfaces`).
extension AppModel {
    /// «Сегодня» вошедшего клиента пишет снимок после каждой загрузки и
    /// изменения; публикатор принимает только этот аккаунт.
    func attachSurface(to today: TodayModel) {
        guard let userID = user?.id else { return }
        let sync = TodaySurfaceSync(publisher: surfaces, outbox: outbox, userID: userID, timeZone: profileTimeZone)
        sync.attach(today)
        todaySurface = sync
    }

    /// Куратор, суперадмин и роли только веба: роль (и у куратора — сводка
    /// «Клиентов») без данных дня. Виджет чужой роли покажет «Доступно
    /// клиентам», а не «Войдите».
    func publishStaffSnapshot() {
        guard let user, Role(user.role) != .client else { return }
        surfaces.activate(userID: user.id)
        let now = Date()
        var curatorSummary: DaySnapshot.Curator?
        if let hub = curator?.hub {
            curatorSummary = DaySnapshot.Curator(attentionCount: hub.analytics?.attentionClients ?? 0, unread: hub.unread)
        }
        surfaces.publish(DaySnapshot(userID: user.id, role: user.role,
                                     date: SurfaceCalendar.dayKey(now, in: profileTimeZone),
                                     timeZone: profileTimeZone.identifier, updatedAt: now, curator: curatorSummary))
    }

    /// Экран, который попросил открыть интент или элемент Пункта управления,
    /// пока приложение не было готово.
    func openPendingSurfaceRoute() {
        if let route = surfaceRoutes.take() {
            open(route)
        }
    }

    /// Интент в процессе приложения открывает экран сразу.
    func listenToSurfaceRoutes() {
        SurfaceRouting.handler = { [weak self] route in
            self?.open(route)
        }
    }
}
