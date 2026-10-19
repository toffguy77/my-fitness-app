import Foundation
import Outbox
import Surfaces

extension DaySnapshot {
    /// Снимок для виджетов из того, что показывает «Сегодня»: остаток и
    /// макросы — по тем же правилам, что карточка «Питание»
    /// (`NutritionSummary`), вода — как карточка «Вода».
    ///
    /// `pendingGlasses` — стаканы из виджета, ещё не дошедшие до сервера.
    public init(today: TodaySnapshot, date: String, userID: Int64, timeZone: TimeZone, now: Date, pendingGlasses: Int = 0) {
        let summary = NutritionSummary(day: today.day, plan: today.plan, targets: today.targets)
        let norm = summary.norm
        var nutrition = DaySnapshot.Nutrition(eatenKcal: summary.eaten, goalKcal: norm?.calories)
        if let norm, norm.hasMacroGoals, let protein = norm.protein, let fat = norm.fat, let carbs = norm.carbs {
            nutrition.protein = Macro(eaten: today.day.protein, goal: protein)
            nutrition.fat = Macro(eaten: today.day.fat, goal: fat)
            nutrition.carbs = Macro(eaten: today.day.carbs, goal: carbs)
        }
        let water = today.water.map {
            DaySnapshot.Water(glasses: $0.glasses + pendingGlasses, goal: $0.goal, glassSize: $0.glassSize, enabled: $0.enabled)
        }
        self.init(userID: userID, role: "client", date: date, timeZone: timeZone.identifier, updatedAt: now,
                  nutrition: nutrition, water: water)
    }
}

/// «Сегодня» → снимок в App Group после каждой загрузки и изменения
/// (`ios-widgets`, «Приложение обновляет виджеты после изменений»).
@MainActor
public final class TodaySurfaceSync {
    private let publisher: SnapshotPublisher
    private let outbox: Outbox?
    private let userID: Int64
    private let timeZone: TimeZone
    private let now: @Sendable () -> Date
    private var generation = 0
    /// Последняя запись — для тестов: дождаться её.
    public private(set) var lastWrite: Task<Void, Never>?

    public init(publisher: SnapshotPublisher, outbox: Outbox?, userID: Int64, timeZone: TimeZone,
                now: @escaping @Sendable () -> Date = { Date() }) {
        self.publisher = publisher
        self.outbox = outbox
        self.userID = userID
        self.timeZone = timeZone
        self.now = now
    }

    /// Подключает себя к модели: каждое изменение сегодняшнего дня — запись.
    public func attach(_ model: TodayModel) {
        publisher.activate(userID: userID)
        model.onDayChanged = { [weak self] snapshot, date in self?.update(snapshot, date: date) }
    }

    public func update(_ today: TodaySnapshot, date: String) {
        generation += 1
        let started = generation
        let outbox = outbox
        let userID = userID
        lastWrite = Task { [weak self] in
            let pending = (try? await outbox?.pending()) ?? []
            guard let self, started == self.generation else { return }
            let glasses = PendingWater.glasses(in: pending, userID: userID, date: date)
            self.publisher.publish(DaySnapshot(today: today, date: date, userID: userID, timeZone: self.timeZone,
                                               now: self.now(), pendingGlasses: glasses))
        }
    }
}
