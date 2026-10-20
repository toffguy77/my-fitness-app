import Client
import DesignSystem
import SwiftUI

/// Шапка и переключатель способов листа «Записать еду» (макет AddFood.png);
/// тело — выбранный способ.
struct AddFoodContent<Method: View>: View {
    @Binding var method: FoodLogMethod
    @Binding var meal: MealType
    let onCancel: () -> Void
    @ViewBuilder let content: Method

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Button("Отмена", action: onCancel)
                    .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body).weight(.medium))
                    .foregroundStyle(DS.Color.primaryDefault)
                    .frame(minHeight: DS.Size.touch)
                    .touchTarget()
                    .accessibilityIdentifier("addFood.cancel")
                Spacer()
                Menu {
                    Picker("Приём пищи", selection: $meal) {
                        ForEach(MealType.allCases) { Text($0.title).tag($0) }
                    }
                } label: {
                    HStack(spacing: DS.Space.s1) {
                        Text(meal.title)
                        Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                    }
                    .font(.custom(DS.FontFamily.sans, size: 14, relativeTo: .subheadline).weight(.medium))
                    .foregroundStyle(DS.Color.primaryDefault)
                    .padding(.horizontal, DS.Space.s3)
                    .frame(minHeight: 32)
                    .background(Capsule().fill(DS.Color.primarySoft))
                    .frame(minHeight: DS.Size.touch)
                }
                .accessibilityLabel("Приём пищи: \(meal.title)")
                .accessibilityIdentifier("addFood.meal")
            }
            .overlay {
                Text("Записать еду")
                    .dsText(DS.Typography.title3)
                    .foregroundStyle(DS.Color.fgDefault)
                    .accessibilityAddTraits(.isHeader)
                    .allowsHitTesting(false)
            }
            SegmentedTabs(items: FoodLogMethod.allCases.map { ($0, $0.title) }, selection: $method, fontSize: 13) {
                "addFood.method.\($0.rawValue)"
            }
            content
        }
        .padding(.horizontal, DS.Space.screenX)
        .padding(.top, DS.Space.s2)
    }
}

/// Способ «Поиск»: поле, выдача или недавние и избранное, порция выбранного.
struct FoodSearchContent: View {
    @Binding var query: String
    let showsSuggestions: Bool
    let results: [FoodItem]
    let recent: [FoodItem]
    let favorites: [FoodItem]
    let searching: Bool
    let error: String?
    let searchedFor: String?
    let isFavorite: (FoodItem) -> Bool
    let selected: FoodItem?
    @Binding var portion: Portion
    let meal: MealType
    var focusOnAppear = false
    let onSelect: (FoodItem) -> Void
    let onStar: (FoodItem) -> Void
    let onAdd: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: DS.Space.s2) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 17))
                    .foregroundStyle(DS.Color.fgSubtle)
                    .accessibilityHidden(true)
                TextField("Продукт или блюдо", text: $query)
                    .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body))
                    .foregroundStyle(DS.Color.fgDefault)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .accessibilityIdentifier("search.field")
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(DS.Color.fgSubtle)
                            .touchTarget()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Очистить")
                }
            }
            .padding(.horizontal, DS.Space.s3)
            .frame(height: DS.Size.touch)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(DS.Color.bgSubtle))

            if showsSuggestions {
                if !favorites.isEmpty { section("Избранное", favorites) }
                if !recent.isEmpty { section("Недавние", recent) }
                if favorites.isEmpty && recent.isEmpty {
                    Text("Начните вводить название — искать будем со второй буквы.")
                        .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                }
            } else if let error {
                Text(error).dsText(DS.Typography.caption).foregroundStyle(DS.Color.statusDangerFg)
            } else if results.isEmpty && !searching && searchedFor != nil {
                Text("Ничего не нашлось. Попробуйте другое название или добавьте продукт вручную.")
                    .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    .accessibilityIdentifier("search.empty")
            } else {
                rows(results)
            }

            if let selected {
                PortionCard(food: selected, portion: $portion, meal: meal, onAdd: onAdd)
            }
        }
        .onAppear { if focusOnAppear { focused = true } }
    }

    private func section(_ title: String, _ items: [FoodItem]) -> some View {
        VStack(alignment: .leading, spacing: DS.Space.s1) {
            Text(title).dsText(DS.Typography.overline).foregroundStyle(DS.Color.fgSubtle)
            rows(items)
        }
    }

    private func rows(_ items: [FoodItem]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Rectangle().fill(DS.Color.lineDefault).frame(height: 1) }
                FoodRow(item: item, favorite: isFavorite(item), selected: item.id == selected?.id,
                        onSelect: { onSelect(item) }, onStar: { onStar(item) })
            }
        }
    }
}

