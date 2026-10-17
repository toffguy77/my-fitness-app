#if canImport(SwiftUI)
import SwiftUI

/// Справочник компонентов (только в Dev-сборке приложения): каждый компонент
/// в текущей теме; тему переключает системная настройка.
public struct CatalogueView: View {
    public init() {}

    public var body: some View {
        ScrollView {
            // Не LazyVStack: аудит доступности увеличивает текст и проверяет
            // элементы у края экрана — ленивый стек их к тому времени разбирает.
            VStack(alignment: .leading, spacing: DS.Space.s6) {
                ForEach(CatalogueEntry.allCases) { entry in
                    VStack(alignment: .leading, spacing: DS.Space.s3) {
                        Text(entry.title)
                            .dsText(DS.Typography.overline)
                            .foregroundStyle(DS.Color.fgSubtle)
                            .accessibilityAddTraits(.isHeader)
                        CatalogueSample(entry: entry)
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier(entry.accessibilityID)
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s5)
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle("Компоненты")
    }
}

/// Образец одного компонента — и для справочника, и для снапшотов.
public struct CatalogueSample: View {
    private let entry: CatalogueEntry

    public init(entry: CatalogueEntry) {
        self.entry = entry
    }

    public var body: some View {
        switch entry {
        case .card:
            VStack(spacing: DS.Space.s3) {
                ForEach(DSCardVariant.allCases, id: \.self) { variant in
                    DSCard(variant) {
                        VStack(alignment: .leading, spacing: DS.Space.s1) {
                            DSCardTitle("Карточка \(variant.rawValue)")
                            Text("Текст карточки").dsText(DS.Typography.body)
                        }
                    }
                }
            }
        case .coachCard:
            CoachCard(author: "Мария, куратор", message: "Отличный завтрак! Добавьте овощей к обеду — до нормы клетчатки 12 г.",
                      actionTitle: "Ответить", action: {})
        case .progressArc:
            DSProgressArc(fraction: CatalogueSamples.energy.fraction, label: CatalogueSamples.energy.accessibilityLabel) {
                Text("1 923").dsText(DS.Typography.numXl).foregroundStyle(DS.Color.fgDefault)
            }
        case .progressBar:
            VStack(spacing: DS.Space.s3) {
                DSProgressBar(value: 91, max: 140, role: .macroProtein, label: "Белки: 91 из 140 г")
                DSProgressBar(value: 70, max: 58, role: .macroFat, label: "Жиры: 70 из 58 г")
                DSProgressBar(value: 6, max: 8, role: .macroWater, thickness: 8, label: "Вода: 6 из 8 стаканов")
            }
        case .macroRemaining:
            VStack(spacing: DS.Space.s4) {
                MacroRemainingView(eaten: CatalogueSamples.eaten, goal: CatalogueSamples.goal)
                MacroRemainingView(eaten: CatalogueSamples.eaten, goal: CatalogueSamples.goal, variant: .tiles)
                MacroRemainingView(eaten: CatalogueSamples.eaten, goal: [:])
            }
        case .weekDots:
            WeekDotsView(days: CatalogueSamples.week)
        case .quickAdd:
            QuickAddActions(onSearch: {}, onPhoto: {}, onBarcode: {})
        case .quickAddBar:
            QuickAddBar(onSearch: {}, onBarcode: {}, onPhoto: {})
        case .buttons:
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                ForEach(DSButtonStyle.Kind.allCases, id: \.self) { kind in
                    Button("Кнопка \(kind.rawValue)") {}
                        .buttonStyle(DSButtonStyle(kind, size: .medium))
                        .padding(kind == .inverse ? DS.Space.s2 : 0)
                        .background(kind == .inverse ? DS.Color.coachBg : Color.clear)
                }
                Button("Недоступна") {}.buttonStyle(DSButtonStyle(.primary)).disabled(true)
                DSIconButton("bell", label: "Уведомления") {}
            }
        case .offlineBanner:
            OfflineBanner(updatedLabel: "Обновлено в 14:20")
        case .spinner:
            DSSpinner()
        case .nutritionCard:
            NutritionCard(energy: CatalogueSamples.energy, eaten: CatalogueSamples.eaten, goal: CatalogueSamples.goal)
        }
    }
}
#endif
