import Client
import DesignSystem
import SwiftUI

/// Что «Дневник» просит у владельца.
struct DiaryActions {
    var previousDay: () -> Void = {}
    var nextDay: () -> Void = {}
    var pickDate: () -> Void = {}
    var addTo: (MealType) -> Void = { _ in }
    var edit: (FoodEntry) -> Void = { _ in }
    var delete: (FoodEntry) -> Void = { _ in }
    var repeatToday: (FoodEntry) -> Void = { _ in }
    var saveAsOwn: (FoodEntry) -> Void = { _ in }
    var water: (Int) -> Void = { _ in }
}

/// Раздел «Дневника».
enum DiaryTab: String, Hashable {
    case ration, nutrients
}

/// Шапка «Дневника»: заголовок, календарь, день ‹ ›, «Рацион · Нутриенты».
struct DiaryHeader: View {
    let state: DiaryScreenState
    @Binding var tab: DiaryTab
    let actions: DiaryActions

    var body: some View {
        VStack(spacing: DS.Space.s3) {
            HStack {
                Text("Дневник")
                    .dsText(DS.Typography.display)
                    .foregroundStyle(DS.Color.fgDefault)
                    .frame(height: 40)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button(action: actions.pickDate) {
                    Image(systemName: "calendar")
                        .font(.system(size: 20))
                        .foregroundStyle(DS.Color.fgDefault)
                        .frame(width: DS.Size.touch, height: DS.Size.touch)
                        .background(Circle().fill(DS.Color.bgSurface.opacity(0.78)))
                        .overlay(Circle().strokeBorder(DS.Color.lineDefault))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Выбрать дату")
                .accessibilityIdentifier("diary.calendar")
            }
            HStack {
                dayButton("chevron.left", "Предыдущий день", enabled: true, action: actions.previousDay)
                    .accessibilityIdentifier("diary.previous")
                Spacer()
                Text(state.dayLabel)
                    .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .headline).weight(.semibold))
                    .foregroundStyle(DS.Color.fgDefault)
                    .accessibilityIdentifier("diary.date")
                Spacer()
                dayButton("chevron.right", "Следующий день", enabled: state.canGoForward, action: actions.nextDay)
                    .accessibilityIdentifier("diary.next")
            }
            // Ряд 36 pt, как на макете; кнопки остаются 44 pt и заходят на соседей.
            .padding(.vertical, -4)
            SegmentedTabs(items: [(DiaryTab.ration, "Рацион"), (DiaryTab.nutrients, "Нутриенты")], selection: $tab) {
                "diary.tab.\($0.rawValue)"
            }
        }
    }

    private func dayButton(_ icon: String, _ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(enabled ? DS.Color.fgDefault : DS.Color.fgSubtle)
                .frame(width: 36, height: DS.Size.touch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

/// «Рацион» без модели (макет Diary.png): итог, приёмы, вода.
struct DiaryRationContent: View {
    let state: DiaryScreenState
    var actions = DiaryActions()
    /// Запись с открытым «Удалить» — для снапшота макета.
    var revealedEntryID: String?

    var body: some View {
        VStack(spacing: DS.Space.s3) {
            if state.loaded {
                DiarySummaryCard(state: state)
                ForEach(state.meals) { group in
                    MealGroupCard(group: group, actions: actions, revealedEntryID: revealedEntryID)
                }
                if let line = state.waterLine {
                    WaterRow(line: line, glasses: state.water?.glasses ?? 0, onChange: actions.water)
                }
            } else {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSubtle).frame(height: 96)
                }
                .accessibilityElement()
                .accessibilityLabel("Загружаем день")
                .accessibilityIdentifier("diary.loading")
            }
        }
    }
}

/// «1 923 ккал осталось · 549 из 2 472», макросы и источник нормы.
struct DiarySummaryCard: View {
    let state: DiaryScreenState