/// Строка продукта: название, «110 ккал на 100 г · Б 4 · Ж 1 · У 21», метка, звезда.
struct FoodRow: View {
    let item: FoodItem
    let favorite: Bool
    let selected: Bool
    let onSelect: () -> Void
    let onStar: () -> Void

    var body: some View {
        HStack(spacing: DS.Space.s3) {
            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 0) {
                    // fixedSize по вертикали: на крупном шрифте стопка иначе
                    // ужимала название в одну строку с многоточием.
                    Text(item.name)
                        .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout))
                        .foregroundStyle(DS.Color.fgDefault)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(item.subtitle)
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selected ? [.isSelected] : [])
            .accessibilityIdentifier("food.\(item.id)")
            if let tag = item.sourceTag { SourceTag(text: tag) }
            Button(action: onStar) {
                Image(systemName: favorite ? "star.fill" : "star")
                    .font(.system(size: 19))
                    .foregroundStyle(favorite ? DS.Color.primaryDefault : DS.Color.fgSubtle)
                    .frame(width: 36, height: DS.Size.touch)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(favorite ? "Убрать из избранного" : "Добавить в избранное")
            .accessibilityIdentifier("food.star.\(item.id)")
        }
        .padding(.vertical, 6)
    }
}

/// Порция: быстрые значения, колесо с единицами и пересчёт КБЖУ.
struct PortionCard: View {
    let food: FoodItem
    @Binding var portion: Portion
    let meal: MealType
    let onAdd: () -> Void
    var showsWheel = false
    @State private var wheel = false

    var body: some View {
        let nutrition = portion.nutrition(per100: food.per100)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(food.name)
                    .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .headline).weight(.semibold))
                    .foregroundStyle(DS.Color.fgDefault)
                Spacer()
                Text("\(NumberText.grouped(nutrition.kcal)) ккал")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
                    .accessibilityIdentifier("portion.kcal")
            }
            HStack(spacing: DS.Space.s2) {
                ForEach(portion.unit.quick, id: \.self) { value in
                    let selected = portion.amount == value
                    Button { portion.amount = value } label: {
                        Text(portion.unit.label(value))
                            .font(.custom(DS.FontFamily.sans, size: 14, relativeTo: .subheadline)
                                .weight(selected ? .semibold : .regular))
                            .foregroundStyle(selected ? DS.Color.bgCanvas : DS.Color.fgDefault)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(selected ? DS.Color.fgDefault : DS.Color.bgSubtle))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
                    .accessibilityIdentifier("portion.quick.\(NumberText.oneDecimal(value))")
                }
            }
            HStack(alignment: .firstTextBaseline) {
                MacroLine(nutrition: nutrition)
                Spacer(minLength: DS.Space.s2)
                Button { wheel.toggle() } label: {
                    Text(wheel ? "скрыть колесо" : "прокрутите колесо для точного веса")
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgMuted)
                        .multilineTextAlignment(.trailing)
                        .touchTarget()
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("portion.wheelToggle")
            }
            if wheel || showsWheel {
                Picker("Единица", selection: Binding(get: { portion.unit }, set: { unit in
                    portion = Portion(unit: unit, amount: unit.quick[1], servingGrams: food.servingSize)
                })) {
                    ForEach(PortionUnit.allCases) { Text($0.short).tag($0) }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("portion.unit")
                Picker("Порция", selection: $portion.amount) {
                    ForEach(portion.unit.wheel, id: \.self) { Text(portion.unit.label($0)).tag($0) }
                }
                .pickerStyle(.wheel)
                .frame(height: 120)
                .accessibilityIdentifier("portion.wheel")
            }
            SheetPrimaryButton(title: "Добавить в \(meal.accusative)", identifier: "portion.add",
                               enabled: portion.isValid, action: onAdd)
        }
        .padding(.horizontal, DS.Space.s4)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
        .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("portion.card")
    }
}
