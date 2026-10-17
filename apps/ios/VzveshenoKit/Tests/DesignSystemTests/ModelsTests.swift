@testable import DesignSystem
import Foundation
import TestSupport
import XCTest

final class MacroRemainingTests: XCTestCase {
    // «91 из 140 г → 49 г осталось».
    func testRemainingGrams() {
        let value = MacroRemainingValue(macro: .protein, eaten: 91, goal: 140)
        XCTAssertEqual(value.state, .left)
        XCTAssertEqual(value.headline, "49")
        XCTAssertEqual(value.caption, "осталось")
        XCTAssertEqual(value.ofGoal, "91 из 140 г")
        XCTAssertEqual(value.accessibilityLabel, "Белки: осталось 49 г, съедено 91 из 140 г")
    }

    // «Превышение со знаком +» — словом и знаком, полоса не дальше 100%.
    func testOverIsSignedNotRecoloured() {
        let value = MacroRemainingValue(macro: .fat, eaten: 70, goal: 58)
        XCTAssertEqual(value.state, .over)
        XCTAssertEqual(value.headline, "+12")
        XCTAssertEqual(value.caption, "сверх нормы")
        XCTAssertEqual(value.fraction, 1)
        XCTAssertEqual(value.accessibilityLabel, "Жиры: сверх нормы на 12 г, съедено 70 из 58 г")
    }

    // Без нормы — без доли.
    func testNoGoalShowsEatenOnly() {
        for goal in [nil, 0.0] {
            let value = MacroRemainingValue(macro: .carbs, eaten: 120.4, goal: goal)
            XCTAssertEqual(value.state, .noGoal)
            XCTAssertEqual(value.headline, "120")
            XCTAssertEqual(value.caption, "съедено")
            XCTAssertNil(value.ofGoal)
            XCTAssertEqual(value.fraction, 0)
        }
    }

    func testMacroColourRolesExistInTokens() {
        for macro in Macro.allCases {
            XCTAssertTrue(DS.ColorRole.allCases.contains(macro.fillRole))
            XCTAssertTrue(DS.ColorRole.allCases.contains(macro.textRole))
        }
    }
}

final class WeekDotsTests: XCTestCase {
    func testSummaryIgnoresTodayAndMissing() {
        let summary = WeekSummary.count(CatalogueSamples.week)
        XCTAssertEqual(summary.inside, 3)
        XCTAssertEqual(summary.total, 5)
    }

    func testDayStates() {
        XCTAssertEqual(WeekDay(date: "d", label: "Пт", deviation: 0.18).accessibilityLabel, "Пт: выше нормы на 18%")
        XCTAssertEqual(WeekDay(date: "d", label: "Вт", deviation: -0.12).stateText(), "ниже нормы на 12%")
        XCTAssertEqual(WeekDay(date: "d", label: "Ср", deviation: 0.04).stateText(), "в пределах нормы")
        XCTAssertEqual(WeekDay(date: "d", label: "Чт", deviation: nil).stateText(), "нет данных")
        XCTAssertEqual(WeekDay(date: "d", label: "Вс", deviation: 0.3, isToday: true).stateText(), "сегодня, день ещё идёт")
    }
}

final class EnergySummaryTests: XCTestCase {
    // ios-platform-compliance: «Дуга остатка в VoiceOver».
    func testArcAccessibilityLabel() {
        let label = EnergySummary(eaten: 549, goal: 2_472).accessibilityLabel
        XCTAssertEqual(label.replacingOccurrences(of: "\u{00A0}", with: " ").replacingOccurrences(of: "\u{202F}", with: " "),
                       "Съедено 549 из 2 472 килокалорий")
    }

    func testRemainingAndFraction() {
        let summary = EnergySummary(eaten: 549, goal: 2_472)
        XCTAssertEqual(summary.remaining, 1_923)
        XCTAssertEqual(summary.fraction, 549.0 / 2_472.0, accuracy: 0.0001)
        XCTAssertNil(EnergySummary(eaten: 549, goal: 0).remaining, "без нормы — без доли")
    }
}

final class PluralTests: XCTestCase {
    // Сценарий «1, 2, 5 и 21 день».
    func testWaitingDays() {
        XCTAssertEqual(DS.Plural.format("plural.waiting_days %lld", 1), "ждёт 1 день")
        XCTAssertEqual(DS.Plural.format("plural.waiting_days %lld", 2), "ждёт 2 дня")
        XCTAssertEqual(DS.Plural.format("plural.waiting_days %lld", 5), "ждёт 5 дней")
        XCTAssertEqual(DS.Plural.format("plural.waiting_days %lld", 21), "ждёт 21 день")
    }

    func testOtherListedStrings() {
        XCTAssertEqual(DS.Plural.format("plural.days %lld", 11), "11 дней")
        XCTAssertEqual(DS.Plural.format("plural.glasses %lld", 3), "3 стакана")
        XCTAssertEqual(DS.Plural.format("plural.add_items %lld", 1), "Добавить 1 позицию")
        XCTAssertEqual(DS.Plural.format("plural.add_items %lld", 14), "Добавить 14 позиций")
        XCTAssertEqual(DS.Plural.format("plural.minutes_ago %lld", 22), "22 мин назад")
        XCTAssertEqual(DS.Plural.format("plural.earlier_days %lld", 3), "Ранее (3 дн.)")
    }

    /// Каждая строка с числом в каталоге — с формами one, few, many, other.
    func testCatalogHasAllRussianForms() throws {
        let catalog = try StringCatalog(relativePath: "apps/ios/VzveshenoKit/Sources/DesignSystem/Plurals.xcstrings")
        let required = ["plural.days %lld", "plural.minutes_ago %lld", "plural.add_items %lld", "plural.glasses %lld",
                        "plural.earlier_days %lld", "plural.waiting_days %lld"]
        for key in required {
            let forms = Set(try XCTUnwrap(catalog.entries[key], key).keys)
            XCTAssertTrue(forms.isSuperset(of: ["one", "few", "many", "other"]), "\(key): \(forms)")
        }
        for key in catalog.keys {
            XCTAssertTrue(Set(catalog.entries[key]?.keys ?? [:].keys).isSuperset(of: ["one", "few", "many", "other"]), key)
        }
    }

    func testCategories() {
        XCTAssertEqual([1, 2, 5, 11, 12, 21, 22, 25, 101, 111].map { DS.Plural.category($0) },
                       ["one", "few", "many", "many", "many", "one", "few", "many", "one", "many"])
    }
}
