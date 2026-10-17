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

/// Появление сети — досылка очереди и ожидающего выхода.
struct PathConnectivityMonitorBox: Sendable {
    private let monitor = PathConnectivityMonitor()

    @MainActor
    func watch(_ model: AppModel) async {
        var wasOnline = true
        for await online in monitor.updates() {
            if online && !wasOnline {
                await model.onForeground()
            }
            wasOnline = online
        }
    }
}
