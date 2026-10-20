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
        XCTAssertEqual(DS.Plural.format("plural.of_records %lld", 1), "из 1 записи")
        XCTAssertEqual(DS.Plural.format("plural.of_records %lld", 3), "из 3 записей")
        XCTAssertEqual(DS.Plural.format("plural.of_records %lld", 21), "из 21 записи")
        XCTAssertEqual(DS.Plural.format("plural.years %lld", 41), "41 год")
        XCTAssertEqual(DS.Plural.format("plural.years %lld", 32), "32 года")
        XCTAssertEqual(DS.Plural.format("plural.years %lld", 12), "12 лет")
        XCTAssertEqual(DS.Plural.format("plural.of_clients %lld", 1), "1 клиента")
        XCTAssertEqual(DS.Plural.format("plural.of_clients %lld", 3), "3 клиентов")
        XCTAssertEqual(DS.Plural.format("plural.of_clients %lld", 11), "11 клиентов")
    }

    static let sourceRoots = ["apps/ios/Vzvesheno", "apps/ios/Shared", "apps/ios/VzveshenoWidgets", "apps/ios/VzveshenoKit/Sources"]

    static func sources() throws -> [(path: String, text: String)] {
        let root = RepositoryFiles.root().standardizedFileURL.path + "/"
        var result: [(String, String)] = []
        for folder in sourceRoots {
            guard let walker = FileManager.default.enumerator(at: RepositoryFiles.url(folder), includingPropertiesForKeys: nil) else {
                continue
            }
            for case let url as URL in walker where url.pathExtension == "swift" {
                result.append((String(url.standardizedFileURL.path.dropFirst(root.count)), try String(contentsOf: url, encoding: .utf8)))
            }
        }
        return result
    }

    /// Каждая форма каталога кем-то используется: неиспользуемый ключ — знак,
    /// что рядом собирают склонение руками.
    func testEveryPluralKeyHasACallSite() throws {
        let catalog = try StringCatalog(relativePath: "apps/ios/VzveshenoKit/Sources/DesignSystem/Strings/Plurals.xcstrings")
        let sources = try Self.sources()
        XCTAssertGreaterThan(sources.count, 100, "исходники не нашлись")
        let unused = catalog.keys.filter { key in !sources.contains { $0.text.contains("\"\(key)\"") } }
        XCTAssertEqual(unused.sorted(), [], "ключи каталога без вызова DS.Plural.format")
    }

    /// Склонение выбирает только `DS.Plural`: правила CLDR вручную (`% 10 == 1`,
    /// `mod10`, `11...14`) в исходниках — ручная форма мимо каталога.
    func testNoHandBuiltPluralForms() throws {
        let pattern = try NSRegularExpression(pattern: #"%\s*10\s*==\s*1\b|\bmod10\b|%\s*100\s*!=\s*11|\(1[12]\.\.\.14\)"#)
        var offending: [String] = []
        for (path, text) in try Self.sources() where !path.hasSuffix("DesignSystem/Plural.swift") {
            if pattern.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil { offending.append(path) }
        }
        XCTAssertEqual(offending, [], "склонение руками — используйте DS.Plural.format с ключом каталога")
    }

    /// Каждая строка с числом в каталоге — с формами one, few, many, other.
    func testCatalogHasAllRussianForms() throws {
        let catalog = try StringCatalog(relativePath: "apps/ios/VzveshenoKit/Sources/DesignSystem/Strings/Plurals.xcstrings")
        let required = ["plural.days %lld", "plural.minutes_ago %lld", "plural.add_items %lld", "plural.glasses %lld",
                        "plural.earlier_days %lld", "plural.waiting_days %lld", "plural.of_records %lld", "plural.years %lld",
                        "plural.of_clients %lld"]
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
