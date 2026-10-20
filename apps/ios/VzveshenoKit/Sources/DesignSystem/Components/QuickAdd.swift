#if canImport(SwiftUI)
import SwiftUI

/// Запись еды в одно касание на карточке питания: «Записать еду» (поиск),
/// фото и штрихкод.
public struct QuickAddActions: View {
    private let onSearch: () -> Void
    private let onPhoto: () -> Void
    private let onBarcode: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(onSearch: @escaping () -> Void, onPhoto: @escaping () -> Void, onBarcode: @escaping () -> Void) {
        self.onSearch = onSearch
        self.onPhoto = onPhoto
        self.onBarcode = onBarcode
    }

    public var body: some View {
        // На крупном тексте главная кнопка — во всю ширину, иконки под ней.
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: DS.Space.s2))
            : AnyLayout(HStackLayout(spacing: DS.Space.s2))
        layout {
            Button(action: onSearch) {
                Label("Записать еду", systemImage: "plus")
            }
            .buttonStyle(DSButtonStyle(.primary, size: .large))
            HStack(spacing: DS.Space.s2) {
                DSIconButton("camera", label: "Распознать еду по фото", action: onPhoto)
                DSIconButton("barcode.viewfinder", label: "Сканировать штрихкод", action: onBarcode)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Быстрая запись еды")
    }
}

/// Плавающая панель над навигацией дневника: Поиск · Код · Фото.
public struct QuickAddBar: View {
    private let onSearch: () -> Void
    private let onBarcode: () -> Void
    private let onPhoto: () -> Void

    public init(onSearch: @escaping () -> Void, onBarcode: @escaping () -> Void, onPhoto: @escaping () -> Void) {
        self.onSearch = onSearch
        self.onBarcode = onBarcode
        self.onPhoto = onPhoto
    }

    public var body: some View {
        HStack(spacing: DS.Space.s1) {
            item("Поиск", "magnifyingglass", "Найти продукт", onSearch)
            item("Код", "barcode.viewfinder", "Сканировать штрихкод", onBarcode)
            item("Фото", "camera.fill", "Распознать еду по фото", onPhoto, emphasised: true)
        }
        .padding(DS.Space.s1)
        .background(Capsule().fill(DS.Color.coachBg))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Быстрая запись еды")
    }

    private func item(_ title: String, _ icon: String, _ label: String, _ action: @escaping () -> Void,
                      emphasised: Bool = false) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .dsText(DS.Typography.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, DS.Space.s4)
                .frame(minHeight: DS.Size.touch)
                .foregroundStyle(emphasised ? DS.Color.primaryFg : DS.Color.coachFg)
                .background(Capsule().fill(emphasised ? DS.Color.primaryDefault : Color.clear))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
#endif
