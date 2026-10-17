import Foundation

/// Всё, что рисует экран «Сегодня», — из снимка дня, без сети и часов.
/// Его же собирают снапшот-тесты экрана на данных макета.
public struct TodayScreenState: Sendable, Equatable {
    public let snapshot: TodaySnapshot?
    public let selected: String
    public let today: String
    public let calendar: DayCalendar
    public let photoUploaded: Bool

    public init(snapshot: TodaySnapshot?, selected: String, today: String, calendar: DayCalendar, photoUploaded: Bool = false) {
        self.snapshot = snapshot
        self.selected = selected
        self.today = today
        self.calendar = calendar
        self.photoUploaded = photoUploaded
    }

    /// «Сегодня» или дата выбранного дня.
    public var title: String { selected == today ? "Сегодня" : DayText.dayMonth(selected) }
    /// «пятница, 17 октября».
    public var subtitle: String { DayText.full(selected, calendar: calendar) }

    public var nutrition: NutritionSummary? {
        snapshot.map { NutritionSummary(day: $0.day, plan: $0.plan, targets: $0.targets) }
    }

    public var weekStrip: [WeekStripDay] {
        WeekStrip.days(selected: selected, today: today, metrics: snapshot?.week ?? [], calendar: calendar)
    }

    public var curator: CuratorSummary { CuratorSummary(snapshot?.onboarding) }

    public var steps: StepsCard? { snapshot.map { StepsCard(day: $0.day, plan: $0.plan) } }
    public var water: WaterCard? { WaterCard(water: snapshot?.water) }

    public var weight: WeightCard? {
        snapshot.map { WeightCard(day: $0.day, trend: $0.progress?.weightTrend ?? [], selected: selected, calendar: calendar) }
    }

    public var workout: WorkoutCard? { snapshot.map { WorkoutCard(day: $0.day, targets: $0.targets?.targets) } }

    public var tasks: [TaskRow] {
        (snapshot?.tasks ?? []).map { TaskRow(task: $0, day: selected, today: today) }
    }

    public var firstWeek: [FirstWeekItem] { FirstWeekItem.items(snapshot?.onboarding) }

    public var calorieBars: [CalorieBar] { CalorieBar.bars(snapshot?.history, calendar: calendar) }

    public var unreadCount: Int { snapshot?.unread?.total ?? 0 }

    public var visibility: TodayVisibility {
        TodayVisibility(selected: selected, today: today, calendar: calendar,
                        firstWeekActive: snapshot?.onboarding?.active ?? false,
                        hasTasks: !(snapshot?.tasks.isEmpty ?? true),
                        photoUploadedThisWeek: photoUploaded,
                        hasPlan: snapshot?.plan != nil,
                        hasHistory: CalorieBar.hasData(snapshot?.history))
    }

    /// Прогресс за 4 недели: изменение веса и доля дней в норме.
    public var progressSummary: (weightChange: String?, adherence: String)? {
        guard let progress = snapshot?.progress else { return nil }
        let points = progress.weightTrend.sorted { $0.date < $1.date }
        var change: String?
        if let first = points.first, let last = points.last, points.count > 1 {
            let delta = ((last.weight - first.weight) * 10).rounded() / 10
            change = (delta > 0 ? "+" : "") + NumberText.oneDecimal(delta) + " кг"
        }
        return (change, "\(NumberText.jsRound(progress.nutritionAdherence)) %")
    }

    public static func == (lhs: TodayScreenState, rhs: TodayScreenState) -> Bool {
        lhs.snapshot == rhs.snapshot && lhs.selected == rhs.selected && lhs.today == rhs.today
            && lhs.calendar == rhs.calendar && lhs.photoUploaded == rhs.photoUploaded
    }
}
