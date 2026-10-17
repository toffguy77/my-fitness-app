#if canImport(SwiftUI)
import SwiftUI

/// Карточка «Питание»: дуга с остатком калорий, остаток по макросам и запись
/// в одно касание. Образец для справочника и проверки крупного текста.
public struct NutritionCard: View {
    private let energy: EnergySummary
    private let eaten: [Macro: Double]
    private let goal: [Macro: Double]
    private let onSearch: () -> Void
    private let onPhoto: () -> Void
    private let onBarcode: () -> Void

    public init(energy: EnergySummary, eaten: [Macro: Double], goal: [Macro: Double],
                onSearch: @escaping () -> Void = {}, onPhoto: @escaping () -> Void = {}, onBarcode: @escaping () -> Void = {}) {
        self.energy = energy
        self.eaten = eaten
        self.goal = goal
        self.onSearch = onSearch
        self.onPhoto = onPhoto
        self.onBarcode = onBarcode
    }

    public var body: some View {
        DSCard {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                DSCardTitle("Питание")
                DSProgressArc(fraction: energy.fraction, label: energy.accessibilityLabel) {
                    VStack(spacing: 0) {
                        Text(energy.remaining.map { DS.Plural.grouped($0) } ?? DS.Plural.grouped(energy.eaten))
                            .dsText(DS.Typography.numXl)
                            .lineLimit(1)
                            .minimumScaleFactor(0.3)
                            .accessibilityIdentifier("nutrition.remaining")
                        Text(energy.remaining == nil ? "ккал съедено" : "ккал осталось")
                            .dsText(DS.Typography.caption)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(DS.Color.fgMuted)
                    }
                    .foregroundStyle(DS.Color.fgDefault)
                }
                .accessibilityIdentifier("nutrition.arc")
                MacroRemainingView(eaten: eaten, goal: goal)
                QuickAddActions(onSearch: onSearch, onPhoto: onPhoto, onBarcode: onBarcode)
            }
        }
    }
}
#endif
