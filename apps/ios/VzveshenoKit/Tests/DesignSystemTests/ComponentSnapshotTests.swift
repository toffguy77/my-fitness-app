#if canImport(UIKit) && canImport(SwiftUI)
@testable import DesignSystem
import SwiftUI
import UIKit
import XCTest

/// Снапшоты каждого компонента в светлой и тёмной теме (задача 3.2) и
/// карточки «Питание» на крупном тексте (3.1, `ios-design-tokens`).
@MainActor
final class ComponentSnapshotTests: XCTestCase {
    func testEveryComponentInBothThemes() {
        for entry in CatalogueEntry.allCases where entry != .spinner {
            for scheme in [ColorScheme.light, .dark] {
                assertSnapshot(CatalogueSample(entry: entry), named: "\(entry.rawValue)-\(scheme == .light ? "light" : "dark")",
                               colorScheme: scheme)
            }
        }
    }

    /// Сценарий «Крупный текст»: число остатка видно целиком на `.large` и `.accessibility5`.
    func testNutritionCardDynamicType() {
        let card = NutritionCard(energy: CatalogueSamples.energy, eaten: CatalogueSamples.eaten, goal: CatalogueSamples.goal)
        for size in [DynamicTypeSize.large, .accessibility5] {
            for scheme in [ColorScheme.light, .dark] {
                assertSnapshot(card, named: "\(size == .large ? "large" : "ax5")-\(scheme == .light ? "light" : "dark")",
                               colorScheme: scheme, dynamicType: size)
            }
        }
    }

    /// Каждая роль цвета находится в каталоге модуля в обеих темах.
    func testEveryColorRoleResolvesInBothThemes() {
        for role in DS.ColorRole.allCases {
            let color = UIColor(named: role.rawValue, in: DS.bundle, compatibleWith: nil)
            XCTAssertNotNil(color, role.rawValue)
            let light = color?.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
            let dark = color?.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
            XCTAssertNotNil(light)
            XCTAssertNotNil(dark)
        }
        XCTAssertNotEqual(UIColor(named: "BgCanvas", in: DS.bundle, compatibleWith: UITraitCollection(userInterfaceStyle: .light)),
                          UIColor(named: "BgCanvas", in: DS.bundle, compatibleWith: UITraitCollection(userInterfaceStyle: .dark))?
                            .resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark)))
    }

    /// Шрифт бренда растёт с Dynamic Type.
    func testTypographyScalesWithDynamicType() {
        DS.Fonts.register()
        let metrics = UIFontMetrics(forTextStyle: .largeTitle)
        let size = DS.Typography.numXl.size
        let base = metrics.scaledValue(for: size, compatibleWith: UITraitCollection(preferredContentSizeCategory: .large))
        let huge = metrics.scaledValue(for: size,
                                       compatibleWith: UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge))
        XCTAssertGreaterThan(huge, base)
        XCTAssertEqual(DS.TextStyleRole.largeTitle.textStyle, .largeTitle)
    }
}
#endif
