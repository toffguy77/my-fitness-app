import Client
import DesignSystem
import SwiftUI
@testable import Vzvesheno
import XCTest

/// Экраны с макетами (`/home/…/mockups`, копия холста «Взвешено · iOS»):
/// SignIn.png, Today.png и TodayDark.png, HealthConnect.png. Данные — те же,
/// что на макетах; системные таббар и аксессуар «Записать еду» не рисуются.
@MainActor
final class ScreenSnapshotTests: XCTestCase {
    func testSignIn() {
        assertScreenSnapshot(
            SignInContent(providers: ["apple", "yandex", "vk"], sessionMessage: nil, email: .constant(""), errorText: nil,
                          working: false),
            named: "light")
    }

    func testToday() {
        let content = TodayContent(state: TodayFixture.state, avatarInitial: "Д")
        for scheme in [ColorScheme.light, .dark] {
            let name = scheme == .light ? "light" : "dark"
            assertScreenSnapshot(ScrollView { content }.scrollDisabled(true), named: name, colorScheme: scheme)
            // Весь экран целиком — блоки ниже сгиба.
            assertScreenSnapshot(content, named: "\(name)-full", colorScheme: scheme, height: nil)
        }
    }

    func testTodayWithoutNorm() {
        assertScreenSnapshot(TodayContent(state: TodayFixture.noNorm, avatarInitial: "Д"), named: "light", height: nil)
    }

    func testHealthConnect() {
        let explainer = HealthExplainer(failed: false, working: false, continueTitle: "health.connect.continue",
                                        notNowTitle: "health.connect.notNow", onContinue: {}, onNotNow: {})
        assertScreenSnapshot(ScrollView { explainer.padding(.horizontal, DS.Space.screenX) }.scrollDisabled(true), named: "light")
    }
}

/// День с макета Today.png: пятница, 17 октября; 549 из 2 472 по норме куратора.
enum TodayFixture {
    static let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)

    static let day = DailyMetrics(date: "2025-10-17", calories: 549, protein: 76, fat: 49, carbs: 18, weight: 78.4, steps: 6412,
                                  workoutCompleted: true, workoutTypes: ["strength"], workoutTypeDurations: ["strength": 45],
                                  workoutDuration: 45, stepsSource: .healthkit, weightSource: .healthkit, workoutSource: .healthkit)

    static let week = [
        DailyMetrics(date: "2025-10-13", calories: 1900, weight: 78.9, steps: 9000),
        DailyMetrics(date: "2025-10-14", calories: 2100, weight: 78.8),
        DailyMetrics(date: "2025-10-15", calories: 2000, weight: 78.6, steps: 7000),
        DailyMetrics(date: "2025-10-16", calories: 1800, steps: 11000),
        DailyMetrics(date: "2025-10-17", calories: 549, weight: 78.4),
    ]

    static let curator = FirstWeekState.Curator(
        conversationID: "c1", name: "Анна", unreadCount: 2,
        lastMessage: .init(text: "Белок держите отлично, добавьте овощей к ужину", fromCurator: true))

    static var snapshot: TodaySnapshot {
        TodaySnapshot(
            day: day,
            week: week,
            plan: WeeklyPlan(caloriesGoal: 2472, proteinGoal: 125, fatGoal: 80, carbsGoal: 230),
            targets: TargetsAnswer(targets: CalculatedTargets(calories: 2472, protein: 125, fat: 80, carbs: 230, workoutBonus: 210)),
            water: WaterDay(glasses: 5, goal: 8, enabled: true),
            tasks: [CuratorTask(id: "t1", title: "Сфотографировать обед", type: "nutrition", dueDate: "2025-10-31", recurrence: "daily")],
            onboarding: FirstWeekState(active: false, curator: curator, curatorAccess: .init(allowed: true)),
            progress: ProgressData(weightTrend: [.init(date: "2025-09-19", weight: 80.1), .init(date: "2025-10-10", weight: 78.7)],
                                   nutritionAdherence: 71),
            history: CalorieHistory(days: [
                .init(date: "2025-10-11", target: 2472, actual: 2300), .init(date: "2025-10-12", target: 2472, actual: 2600),
                .init(date: "2025-10-13", target: 2472, actual: 1900), .init(date: "2025-10-14", target: 2472, actual: 2100),
                .init(date: "2025-10-15", target: 2472, actual: 2000), .init(date: "2025-10-16", target: 2472, actual: 1800),
                .init(date: "2025-10-17", target: 2472, actual: 549),
            ]),
            unread: UnreadCounts(main: 3, content: 0)
        )
    }

    static var state: TodayScreenState {
        TodayScreenState(snapshot: snapshot, selected: "2025-10-17", today: "2025-10-17", calendar: calendar, photoUploaded: true)
    }

    static var noNorm: TodayScreenState {
        var snapshot = snapshot
        snapshot.plan = nil
        snapshot.targets = TargetsAnswer(targets: nil, missing: MissingTargetInputs(profile: true, weight: true))
        snapshot.tasks = []
        snapshot.onboarding = FirstWeekState(active: true,
                                             steps: [.init(key: "profile", done: false), .init(key: "first_meal", done: true)],
                                             curatorAccess: .init(allowed: false))
        return TodayScreenState(snapshot: snapshot, selected: "2025-10-18", today: "2025-10-18", calendar: calendar)
    }
}