    var body: some View {
        let summary = state.summary
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(summary.headline)
                        .dsText(DS.Typography.numL)
                        .foregroundStyle(DS.Color.fgDefault)
                        .accessibilityIdentifier("diary.remaining")
                    Text(summary.norm == nil ? "ккал съедено" : summary.isOver ? "ккал сверх нормы" : "ккал осталось")
                        .dsText(DS.Typography.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(DS.Color.fgMuted)
                }
                Spacer()
                if let norm = summary.norm {
                    Text("\(NumberText.grouped(summary.eaten)) из \(NumberText.grouped(norm.calories))")
                        .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                }
            }
            HStack(alignment: .firstTextBaseline) {
                if let macros = summary.macros {
                    HStack(spacing: 14) {
                        ForEach(macros, id: \.macro) { macro in
                            Text(verbatim: "\(macro.macro.title.prefix(1)) \(macro.headline) г")
                                .foregroundStyle(color(macro.macro))
                        }
                    }
                    .font(.custom(DS.FontFamily.sans, size: 13, relativeTo: .footnote))
                } else {
                    MacroLine(nutrition: state.totals)
                }
                Spacer(minLength: DS.Space.s2)
                Text(state.normSource ?? "Норма не посчитана")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(.horizontal, DS.Space.s4)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
        .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("diary.summary")
    }

    private func color(_ macro: MacroLeft.Macro) -> Color {
        switch macro {
        case .protein: return DS.Color.macroProteinFg
        case .fat: return DS.Color.macroFatFg
        case .carbs: return DS.Color.macroCarbsFg
        }
    }
}

/// Приём пищи: заголовок с итогом, записи, «Нет записей · Добавить».
struct MealGroupCard: View {
    let group: DiaryScreenState.MealGroup
    let actions: DiaryActions
    var revealedEntryID: String?

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        VStack(spacing: 0) {
            Button { actions.addTo(group.meal) } label: {
                HStack(alignment: .firstTextBaseline) {
                    Text(group.meal.title)
                        .font(.custom(DS.FontFamily.serif, size: 17, relativeTo: .headline).weight(.medium))
                        .foregroundStyle(DS.Color.fgDefault)
                    Spacer()
                    Text(group.total).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                }
                .padding(.horizontal, DS.Space.s4)
                .padding(.top, DS.Space.s3)
                .padding(.bottom, DS.Space.s1)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(group.meal.title), \(group.total)")
            .accessibilityHint("Добавить в \(group.meal.accusative)")
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("diary.meal.\(group.meal.rawValue)")
            if group.rows.isEmpty {
                HStack {
                    Text("Нет записей").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    Spacer()
                    Button { actions.addTo(group.meal) } label: {
                        // Высота 44 — у подписи кнопки: рамка снаружи кнопки
                        // область нажатия не увеличивала.
                        Text("Добавить")
                            .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout).weight(.medium))
                            .foregroundStyle(DS.Color.primaryDefault)
                            .frame(minWidth: DS.Size.touch, minHeight: DS.Size.touch)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                        .accessibilityLabel("Добавить в \(group.meal.accusative)")
                        .accessibilityIdentifier("diary.add.\(group.meal.rawValue)")
                }
                .padding(.horizontal, DS.Space.s4)
                .overlay(alignment: .top) { Rectangle().fill(DS.Color.lineDefault).frame(height: 1) }
            } else {
                ForEach(group.rows) { row in
                    SwipeToDeleteRow(revealed: row.id == revealedEntryID, onDelete: { actions.delete(row.entry) }, content: {
                        EntryRow(row: row) { actions.edit(row.entry) }
                    })
                    .overlay(alignment: .top) { Rectangle().fill(DS.Color.lineDefault).frame(height: 1) }
                    .contextMenu {
                        Button("Повторить сегодня", systemImage: "arrow.uturn.forward") { actions.repeatToday(row.entry) }
                        Button("Сохранить как своё", systemImage: "star") { actions.saveAsOwn(row.entry) }
                            .disabled(row.pending)
                        Button("Удалить", systemImage: "trash", role: .destructive) { actions.delete(row.entry) }
                    }
                    // Строка целиком — один элемент VoiceOver: снаружи свайпа и
                    // контекстного меню (внутри них SwiftUI снова открывал
                    // название, подпись и калории по отдельности).
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(row.accessibilityLabel)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction(.default) { actions.edit(row.entry) }
                    .accessibilityAction(named: "Удалить") { actions.delete(row.entry) }
                    .accessibilityIdentifier("entry.\(row.entry.foodName)")
                }
            }
        }
        .background(shape.fill(DS.Color.bgSurface))
        .clipShape(shape)
        .overlay(shape.strokeBorder(DS.Color.lineDefault))
        .accessibilityElement(children: .contain)
    }
}

