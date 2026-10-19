@testable import Client
import XCTest

/// Неделя и карточки дня (`ios-client-today`, задача 2.2).
final class DayCardsTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)

    func testWaterWithoutCuratorGoalHasNoCard() {
        XCTAssertNil(WaterCard(water: WaterDay(glasses: 3, goal: 8, enabled: false)))
        XCTAssertNil(WaterCard(water: nil))
        let card = WaterCard(water: WaterDay(glasses: 5, goal: 8, enabled: true))
        XCTAssertEqual(card?.value, "5")
        XCTAssertEqual(card?.caption, "из 8 стаканов")
        XCTAssertEqual(WaterCard(glasses: 0, goal: 1).caption, "из 1 стакана")
    }

    func testStepsGoalFromPlanElseTenThousand() {
        let day = DailyMetrics(date: "2025-10-17", steps: 6412, stepsSource: .healthkit)
        let fallback = StepsCard(day: day, plan: nil)
        XCTAssertEqual(fallback.goal, 10_000)
        XCTAssertEqual(fallback.caption, "из Здоровья · цель 10\u{00A0}000")
        XCTAssertEqual(StepsCard(day: day, plan: WeeklyPlan(caloriesGoal: 2000, proteinGoal: 100, stepsGoal: 8000)).goal, 8000)
        XCTAssertEqual(StepsCard(day: DailyMetrics(date: "2025-10-17", steps: 100, stepsSource: .manual), plan: nil).caption,
                       "цель 10\u{00A0}000")
    }

    func testWeightShowsLatestAndWeeklyChange() {
        let trend = [ProgressData.Point(date: "2025-10-09", weight: 78.9), ProgressData.Point(date: "2025-10-10", weight: 78.7),
                     ProgressData.Point(date: "2025-10-16", weight: 78.5)]
        let card = WeightCard(day: DailyMetrics(date: "2025-10-17", weight: 78.4, weightSource: .healthkit), trend: trend,
                              selected: "2025-10-17", calendar: calendar)
        XCTAssertEqual(card.value, "78,4")
        XCTAssertEqual(card.changeText, "−0,3 кг за неделю")
        XCTAssertEqual(card.caption, "из Здоровья")
        let noWeightToday = WeightCard(day: DailyMetrics(date: "2025-10-17"), trend: trend, selected: "2025-10-17", calendar: calendar)
        XCTAssertEqual(noWeightToday.value, "78,5")
        XCTAssertNil(noWeightToday.caption)
    }

    func testWorkoutShowsDurationKindAndBonus() {
        let day = DailyMetrics(date: "2025-10-17", workoutCompleted: true, workoutTypes: ["strength"],
                               workoutTypeDurations: ["strength": 45], workoutDuration: 45, workoutSource: .healthkit)
        let card = WorkoutCard(day: day, targets: CalculatedTargets(calories: 2472, protein: 0, fat: 0, carbs: 0, workoutBonus: 210))
        XCTAssertEqual(card.value, "45")
        XCTAssertEqual(card.detail, "Силовая · +210 ккал к норме")
        XCTAssertFalse(WorkoutCard(day: DailyMetrics(date: "2025-10-17"), targets: nil).hasWorkout)
    }

    func testManualInputBounds() {
        XCTAssertEqual(ManualInput.steps("0"), 0)
        XCTAssertEqual(ManualInput.steps("100 000"), 100_000)
        XCTAssertNil(ManualInput.steps("100001"))
        XCTAssertNil(ManualInput.steps("-1"))
        XCTAssertNil(ManualInput.steps("abc"))

        XCTAssertEqual(ManualInput.weight("78,4"), 78.4)
        XCTAssertEqual(ManualInput.weight("0.1"), 0.1)
        XCTAssertEqual(ManualInput.weight("500"), 500)
        XCTAssertNil(ManualInput.weight("0"))
        XCTAssertNil(ManualInput.weight("500.1"))
        XCTAssertNil(ManualInput.weight("78,45"), "один знак после запятой")

        XCTAssertNotNil(ManualInput.workout(kind: "strength", minutes: "1"))
        XCTAssertNotNil(ManualInput.workout(kind: "yoga", minutes: "600"))
        XCTAssertNil(ManualInput.workout(kind: "strength", minutes: "0"))
        XCTAssertNil(ManualInput.workout(kind: "strength", minutes: "601"))
        XCTAssertNil(ManualInput.workout(kind: "chess", minutes: "30"))
        XCTAssertNil(ManualInput.workout(kind: nil, minutes: "30"))
    }

    func testWeekStripBuildsSevenDaysFromDatesNotFromTheAnswer() {
        let metrics = [
            DailyMetrics(date: "2025-10-13T00:00:00Z", calories: 1800, weight: 79, steps: 9000),
            DailyMetrics(date: "2025-10-16T00:00:00Z", calories: 1500, steps: 0, workoutCompleted: true),
        ]
        let days = WeekStrip.days(selected: "2025-10-17", today: "2025-10-17", metrics: metrics, calendar: calendar)
        XCTAssertEqual(days.map(\.day), ["2025-10-13", "2025-10-14", "2025-10-15", "2025-10-16", "2025-10-17", "2025-10-18",
                                         "2025-10-19"])
        XCTAssertEqual(days.map(\.weekday), ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"])
        XCTAssertEqual(days.map(\.number), ["13", "14", "15", "16", "17", "18", "19"])
        XCTAssertEqual([days[0].nutrition, days[0].weight, days[0].activity], [true, true, true])
        XCTAssertEqual([days[3].nutrition, days[3].weight, days[3].activity], [true, false, true])
        XCTAssertEqual([days[1].nutrition, days[1].weight, days[1].activity], [false, false, false])
        XCTAssertTrue(days[4].isSelected && days[4].isToday)
        XCTAssertTrue(days[5].isFuture)
    }

    func testDayTexts() {
        XCTAssertEqual(DayText.full("2025-10-17", calendar: calendar), "пятница, 17 октября")
        XCTAssertEqual(DayText.full("2025-10-15", calendar: calendar), "среда, 15 октября")
        XCTAssertEqual(calendar.weekStart(of: "2025-10-19"), "2025-10-13")
        XCTAssertEqual(calendar.isoWeekday("2025-10-19"), 7)
        XCTAssertEqual(calendar.isoWeekIdentifier("2025-10-17"), "2025-W42")
        XCTAssertEqual(calendar.rfc3339("2025-10-13"), "2025-10-13T00:00:00+03:00")
    }
}
