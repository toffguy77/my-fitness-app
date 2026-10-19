import Client
import DesignSystem
import SwiftUI

/// «Рецепты»: поиск, фильтр по приёму, страницы по 20.
struct RecipeCatalogContent: View {
    @Bindable var model: RecipeCatalogModel
    let onOpen: (RecipeSummary) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            HStack(spacing: DS.Space.s2) {
                Image(systemName: "magnifyingglass").foregroundStyle(DS.Color.fgSubtle).accessibilityHidden(true)
                TextField("Название блюда", text: $model.query)
                    .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body))
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("recipes.search")
            }
            .padding(.horizontal, DS.Space.s3)
            .frame(height: DS.Size.touch)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(DS.Color.bgSubtle))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: DS.Space.s2) {
                    chip("Любой", selected: model.meal == nil) { model.meal = nil }
                    ForEach(MealType.allCases) { meal in
                        chip(meal.title, selected: model.meal == meal) { model.meal = meal }
                    }
                }
            }
            if let error = model.error {
                Text(error).dsText(DS.Typography.caption).foregroundStyle(DS.Color.statusDangerFg)
            }
            ForEach(model.recipes) { recipe in
                Button { onOpen(recipe) } label: {
                    HStack(spacing: DS.Space.s3) {
                        RecipePhoto(url: recipe.photoURL).frame(width: 56, height: 56)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(recipe.name).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                                .multilineTextAlignment(.leading)
                            Text(recipe.caption).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(DS.Color.fgSubtle).accessibilityHidden(true)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("recipe.\(recipe.name)")
            }
            if model.recipes.isEmpty && !model.loading && model.error == nil {
                Text("Ничего не нашлось.").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
            }
            if model.hasMore {
                Button("Показать ещё") { Task { await model.load(reset: false) } }
                    .buttonStyle(DSButtonStyle(.secondary, size: .medium))
            }
        }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .dsText(DS.Typography.caption)
                .fontWeight(.medium)
                .foregroundStyle(selected ? DS.Color.primaryFg : DS.Color.fgDefault)
                .padding(.horizontal, DS.Space.s3)
                .frame(minHeight: 32)
                .background(Capsule().fill(selected ? DS.Color.primaryDefault : DS.Color.bgSubtle))
                .frame(minHeight: DS.Size.touch)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

struct RecipePhoto: View {
    let url: String?

    var body: some View {
        AsyncImage(url: url.flatMap(URL.init(string:))) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            DS.Color.bgSubtle.overlay(Image(systemName: "fork.knife").foregroundStyle(DS.Color.fgSubtle))
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous))
        .accessibilityHidden(true)
    }
}

/// Рецепт: порция с КБЖУ, ингредиенты, шаги, «Не предлагать это блюдо».
struct RecipeScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let recipeID: String
    @State private var recipe: RecipeDetail?
    @State private var failed = false

    var body: some View {
        ScrollView {
            if let recipe {
                VStack(alignment: .leading, spacing: DS.Space.s4) {
                    if recipe.photoURL != nil {
                        RecipePhoto(url: recipe.photoURL).frame(height: 200).frame(maxWidth: .infinity)
                    }
                    Text(recipe.name).dsText(DS.Typography.title1).foregroundStyle(DS.Color.fgDefault)
                        .accessibilityAddTraits(.isHeader)
                    if let description = recipe.description, !description.isEmpty {
                        Text(description).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted)
                    }
                    if let line = recipe.portionLine {
                        Text(line).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                    }
                    if let minutes = recipe.cookMinutes, minutes > 0 {
                        Label("\(minutes) мин", systemImage: "clock").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    }
                    Text("Ингредиенты").dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                    ForEach(recipe.ingredients) { ingredient in
                        HStack {
                            Text(ingredient.title)
                            Spacer()
                            Text(ingredient.quantity).foregroundStyle(DS.Color.fgMuted)
                        }
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.fgDefault)
                    }
                    Text("Приготовление").dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                    ForEach(recipe.steps) { step in
                        HStack(alignment: .top, spacing: DS.Space.s2) {
                            Text("\(step.position).").fontWeight(.semibold)
                            Text(step.text).fixedSize(horizontal: false, vertical: true)
                        }
                        .dsText(DS.Typography.body)
                        .foregroundStyle(DS.Color.fgDefault)
                    }
                    Button("Не предлагать это блюдо", role: .destructive) {
                        Task {
                            if await model.recipes?.reject(recipeID) == true { dismiss() }
                        }
                    }
                    .buttonStyle(DSButtonStyle(.danger))
                    .accessibilityIdentifier("recipe.reject")
                }
                .padding(DS.Space.screenX)
            } else if failed {
                Text("Рецепт недоступен.").dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted).padding()
            } else {
                DSSpinner("Загружаем рецепт").padding(.top, DS.Space.s10)
            }
        }
        .background(DS.Color.bgCanvas)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen.recipe")
        .task {
            recipe = await model.recipes?.detail(recipeID)
            failed = recipe == nil
        }
    }
}