/// Строка записи: название, «250 г · 08:10», калории.
///
/// Для VoiceOver строку схлопывает `DiaryMealCard` снаружи свайпа и меню:
/// один элемент-кнопка `entry.<название>` с действием «Удалить».
struct EntryRow: View {
    let row: DiaryRow
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: DS.Space.s3) {
            VStack(alignment: .leading, spacing: 0) {
                Text(row.entry.foodName)
                    .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout))
                    .foregroundStyle(DS.Color.fgDefault)
                    .lineLimit(2)
                Text(row.pending ? "\(row.entry.caption) · ждёт отправки" : row.entry.caption)
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(row.pending ? DS.Color.statusWarningFg : DS.Color.fgMuted)
            }
            Spacer()
            Text(NumberText.grouped(row.entry.nutrition.kcal))
                .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout).weight(.medium))
                .monospacedDigit()
                .foregroundStyle(DS.Color.fgDefault)
        }
        .padding(.horizontal, DS.Space.s4)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(DS.Color.bgSurface)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        // Текст строки VoiceOver не читает по частям: элемент — вся строка
        // (`.accessibilityElement` снаружи свайпа); без этого SwiftUI
        // показывал название, подпись и калории ещё и отдельными текстами.
        .accessibilityHidden(true)
    }
}

extension DiaryRow {
    /// «Овсянка на молоке, 250 г · 08:10, 280 ккал».
    var accessibilityLabel: String {
        "\(entry.foodName), \(entry.caption), \(entry.nutrition.kcal) ккал" + (pending ? ", ждёт отправки" : "")
    }
}

/// Свайп влево открывает «Удалить» (84 pt); VoiceOver — действие «Удалить».
struct SwipeToDeleteRow<Content: View>: View {
    var revealed = false
    let onDelete: () -> Void
    @ViewBuilder let content: Content
    @State private var offset: CGFloat = 0
    @State private var open = false

    private let width: CGFloat = 84

    var body: some View {
        ZStack(alignment: .trailing) {
            Button {
                withAnimation(.snappy) { offset = 0; open = false }
                onDelete()
            } label: {
                Text("Удалить")
                    .font(.custom(DS.FontFamily.sans, size: 14, relativeTo: .subheadline).weight(.medium))
                    .foregroundStyle(DS.Color.primaryFg)
                    .frame(width: width)
                    .frame(maxHeight: .infinity)
                    .background(DS.Color.statusDanger)
            }
            .buttonStyle(.plain)
            .accessibilityHidden(!(open || revealed))
            .accessibilityIdentifier("entry.delete")
            content
                .offset(x: revealed ? -width : offset)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 20)
                        .onChanged { value in
                            guard abs(value.translation.width) > abs(value.translation.height) else { return }
                            offset = min(0, max(-width * 1.5, value.translation.width + (open ? -width : 0)))
                        }
                        .onEnded { value in
                            withAnimation(.snappy) {
                                open = value.translation.width < -width / 2
                                offset = open ? -width : 0
                            }
                        }
                )
        }
        .clipped()
    }
}

/// «Вода 5 из 8 · 250 мл» с «−» и «+».
struct WaterRow: View {
    let line: String
    let glasses: Int
    let onChange: (Int) -> Void

    var body: some View {
        HStack(spacing: DS.Space.s3) {
            Image(systemName: "drop").font(.system(size: 20)).foregroundStyle(DS.Color.macroWater).accessibilityHidden(true)
            (Text("Вода ").foregroundStyle(DS.Color.fgDefault)
                + Text(line).font(.custom(DS.FontFamily.sans, size: 13, relativeTo: .footnote)).foregroundStyle(DS.Color.fgMuted))
                .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body))
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("diary.water")
            glassButton("minus", "Убрать стакан", DS.Color.fgDefault, DS.Color.bgSubtle, -1)
                .disabled(glasses == 0)
                .accessibilityIdentifier("diary.water.minus")
            glassButton("plus", "Добавить стакан", DS.Color.primaryDefault, DS.Color.primarySoft, 1)
                .accessibilityIdentifier("diary.water.plus")
        }
        .padding(.horizontal, DS.Space.s4)
        .padding(.vertical, DS.Space.s1)
        .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
        .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
        .sensoryFeedback(.impact(weight: .light), trigger: glasses)
    }

    private func glassButton(_ icon: String, _ label: String, _ fg: Color, _ bg: Color, _ delta: Int) -> some View {
        Button { onChange(delta) } label: {
            Image(systemName: icon).font(.system(size: 15, weight: .medium)).foregroundStyle(fg)
                .frame(width: 32, height: 32).background(Circle().fill(bg))
                .frame(width: DS.Size.touch, height: DS.Size.touch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
