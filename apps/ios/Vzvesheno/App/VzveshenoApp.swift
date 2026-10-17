import DesignSystem
import SwiftUI

@main
struct VzveshenoApp: App {
    @State private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    private let connectivity = PathConnectivityMonitorBox()

    init() {
        DS.Fonts.register()
        let model = AppModel.live()
        Telemetry.start(environment: model.environment)
        _model = State(initialValue: model)
        // Запуск не ждёт окна: фоновый запуск по событию Здоровья окна не
        // создаёт, а наблюдатели и досылка нужны и ему. Второй вызов из
        // .task ничего не делает.
        Task { await model.start() }
    }

    var body: some Scene {
        let model = model
        let connectivity = connectivity
        return WindowGroup {
            RootView()
                .environment(model)
                .tint(DS.Color.primaryDefault)
                .task { await model.start() }
                .task { await connectivity.watch(model) }
                .onOpenURL { url in Task { await model.open(url) } }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { Task { await model.open(url) } }
                }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                Task { await model.onForeground() }
            case .background:
                model.onBackground()
                OutboxBackgroundTask.schedule(id: model.environment.outboxTaskID)
            default:
                break
            }
        }
        // Досылка очереди в фоне (BGAppRefreshTask): идентификатор — в
        // BGTaskSchedulerPermittedIdentifiers (project.yml).
        .backgroundTask(.appRefresh(model.environment.outboxTaskID)) { [model] in
            await model.drainOutbox()
        }
    }
}
