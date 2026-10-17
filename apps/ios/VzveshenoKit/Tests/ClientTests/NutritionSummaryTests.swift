@testable import Client
import XCTest

/// `ios-client-today`, «Остаток — главное число питания» и «Норма — план
/// куратора, иначе расчётная».
final class NutritionSummaryTests: XCTestCase {
    private let nbsp = NumberText.nbsp

    private func day(_ calories: Int, protein: Int = 0, fat: Int = 0, carbs: Int = 0) -> DailyMetrics {
        DailyMetrics(date: "2025-10-17", calories: calories, protein: protein, fat: fat, carbs: carbs)
    }

    func testNormNotExceeded() {
        let summary = NutritionSummary(day: day(549), plan: nil,
                                       targets: TargetsAnswer(targets: CalculatedTargets(calories: 2472, protein: 0, fat: 0, carbs: 0)))
        XCTAssertEqual(summary.headline, "1\(nbsp)923")
        XCTAssertEqual(summary.caption, "ккал осталось · съедено 549 из 2\(nbsp)472")
        XCTAssertFalse(summary.isOver)
    }

    func testOverflowKeepsTheColourAndSaysSo() {
        let summary = NutritionSummary(day: day(2600), plan: nil,
                                       targets: TargetsAnswer(targets: CalculatedTargets(calories: 2472, protein: 0, fat: 0, carbs: 0)))
        XCTAssertEqual(summary.headline, "+128")
        XCTAssertEqual(summary.caption, "ккал сверх нормы · съедено 2\(nbsp)600 из 2\(nbsp)472")
        XCTAssertTrue(summary.isOver)
        XCTAssertEqual(summary.fraction, 1)
    }

    func testNoNormListsWhatIsMissing() {
        let summary = NutritionSummary(day: day(300), plan: nil,
                                       targets: TargetsAnswer(targets: nil, missing: MissingTargetInputs(profile: true, weight: true)))
        XCTAssertNil(summary.norm)
        XCTAssertEqual(summary.missingItems, ["пол, дата рождения и рост", "вес"])
        XCTAssertEqual(summary.headline, "300")
        XCTAssertNil(summary.macros)
        XCTAssertNil(summary.sourceLabel)
    }

    func testActivePlanWinsOverCalculatedNorm() {
        let summary = NutritionSummary(day: day(549), plan: WeeklyPlan(caloriesGoal: 2240, proteinGoal: 140),
                                       targets: TargetsAnswer(targets: CalculatedTargets(calories: 2472, protein: 125, fat: 80, carbs: 230)))
        XCTAssertEqual(summary.norm?.calories, 2240)
        XCTAssertEqual(summary.sourceLabel, "норма куратора")
    }

    func testCalculatedNormSaysSo() {
        let summary = NutritionSummary(day: day(549), plan: nil,
                                       targets: TargetsAnswer(targets: CalculatedTargets(calories: 2472, protein: 125, fat: 80, carbs: 230)))
        XCTAssertEqual(summary.sourceLabel, "рассчитано автоматически")
    }

    func testMacrosOnlyWithAllThreeGoals() {
        let partial = NutritionSummary(day: day(549, protein: 76), plan: WeeklyPlan(caloriesGoal: 2240, proteinGoal: 140), targets: nil)
        XCTAssertNil(partial.macros)
        let full = NutritionSummary(day: day(549, protein: 76, fat: 49, carbs: 18),
                                    plan: WeeklyPlan(caloriesGoal: 2240, proteinGoal: 125, fatGoal: 80, carbsGoal: 230), targets: nil)
        XCTAssertEqual(full.macros?.map(\.headline), ["49", "31", "212"])
    }

    func testNumbersAreWholeWithNonBreakingGroups() {
        XCTAssertEqual(NumberText.grouped(2472), "2\u{00A0}472")
        XCTAssertEqual(NumberText.grouped(10_000), "10\u{00A0}000")
        XCTAssertEqual(NumberText.grouped(1_234_567), "1\u{00A0}234\u{00A0}567")
        XCTAssertEqual(NumberText.grouped(999), "999")
        XCTAssertEqual(NumberText.oneDecimal(78.4), "78,4")
        XCTAssertEqual(NumberText.oneDecimal(78), "78")
        XCTAssertEqual(NumberText.oneDecimal(-0.3), "−0,3")
        // Как Math.round: половина — вверх.
        XCTAssertEqual(NumberText.jsRound(2471.5), 2472)
        XCTAssertEqual(NumberText.jsRound(80.5), 81)
        XCTAssertEqual(NumberText.jsRound(-0.5), 0)
    }
}
