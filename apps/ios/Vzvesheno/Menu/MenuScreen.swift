import API
import Client
import DesignSystem
import SwiftUI

/// Куда ведёт «Меню» внутри вкладки.
enum MenuRoute: Hashable {
    case recipe(String)
    case shopping
    case settings
}

enum MenuTab: String, Hashable {
    case plan, recipes
}

/// «Меню» (бета, `ios-meal-plan`): план дня и рецепты; список покупок и
/// приёмы пищи — кнопками в шапке.
struct MenuScreen: View {
    @Environment(AppModel.self) private var model
    let offline: Bool
    @State private var tab = MenuTab.plan
    @State private var route: MenuRoute?
    @State private var replacing: MealPlanItem?
    @State private var eating: MealPlanItem?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                header
                FreshnessBanner(offline: offline || model.mealPlan?.offline == true, updatedLabel: model.mealPlan?.updatedLabel)
                BetaNote()
                SegmentedTabs(items: [(MenuTab.plan, "План"), (MenuTab.recipes, "Рецепты")], selection: $tab) {
                    "menu.tab.\($0.rawValue)"
                }
                switch tab {
                case .plan:
                    if let plan = model.mealPlan {
                        MealPlanDayContent(model: plan, onReplace: { replacing = $0 }, onEat: { eating = $0 },
                                           onFillProfile: { model.paths[.today, default: []] = [.profile]; model.selectedTab = .today },
                                           onEvent: { model.track($0) })
                            .task { if plan.plan == nil { await plan.load() } }
                    }
                case .recipes:
                    if let recipes = model.recipes {
                        RecipeCatalogContent(model: recipes) { route = .recipe($0.id) }
                            .task { if recipes.recipes.isEmpty { await recipes.load(reset: true) } }
                    }
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.top, DS.Space.s2)
            .padding(.bottom, DS.Space.s6)
        }
        .background(DS.Color.bgCanvas)
        .refreshable {
            if tab == .plan { await model.mealPlan?.load() } else { await model.recipes?.load(reset: true) }
        }
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("screen.menu")
        .task { model.track(ProductEvent.menuOpened) }
        .navigationDestination(item: $route) { route in
            switch route {
            case let .recipe(id): RecipeScreen(recipeID: id)
            case .shopping: ShoppingListScreen()
            case .settings: MealSettingsScreen()
            }
        }
        .sheet(item: $replacing) { item in
            if let plan = model.mealPlan { AlternativesSheet(model: plan, item: item) }
        }
        .sheet(item: $eating) { item in
            if let plan = model.mealPlan {
                EatSheet(model: plan, item: item).presentationDetents([.medium])
            }
        }
        .alert("Меню", isPresented: Binding(get: { model.mealPlan?.notice != nil },
                                            set: { if !$0 { model.mealPlan?.notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.mealPlan?.notice ?? "")
        }
    }

    private var header: some View {
        HStack {
            Text("Меню")
                .dsText(DS.Typography.display)
                .foregroundStyle(DS.Color.fgDefault)
                .frame(height: 40)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            headerButton("cart", "Список покупок") { route = .shopping }
                .accessibilityIdentifier("menu.shopping")
            headerButton("slider.horizontal.3", "Приёмы пищи") { route = .settings }
                .accessibilityIdentifier("menu.settings")
        }
    }

    private func headerButton(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(DS.Color.fgDefault)
                .frame(width: DS.Size.touch, height: DS.Size.touch)
                .background(Circle().fill(DS.Color.bgSurface))
                .overlay(Circle().strokeBorder(DS.Color.lineDefault))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// «Бета-версия»: без слов о подписке, оплате и цене (3.1.1(a)).
struct BetaNote: View {
    static let text = "Раздел «Меню» только появился. Если что-то работает не так или не хватает блюд — напишите куратору."

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s1) {
            HStack(spacing: DS.Space.s2) {
                Text("бета")
                    .microScaled()
                    .foregroundStyle(DS.Color.primaryFg)
                    .padding(.horizontal, DS.Space.s2)
                    .background(Capsule().fill(DS.Color.primaryDefault))
                Text("Бета-версия").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
            }
            Text(Self.text).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, DS.Space.s4)
        .padding(.vertical, DS.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous).fill(DS.Color.bgSubtle))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("menu.beta")
    }
}

