@testable import Client
import Foundation
import TestSupport
import XCTest

/// Те же числа, что у `NutritionBlock` веба, на общих фикстурах ответов API
/// (`docs/ios/fixtures/nutrition-block.json`; веб читает их в
/// `NutritionBlock.fixtures.test.tsx`). Задача 2.1.
final class NutritionFixturesTests: XCTestCase {
    private struct Fixtures: Decodable {
        struct Case: Decodable {
            struct Expected: Decodable {
                let headline: String
                let eaten: Int
                let goal: Int?
                let over: Bool
                let source: String?
                let macros: [String: String]?
            }
            let name: String
            let daily: DailyMetrics
            let weeklyPlan: WeeklyPlanAnswer
            let targets: TargetsAnswer
            let expected: Expected

            enum CodingKeys: String, CodingKey {
                case name, daily, targets, expected
                case weeklyPlan = "weekly_plan"
            }
        }
        let cases: [Case]
    }

    func testEveryFixtureGivesTheWebsNumbers() throws {
        let data = try Data(contentsOf: RepositoryFiles.url("docs/ios/fixtures/nutrition-block.json"))
        let fixtures = try JSONDecoder().decode(Fixtures.self, from: data)
        XCTAssertGreaterThanOrEqual(fixtures.cases.count, 5)
        for fixture in fixtures.cases {
            let summary = NutritionSummary(day: fixture.daily, plan: fixture.weeklyPlan.plan, targets: fixture.targets)
            let expected = fixture.expected
            XCTAssertEqual(summary.headline.replacingOccurrences(of: NumberText.nbsp, with: ""), expected.headline, fixture.name)
            XCTAssertEqual(summary.eaten, expected.eaten, fixture.name)
            XCTAssertEqual(summary.norm?.calories, expected.goal, fixture.name)
            XCTAssertEqual(summary.isOver, expected.over, fixture.name)
            XCTAssertEqual(summary.norm?.source.rawValue, expected.source, fixture.name)
            let macros = summary.macros.map { Dictionary(uniqueKeysWithValues: $0.map { ($0.macro.rawValue, $0.headline) }) }
            XCTAssertEqual(macros, expected.macros, fixture.name)
        }
    }
}