/// Список покупок: отделы, отметка «куплено» на устройстве, «Поделиться».
struct ShoppingListScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List {
            if let shopping = model.shopping {
                if let error = shopping.error { Text(error).foregroundStyle(DS.Color.statusDangerFg) }
                if let list = shopping.list {
                    if !list.hasPlans {
                        Text("На ближайшие дни меню не собрано. Откройте «План», чтобы его собрать.")
                            .foregroundStyle(DS.Color.fgMuted)
                    }
                    ForEach(list.departments) { department in
                        Section(department.name) {
                            ForEach(department.items) { item in
                                let bought = shopping.bought.contains(item.foodID)
                                Button { shopping.toggle(item.foodID) } label: {
                                    HStack {
                                        Image(systemName: bought ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(bought ? DS.Color.primaryDefault : DS.Color.fgSubtle)
                                        Text(item.name).strikethrough(bought).foregroundStyle(DS.Color.fgDefault)
                                        Spacer()
                                        Text(item.quantityText).foregroundStyle(DS.Color.fgMuted)
                                    }
                                }
                                .accessibilityAddTraits(bought ? [.isSelected] : [])
                                .accessibilityIdentifier("shopping.\(item.name)")
                            }
                        }
                    }
                    if !list.atHome.isEmpty {
                        Section("Обычно есть дома") { Text(list.atHome.joined(separator: ", ")) }
                    }
                } else if shopping.error == nil {
                    ProgressView()
                }
            }
        }
        .navigationTitle("Список покупок")
        .toolbar {
            if let list = model.shopping?.list {
                ToolbarItem(placement: .primaryAction) {
                    ShareLink(item: list.shareText) { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel("Поделиться")
                }
            }
        }
        .task { await model.shopping?.load() }
        .accessibilityIdentifier("screen.shopping")
    }
}

/// «Приёмы пищи» меню: хотя бы один.
struct MealSettingsScreen: View {
    @Environment(AppModel.self) private var model
    @State private var saved: Bool?

    var body: some View {
        Form {
            if let shopping = model.shopping {
                Section {
                    ForEach(MealType.allCases) { meal in
                        Toggle(meal.title, isOn: Binding(get: { shopping.mealTypes.contains(meal) },
                                                         set: { shopping.setMeal(meal, enabled: $0) }))
                            .tint(DS.Color.primaryDefault)
                            .accessibilityIdentifier("settings.meal.\(meal.rawValue)")
                    }
                } footer: {
                    Text("Новые настройки применятся при следующей пересборке меню.")
                }
                Button("Сохранить") { Task { saved = await shopping.saveSettings() } }
                    .accessibilityIdentifier("settings.save")
                if let saved {
                    Text(saved ? "Сохранено." : "Не удалось сохранить.")
                        .foregroundStyle(saved ? DS.Color.statusSuccessFg : DS.Color.statusDangerFg)
                }
            }
        }
        .navigationTitle("Приёмы пищи")
        .task { await model.shopping?.loadSettings() }
    }
}