/// План дня: дата, предупреждения, итог, приёмы, «Подогнать» и «Пересобрать».
struct MealPlanDayContent: View {
    let model: MealPlanModel
    let onReplace: (MealPlanItem) -> Void
    let onEat: (MealPlanItem) -> Void
    let onFillProfile: () -> Void
    /// Событие продукта (`ProductEvent`): «Подогнать» и «Пересобрать».
    var onEvent: (String) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            HStack {
                dayButton("chevron.left", "Предыдущий день", -1)
                Spacer()
                Text(model.dayLabel)
                    .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .headline).weight(.semibold))
                    .foregroundStyle(DS.Color.fgDefault)
                    .accessibilityIdentifier("menu.date")
                Spacer()
                dayButton("chevron.right", "Следующий день", 1)
            }
            switch model.state {
            case .loading:
                DSSpinner("Собираем план…").frame(maxWidth: .infinity).padding(.vertical, DS.Space.s6)
            case let .failed(message):
                VStack(alignment: .leading, spacing: DS.Space.s2) {
                    Text(message).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                    Button("Повторить") { Task { await model.load() } }.buttonStyle(DSButtonStyle(.secondary, size: .medium))
                }
            case let .targetMissing(missing):
                card {
                    VStack(alignment: .leading, spacing: DS.Space.s3) {
                        Text(MealPlanModel.missingText(missing)).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
                            .accessibilityIdentifier("menu.targetMissing")
                        Button("Тело и цели", action: onFillProfile).buttonStyle(DSButtonStyle(.secondary, size: .medium))
                    }
                }
            case let .plan(plan):
                planBody(plan)
            }
        }
    }

    @ViewBuilder
    private func planBody(_ plan: MealPlan) -> some View {
        if plan.targetChanged {
            card {
                VStack(alignment: .leading, spacing: DS.Space.s2) {
                    Text("Норма изменилась с тех пор, как меню собрано.").dsText(DS.Typography.headline)
                        .foregroundStyle(DS.Color.fgDefault)
                    Button("Пересобрать") { onEvent(ProductEvent.planRegenerated); Task { await model.regenerate() } }
                        .buttonStyle(DSButtonStyle(.secondary, size: .small))
                }
            }
            .accessibilityIdentifier("menu.targetChanged")
        }
        if !plan.deviationTexts.isEmpty || plan.hasUnavailable {
            VStack(alignment: .leading, spacing: DS.Space.s1) {
                ForEach(plan.deviationTexts, id: \.self) { Text($0) }
                if plan.hasUnavailable { Text("Одно из блюд больше недоступно — замените его.") }
            }
            .dsText(DS.Typography.caption)
            .foregroundStyle(DS.Color.statusWarningFg)
        }
        card {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                Text("Итого за день").dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                totalsRow("Калории", plan.totals.kcal, plan.target.kcal, "ккал")
                totalsRow("Белки", plan.totals.protein, plan.target.protein, "г")
                totalsRow("Жиры", plan.totals.fat, plan.target.fat, "г")
                totalsRow("Углеводы", plan.totals.carbs, plan.target.carbs, "г")
            }
        }
        ForEach(plan.mealTypes, id: \.self) { meal in
            slot(meal, plan)
        }
        // Подписи длинные — кнопки друг под другом, а не в строку.
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            Button("Подогнать оставшиеся порции") { onEvent(ProductEvent.planRefit); Task { await model.refit() } }
                .buttonStyle(DSButtonStyle(.secondary, size: .medium))
                .accessibilityIdentifier("menu.refit")
            Button("Пересобрать") { onEvent(ProductEvent.planRegenerated); Task { await model.regenerate() } }
                .buttonStyle(DSButtonStyle(.secondary, size: .medium))
                .accessibilityIdentifier("menu.regenerate")
        }
        .disabled(model.working)
        Text("Закреплённые и съеденные блюда останутся на месте.").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
    }

    private func slot(_ meal: String, _ plan: MealPlan) -> some View {
        let title = MealType(rawValue: meal)?.title ?? meal
        return card {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                Text(title).dsText(DS.Typography.overline).foregroundStyle(DS.Color.fgSubtle)
                if let item = plan.item(for: meal) {
                    Text(item.name).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                        .accessibilityIdentifier("menu.dish.\(meal)")
                    Text(item.caption).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    HStack(spacing: DS.Space.s1) {
                        if item.eaten { tag("Съедено", DS.Color.statusSuccessFg, DS.Color.statusSuccessSoft) }
                        if item.locked { tag("Закреплено", DS.Color.statusInfoFg, DS.Color.statusInfoSoft) }
                        if item.unavailable { tag("Блюдо больше недоступно", DS.Color.statusWarningFg, DS.Color.statusWarningSoft) }
                    }
                    if !item.eaten {
                        HStack(spacing: DS.Space.s2) {
                            Button("Съел") { onEat(item) }.buttonStyle(DSButtonStyle(.primary, size: .small))
                                .accessibilityIdentifier("menu.eat.\(meal)")
                            Button("Заменить") { onReplace(item) }.buttonStyle(DSButtonStyle(.secondary, size: .small))
                                .accessibilityIdentifier("menu.replace.\(meal)")
                            Spacer()
                            Button {
                                Task { await model.setLocked(item, !item.locked) }
                            } label: {
                                Image(systemName: item.locked ? "lock.fill" : "lock.open")
                                    .foregroundStyle(DS.Color.fgDefault)
                                    .frame(width: DS.Size.touch, height: DS.Size.touch)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(item.locked ? "Открепить" : "Закрепить")
                            .accessibilityIdentifier("menu.lock.\(meal)")
                        }
                    }
                } else {
                    Text("Не нашлось подходящих рецептов — проверьте ограничения в питании.")
                        .dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                        .accessibilityIdentifier("menu.empty.\(meal)")
                }
            }
        }
    }

    private func totalsRow(_ title: String, _ value: Double, _ target: Double, _ unit: String) -> some View {
        HStack {
            Text(title).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
            Spacer()
            Text("\(value.jsRoundedText) из \(target.jsRoundedText) \(unit)")
                .dsText(DS.Typography.callout).monospacedDigit().foregroundStyle(DS.Color.fgDefault)
        }
    }

    private func tag(_ text: String, _ fg: Color, _ bg: Color) -> some View {
        Text(text).dsText(DS.Typography.micro).foregroundStyle(fg)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Capsule().fill(bg))
    }

    private func dayButton(_ icon: String, _ label: String, _ days: Int) -> some View {
        Button { Task { await model.shift(days: days) } } label: {
            Image(systemName: icon).font(.system(size: 18, weight: .medium))
                .foregroundStyle(model.canShift(days) ? DS.Color.fgDefault : DS.Color.fgSubtle)
                .frame(width: 36, height: DS.Size.touch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!model.canShift(days))
        .accessibilityLabel(label)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(DS.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
            .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
    }
}

/// «Заменить»: другие блюда на этот приём.
struct AlternativesSheet: View {
    let model: MealPlanModel
    let item: MealPlanItem
    @Environment(\.dismiss) private var dismiss
    @State private var options: [MealAlternative]?

    var body: some View {
        NavigationStack {
            List {
                if let options {
                    if options.isEmpty { Text("Других подходящих блюд нет.").foregroundStyle(DS.Color.fgMuted) }
                    ForEach(options) { option in
                        Button {
                            Task {
                                await model.replace(item, with: option)
                                dismiss()
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(option.name).foregroundStyle(DS.Color.fgDefault)
                                Text(option.caption).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                            }
                        }
                        .accessibilityIdentifier("alternative.\(option.name)")
                    }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Заменить: \(item.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } } }
            .task { options = await model.alternatives(for: item) ?? [] }
        }
    }
}

/// «Съел»: вес плана или свой → запись в дневнике.
struct EatSheet: View {
    let model: MealPlanModel
    let item: MealPlanItem
    @Environment(\.dismiss) private var dismiss
    @State private var grams = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                Text(item.name).dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                DSField(title: "Съедено, г", text: $grams, keyboard: .numberPad).accessibilityIdentifier("eat.grams")
                Text("Блюдо запишется в дневник. Остальные порции дня можно потом подогнать.")
                    .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                Button("Записать в дневник") {
                    Task {
                        if await model.eat(item, grams: Double(grams)) { dismiss() }
                    }
                }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled((Double(grams) ?? 0) <= 0 || (Double(grams) ?? 0) > 2000 || model.working)
                .accessibilityIdentifier("eat.save")
                Spacer()
            }
            .padding(DS.Space.screenX)
            .background(DS.Color.bgCanvas)
            .navigationTitle("Съел")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } } }
        }
        .onAppear { grams = String(NumberText.jsRound(item.grams)) }
    }
}
