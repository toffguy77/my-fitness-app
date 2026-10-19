import BackgroundTasks
import Foundation
import Outbox

/// Фоновая досылка очереди.
enum OutboxBackgroundTask {
    static func schedule(id: String) {
        let request = BGAppRefreshTaskRequest(identifier: id)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}

/// Сеть: пропала — плашка «Нет подключения» сразу, а не после первого
/// неудачного запроса; появилась — досылка очереди, отложенного выхода и
/// обновление экранов (`onForeground`).
struct PathConnectivityMonitorBox: Sendable {
    private let monitor = PathConnectivityMonitor()

    @MainActor
    func watch(_ model: AppModel) async {
        var edges = ConnectivityEdges()
        for await online in monitor.updates() {
            switch edges.next(online) {
            case .lost:
                model.networkChanged(available: false)
            case .restored:
                model.networkChanged(available: true)
                await model.onForeground()
            case nil:
                break
            }
        }
    }
}
