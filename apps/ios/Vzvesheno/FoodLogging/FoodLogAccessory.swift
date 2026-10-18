import Client
import DesignSystem
import SwiftUI

/// «Записать еду» над таббаром: подпись открывает поиск, кнопки — поиск,
/// штрихкод и фото (`ios-client-app/design.md`). На iOS 26 это
/// `tabViewBottomAccessory` с Liquid Glass, на iOS 18 — плавающая панель
/// того же вида над таббаром.
struct FoodLogAccessory: View {
    let onOpen: (FoodLogMethod) -> Void

    var body: some View {
        HStack(spacing: DS.Space.s2) {
            Button { onOpen(.search) } label: {
                Text("Записать еду")
                    .font(.custom(DS.FontFamily.sans, size: 14, relativeTo: .subheadline).weight(.medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .foregroundStyle(DS.Color.fgDefault)
                    .frame(maxWidth: .infinity, minHeight: DS.Size.touch, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("accessory.open")
            item("magnifyingglass", "Найти продукт", .search)
            item("barcode.viewfinder", "Сканировать штрихкод", .barcode)
            item("camera", "Распознать по фото", .photo)
        }
        .padding(.leading, DS.Space.s4)
        .padding(.trailing, 6)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("accessory.foodLog")
    }

    private func item(_ icon: String, _ label: String, _ method: FoodLogMethod) -> some View {
        Button { onOpen(method) } label: {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(DS.Color.primaryDefault)
                .frame(minWidth: DS.Size.touch, minHeight: 36)
                .background(Capsule().fill(DS.Color.primarySoft))
                .frame(minHeight: DS.Size.touch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier("accessory.\(method.rawValue)")
    }
}

/// Плавающая панель iOS 18: бумага поверх контента. Непрозрачная: под
/// полупрозрачной подложкой контраст подписи зависел бы от того, что
/// прокручивается под ней (стекло — у системного аксессуара iOS 26).
struct FloatingFoodLogAccessory: View {
    let onOpen: (FoodLogMethod) -> Void

    var body: some View {
        FoodLogAccessory(onOpen: onOpen)
            .frame(height: 48)
            .background {
                Capsule().fill(DS.Color.bgSurface)
                    // Без тени: она темнила подписи карточек над панелью.
                    .overlay(Capsule().strokeBorder(DS.Color.lineDefault, lineWidth: 1))
            }
            .padding(.horizontal, DS.Space.s4)
            .padding(.bottom, DS.Space.s2)
    }
}

extension View {
    /// Аксессуар на iOS 26 — системный у `TabView`.
    @ViewBuilder
    func foodLogBottomAccessory(enabled: Bool, onOpen: @escaping (FoodLogMethod) -> Void) -> some View {
        if #available(iOS 26.0, *), enabled {
            tabViewBottomAccessory { FoodLogAccessory(onOpen: onOpen) }
        } else {
            self
        }
    }

    /// Плавающая панель на iOS 18 — внизу корня вкладки. На iOS 26 её нет:
    /// там аксессуар системный.
    @ViewBuilder
    func floatingFoodLogAccessory(visible: Bool, onOpen: @escaping (FoodLogMethod) -> Void) -> some View {
        if #available(iOS 26.0, *) {
            self
        } else {
            safeAreaInset(edge: .bottom, spacing: 0) {
                if visible { FloatingFoodLogAccessory(onOpen: onOpen) }
            }
        }
    }
}
