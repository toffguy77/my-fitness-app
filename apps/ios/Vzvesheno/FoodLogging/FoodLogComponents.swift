import Client
import DesignSystem
import SwiftUI

/// Переключатель разделов на подложке `bgSubtle`: «Поиск · Штрихкод · Фото ·
/// Вручную», «Рацион · Нутриенты», «План · Рецепты».
struct SegmentedTabs<Value: Hashable>: View {
    let items: [(value: Value, title: String)]
    @Binding var selection: Value
    var fontSize: CGFloat = 14
    var identifier: (Value) -> String

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.value) { item in
                let selected = item.value == selection
                Button { selection = item.value } label: {
                    Text(item.title)
                        .font(.custom(DS.FontFamily.sans, size: fontSize, relativeTo: .subheadline).weight(.medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .foregroundStyle(selected ? DS.Color.fgDefault : DS.Color.fgMuted)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background {
                            if selected {
                                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(DS.Color.bgSurface)
                                    .shadow(color: DS.Color.fgDefault.opacity(0.08), radius: 1.5, y: 1)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
                .accessibilityIdentifier(identifier(item.value))
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(DS.Color.bgSubtle))
    }
}

/// Метка источника: «база», «штрихкод», «моё», «Open Food Facts».
struct SourceTag: View {
    let text: String

    var body: some View {
        Text(text)
            .dsText(DS.Typography.micro)
            .fontWeight(.regular)
            .foregroundStyle(DS.Color.fgSubtle)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(DS.Color.bgSubtle))
            .fixedSize()
    }
}

/// «Б 6 г · Ж 2 г · У 32 г» цветами макросов.
struct MacroLine: View {
    let nutrition: Nutrition
    var withUnits = true

    var body: some View {
        HStack(spacing: 14) {
            part("Б", nutrition.protein, DS.Color.macroProteinFg)
            part("Ж", nutrition.fat, DS.Color.macroFatFg)
            part("У", nutrition.carbs, DS.Color.macroCarbsFg)
        }
        .font(.custom(DS.FontFamily.sans, size: 13, relativeTo: .footnote))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Белки \(nutrition.protein.jsRoundedText) г, жиры \(nutrition.fat.jsRoundedText) г, "
                            + "углеводы \(nutrition.carbs.jsRoundedText) г")
    }

    private func part(_ letter: String, _ value: Double, _ color: Color) -> some View {
        Text(verbatim: "\(letter) \(value.jsRoundedText)\(withUnits ? " г" : "")")
            .foregroundStyle(color)
            .lineLimit(1)
            .fixedSize()
    }
}

extension Double {
    var jsRoundedText: String { NumberText.grouped(NumberText.jsRound(self)) }
}

/// Главная кнопка листа: 50 pt, скругление 14, как на макетах.
struct SheetPrimaryButton: View {
    let title: String
    var identifier: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .headline).weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(enabled ? DS.Color.primaryFg : DS.Color.fgDisabled)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(enabled ? DS.Color.primaryDefault : DS.Color.bgSubtle))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityIdentifier(identifier)
    }
}
