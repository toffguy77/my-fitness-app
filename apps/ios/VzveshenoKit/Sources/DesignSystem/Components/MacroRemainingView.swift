#if canImport(SwiftUI)
import SwiftUI

/// Остаток по Б/Ж/У в граммах. `plain` — внутри карточки, `tiles` — плитками
/// на фоне экрана.
public struct MacroRemainingView: View {
    public enum Variant: String, CaseIterable, Sendable {
        case plain, tiles
    }

    private let values: [MacroRemainingValue]
    private let variant: Variant

    public init(eaten: [Macro: Double], goal: [Macro: Double], variant: Variant = .plain) {
        values = Macro.allCases.map { MacroRemainingValue(macro: $0, eaten: eaten[$0] ?? 0, goal: goal[$0]) }
        self.variant = variant
    }

    public var body: some View {
        HStack(alignment: .top, spacing: variant == .tiles ? DS.Space.s2 : DS.Space.s4) {
            ForEach(values, id: \.macro) { value in
                MacroColumn(value: value, variant: variant)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct MacroColumn: View {
    let value: MacroRemainingValue
    let variant: MacroRemainingView.Variant

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s1) {
            Text(value.macro.title)
                .dsText(DS.Typography.caption)
                .fontWeight(.semibold)
                .foregroundStyle(value.macro.textRole.color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value.headline)
                    .dsText(DS.Typography.numL)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text("г")
                    .dsText(DS.Typography.callout)
            }
            .foregroundStyle(DS.Color.fgDefault)
            Text(value.caption)
                .dsText(DS.Typography.micro)
                .foregroundStyle(value.state == .over ? DS.Color.statusWarningFg : DS.Color.fgSubtle)
            if let ofGoal = value.ofGoal {
                DSProgressBar(value: value.fraction, max: 1, role: value.macro.fillRole,
                              thickness: variant == .tiles ? 3 : 4, label: value.accessibilityLabel)
                Text(ofGoal)
                    .dsText(DS.Typography.caption)
                    .monospacedDigit()
                    .foregroundStyle(DS.Color.fgMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .padding(variant == .tiles ? DS.Space.s3 : 0)
        .background {
            if variant == .tiles {
                RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous)
                    .fill(DS.Color.bgSurface)
                    .overlay(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous)
                        .strokeBorder(DS.Color.lineDefault, lineWidth: 1))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value.accessibilityLabel)
    }
}
#endif
