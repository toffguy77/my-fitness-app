import API
import Foundation
import Observation

/// Что показывает вкладка «Меню» на день.
public enum MealPlanState: Equatable, Sendable {
    case loading
    case plan(MealPlan)
    /// `409 target_missing`: без нормы меню не собрать.
    case targetMissing([String])
    case failed(String)
}

/// «Меню» (бета, `ios-meal-plan`): план дня под норму, замена и
/// закрепление блюд, «Съел» → дневник, пересборка, подгонка порций.
@MainActor
@Observable
public final class MealPlanModel {
    public private(set) var selected: String
    public private(set) var state: MealPlanState = .loading
    public private(set) var working = false
    public var notice: String?
    /// «Съел» записал блюдо: дневник и «Сегодня» перечитывают день,
    /// запись уходит в Здоровье.
    @ObservationIgnored public var onEaten: (@MainActor (_ day: String, _ entryID: String) async -> Void)?

    public let calendar: DayCalendar
    private let api: APIClient
    private let now: @Sendable () -> Date

    public init(api: APIClient, calendar: DayCalendar, now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        self.calendar = calendar
        self.now = now
        selected = calendar.key(now())
    }

    public var today: String { calendar.key(now()) }

    public var plan: MealPlan? {
        if case let .plan(plan) = state { return plan }
        return nil
    }

    /// «Сегодня, 17 октября», «Завтра, 18 октября».
    public var dayLabel: String {
        DiaryScreenState(selected: selected, today: today, calendar: calendar, day: nil, rows: [:], water: nil, plan: nil,
                         targets: nil, loaded: false).dayLabel
    }

    /// Сервер собирает план не дальше 30 дней от сегодня.
    public func canShift(_ days: Int) -> Bool {
        let target = calendar.adding(days: days, to: selected)
        return target <= calendar.adding(days: 30, to: today) && target >= calendar.adding(days: -30, to: today)
    }

    public func shift(days: Int) async {
        guard canShift(days) else { return }
        selected = calendar.adding(days: days, to: selected)
        state = .loading
        await load()
    }

    public func load() async {
        await perform { try await self.api.send(.get("/api/v1/meal-plans/\(self.selected)"), as: MealPlan.self) }
    }

    /// «Пересобрать»: закреплённые и съеденные остаются.
    public func regenerate() async {
        await perform { try await self.api.send(try Endpoint.post("/api/v1/meal-plans/\(self.selected)/regenerate",
                                                                    body: [String: String]()), as: MealPlan.self) }
    }

    /// «Подогнать оставшиеся порции»: съеденное — факт.
    public func refit() async {
        await perform { try await self.api.send(try Endpoint.post("/api/v1/meal-plans/\(self.selected)/refit",
                                                                    body: [String: String]()), as: MealPlan.self) }
    }

    public func setLocked(_ item: MealPlanItem, _ locked: Bool) async {
        await update(item.mealType, PlanItemUpdate(locked: locked))
    }

    /// Выбор замены.
    public func replace(_ item: MealPlanItem, with alternative: MealAlternative) async {
        await update(item.mealType, PlanItemUpdate(recipeID: alternative.recipeID))
    }

    private func update(_ meal: String, _ change: PlanItemUpdate) async {
        await perform {
            try await self.api.send(try Endpoint.put("/api/v1/meal-plans/\(self.selected)/items/\(meal)", body: change),
                                    as: MealPlan.self)
        }
    }

    public func alternatives(for item: MealPlanItem) async -> [MealAlternative]? {
        try? await api.send(.get("/api/v1/meal-plans/\(selected)/items/\(item.mealType)/alternatives"),
                            as: MealAlternatives.self).items
    }

    /// «Съел»: сервер создаёт запись дневника (вес плана или свой), план
    /// отмечает блюдо съеденным. Время — сейчас для сегодняшнего дня.
    @discardableResult
    public func eat(_ item: MealPlanItem, grams: Double? = nil) async -> Bool {
        struct Body: Encodable, Sendable {
            let grams: Double?
            let time: String?
        }
        let day = selected
        let time = day == today ? ClockText.hhmm(now(), calendar: calendar) : nil
        let customGrams = grams.flatMap { $0 != item.grams ? Portion.clamp($0, unit: .grams) : nil }
        working = true
        defer { working = false }
        do {
            let endpoint = try Endpoint.post("/api/v1/meal-plans/\(day)/items/\(item.mealType)/eat",
                                             body: Body(grams: customGrams, time: time))
            let result = try await api.send(endpoint, as: EatResult.self)
            if selected == day { state = .plan(result.plan) }
            await onEaten?(day, result.entryID)
            return true
        } catch {
            notice = message(for: error)
            return false
        }
    }

    private func perform(_ request: @escaping @MainActor () async throws -> MealPlan) async {
        let day = selected
        working = true
        defer { working = false }
        do {
            let plan = try await request()
            guard day == selected else { return }
            state = .plan(plan)
        } catch let APIError.server(409, code?, params) where code == "target_missing" {
            guard day == selected else { return }
            var missing: [String] = []
            if case let .list(values)? = params["missing"] { missing = values.map(\.description) }
            state = .targetMissing(missing.isEmpty ? ["profile", "weight"] : missing)
        } catch {
            guard day == selected else { return }
            if plan == nil {
                state = .failed(message(for: error))
            } else {
                notice = message(for: error)
            }
        }
    }

    private func message(for error: Error) -> String {
        if case APIError.network = error { return "Нет сети. Меню обновится, когда она появится." }
        if case APIError.server(409, _, _) = error { return "Это блюдо уже съедено — его не изменить." }
        return "Не получилось обновить меню. Попробуйте ещё раз."
    }

