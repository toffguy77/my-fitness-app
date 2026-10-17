@testable import Client
import XCTest

/// Условия показа блоков «Сегодня» (задача 2.3).
final class TodayBlocksTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)

    private func visibility(today: String, selected: String? = nil, firstWeek: Bool = false, tasks: Bool = false,
                            photo: Bool = false, plan: Bool = true, history: Bool = true) -> TodayVisibility {
        TodayVisibility(selected: selected ?? today, today: today, calendar: calendar, firstWeekActive: firstWeek,
                        hasTasks: tasks, photoUploadedThisWeek: photo, hasPlan: plan, hasHistory: history)
    }

    /// Сценарий «Третий день»: чек-лист есть, недели по калориям и прогресса нет.
    func testThirdDayOfFirstWeek() {
        let state = FirstWeekState(active: true, steps: [.init(key: "profile", done: true), .init(key: "first_meal", done: false)])
        XCTAssertEqual(FirstWeekItem.items(state).map(\.done), [true, false])
        let shown = visibility(today: "2025-10-15", firstWeek: true)
        XCTAssertTrue(shown.firstWeek)
        XCTAssertFalse(shown.weekCalories)
        XCTAssertFalse(shown.progress)
        XCTAssertFalse(shown.plank)
    }

    func testAfterFirstWeekTheLaterBlocksAppear() {
        XCTAssertTrue(FirstWeekItem.items(FirstWeekState(active: false, steps: [.init(key: "profile", done: false)])).isEmpty)
        let shown = visibility(today: "2025-10-15")
        XCTAssertTrue(shown.weekCalories)
        XCTAssertTrue(shown.progress)
        XCTAssertTrue(shown.plank)
        XCTAssertFalse(visibility(today: "2025-10-15", plan: false).plank)
        XCTAssertFalse(visibility(today: "2025-10-15", history: false).weekCalories)
    }

    func testWeekPhotoReminderOnTheWeekendWithoutPhoto() {
        XCTAssertFalse(visibility(today: "2025-10-17").photoReminder, "пятница")
        XCTAssertTrue(visibility(today: "2025-10-18").photoReminder, "суббота")
        XCTAssertTrue(visibility(today: "2025-10-19").photoReminder, "воскресенье")
        XCTAssertFalse(visibility(today: "2025-10-19", photo: true).photoReminder, "фото уже есть")
        XCTAssertFalse(visibility(today: "2025-10-19", selected: "2025-10-10").photoReminder, "прошлая неделя")
    }

    func testWeeklyReportOnlyOnSundayOfTheCurrentWeek() {
        XCTAssertFalse(visibility(today: "2025-10-18").weeklyReport)
        XCTAssertTrue(visibility(today: "2025-10-19").weeklyReport)
        XCTAssertTrue(visibility(today: "2025-10-19", selected: "2025-10-15").weeklyReport)
        XCTAssertFalse(visibility(today: "2025-10-19", selected: "2025-10-11").weeklyReport)
    }

    /// Сценарий «Отчёт без фото»: перечень недостающего, включая фото недели.
    func testReportRefusalListsWhatIsMissing() {
        let problems = WeeklyReportProblems.describe([
            "nutrition logged for only 3 days (minimum 5 required)",
            "weight logged for only 2 days (minimum 5 required)",
            "weekly photo not uploaded",
        ])
        XCTAssertEqual(problems, ["Питание записано 3 дня из 7 — нужно не меньше 5",
                                  "Вес записан 2 дня из 7 — нужно не меньше 5",
                                  "Нет фото недели"])
    }

    func testTaskRowsSayOverdueOrDueDate() {
        let overdue = TaskRow(task: CuratorTask(id: "1", title: "Замерить талию", type: "measurement", dueDate: "2025-10-15T00:00:00Z"),
                              day: "2025-10-17", today: "2025-10-17")
        XCTAssertTrue(overdue.isOverdue)
        XCTAssertEqual(overdue.subtitle, "Замеры · Просрочено")
        let due = TaskRow(task: CuratorTask(id: "2", title: "Силовая", type: "workout", dueDate: "2025-10-19"),
                          day: "2025-10-17", today: "2025-10-17")
        XCTAssertEqual(due.subtitle, "Тренировка · до 19 октября")
        XCTAssertTrue(due.needsWorkout)
        let daily = TaskRow(task: CuratorTask(id: "3", title: "Сфотографировать обед", type: "nutrition", dueDate: "2025-10-30",
                                              recurrence: "daily", completions: ["2025-10-16"]),
                            day: "2025-10-17", today: "2025-10-17")
        XCTAssertEqual(daily.subtitle, "Питание · ежедневно")
        XCTAssertFalse(daily.isDone)
    }

    func testCuratorCardWithoutAccessHasNoPrice() {
        XCTAssertEqual(CuratorSummary(FirstWeekState(active: false, curatorAccess: .init(allowed: false))).state,
                       .noAccess(expired: false))
        let assigned = CuratorSummary(FirstWeekState(active: false, curator: .init(conversationID: "c", name: "Анна", unreadCount: 2,
                                                                                    lastMessage: .init(text: "Привет", fromCurator: true)),
                                                     curatorAccess: .init(allowed: true)))
        XCTAssertEqual(assigned.state, .curator(name: "Анна", lastMessage: "Привет", unread: 2))
        XCTAssertEqual(assigned.initial, "А")
    }
}