    /// «Чтобы собрать меню, нужна ваша норма: …».
    public static func missingText(_ missing: [String]) -> String {
        var parts: [String] = []
        if missing.contains("profile") { parts.append("пол, дата рождения и рост") }
        if missing.contains("weight") { parts.append("замер веса") }
        let list = parts.isEmpty ? "данные профиля" : parts.joined(separator: " и ")
        return "Чтобы собрать меню, нужна ваша норма. Для неё не хватает: \(list)."
    }
}

/// «Рецепты»: поиск через 300 мс, фильтр по приёму, страницы по 20.
@MainActor
@Observable
public final class RecipeCatalogModel {
    public static let pageSize = 20

    public private(set) var recipes: [RecipeSummary] = []
    public private(set) var total = 0
    public private(set) var error: String?
    public private(set) var loading = false
    public var meal: MealType? {
        didSet { if meal != oldValue { schedule(immediately: true) } }
    }
    public var query = "" {
        didSet { if query != oldValue { schedule(immediately: false) } }
    }

    private let api: APIClient
    private let sleeper: Sleeper
    @ObservationIgnored private var task: Task<Void, Never>?

    public init(api: APIClient, sleeper: Sleeper = TaskSleeper()) {
        self.api = api
        self.sleeper = sleeper
    }

    public var hasMore: Bool { recipes.count < total }

    public func waitForLoad() async { await task?.value }

    private func schedule(immediately: Bool) {
        task?.cancel()
        task = Task { [weak self, sleeper] in
            if !immediately {
                do { try await sleeper.sleep(for: FoodSearchModel.delay) } catch { return }
            }
            await self?.load(reset: true)
        }
    }

    public func load(reset: Bool) async {
        let page = reset ? 1 : recipes.count / Self.pageSize + 1
        var items = [URLQueryItem(name: "page", value: String(page)),
                     URLQueryItem(name: "page_size", value: String(Self.pageSize))]
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty { items.append(URLQueryItem(name: "q", value: text)) }
        if let meal { items.append(URLQueryItem(name: "meal_type", value: meal.rawValue)) }
        loading = true
        defer { loading = false }
        do {
            let page = try await api.send(.get("/api/v1/recipes", query: items), as: RecipePage.self)
            guard !Task.isCancelled else { return }
            recipes = reset ? page.items : recipes + page.items
            total = page.total
            error = nil
        } catch {
            guard !Task.isCancelled else { return }
            self.error = "Не удалось загрузить рецепты."
        }
    }

    public func detail(_ id: String) async -> RecipeDetail? {
        try? await api.send(.get("/api/v1/recipes/\(id)"), as: RecipeDetail.self)
    }

    /// «Не предлагать это блюдо».
    @discardableResult
    public func reject(_ id: String) async -> Bool {
        guard let endpoint = try? Endpoint.post("/api/v1/recipes/\(id)/reject", body: [String: String]()),
              let raw = try? await api.sendRaw(endpoint), (200..<300).contains(raw.status) else { return false }
        recipes.removeAll { $0.id == id }
        return true
    }
}

/// Отметки «куплено» списка покупок: только на устройстве, как в вебе.
public protocol ShoppingMarksStore: Sendable {
    func load() -> Set<String>
    func save(_ marks: Set<String>)
}

public final class InMemoryShoppingMarks: ShoppingMarksStore, @unchecked Sendable {
    private let lock = NSLock()
    private var marks: Set<String> = []

    public init() {}

    public func load() -> Set<String> { lock.withLock { marks } }
    public func save(_ marks: Set<String>) { lock.withLock { self.marks = marks } }
}

/// «Список покупок» и «Приёмы пищи».
@MainActor
@Observable
public final class ShoppingModel {
    public private(set) var list: ShoppingList?
    public private(set) var error: String?
    public private(set) var bought: Set<String>
    public private(set) var mealTypes: [MealType] = MealType.allCases

    private let api: APIClient
    private let marks: ShoppingMarksStore

    public init(api: APIClient, marks: ShoppingMarksStore = InMemoryShoppingMarks()) {
        self.api = api
        self.marks = marks
        bought = marks.load()
    }

    public func load() async {
        do {
            list = try await api.send(.get("/api/v1/shopping-list"), as: ShoppingList.self)
            error = nil
        } catch {
            self.error = "Не удалось собрать список покупок."
        }
    }

    public func toggle(_ foodID: String) {
        if bought.contains(foodID) { bought.remove(foodID) } else { bought.insert(foodID) }
        marks.save(bought)
    }

    public func loadSettings() async {
        if let settings = try? await api.send(.get("/api/v1/meal-plan-settings"), as: MealPlanSettings.self) {
            mealTypes = MealType.allCases.filter { settings.mealTypes.contains($0.rawValue) }
        }
    }

    /// Приёмы пищи меню: хотя бы один. Последний не выключается.
    public func setMeal(_ meal: MealType, enabled: Bool) {
        if enabled {
            if !mealTypes.contains(meal) { mealTypes = MealType.allCases.filter { mealTypes.contains($0) || $0 == meal } }
        } else if mealTypes.count > 1 {
            mealTypes.removeAll { $0 == meal }
        }
    }

    @discardableResult
    public func saveSettings() async -> Bool {
        guard !mealTypes.isEmpty,
              let endpoint = try? Endpoint.put("/api/v1/meal-plan-settings",
                                               body: MealPlanSettings(mealTypes: mealTypes.map(\.rawValue))),
              let raw = try? await api.sendRaw(endpoint) else { return false }
        return (200..<300).contains(raw.status)
    }
}
