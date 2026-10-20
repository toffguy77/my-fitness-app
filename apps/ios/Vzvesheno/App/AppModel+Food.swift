import Client
import Foundation
import Navigation

// «Записать еду», «Дневник», нутриенты и «Меню» клиента (`ios-food-logging`,
// `ios-food-diary`, `ios-meal-plan`).
extension AppModel {
    /// «Дневник», нутриенты и «Меню»: модели живут, пока открыта оболочка
    /// клиента, — лист записи с любой вкладки добавляет в тот же дневник.
    func startFood() {
        let calendar = DayCalendar(timeZone: profileTimeZone)
        let diary = DiaryModel(api: api, outbox: outbox, cache: cache, calendar: calendar, health: health, account: user?.id,
                               userID: { [session] in await session.user?.id })
        diary.waterLedger = water
        diary.onTotalsChanged = { [weak self] day, totals in
            self?.today?.applyDiaryTotals(day: day, totals: totals)
        }
        self.diary = diary
        nutrients = NutrientsModel(api: api)
        let plan = MealPlanModel(api: api, calendar: calendar, outbox: outbox, cache: cache, account: user?.id)
        plan.onEaten = { [weak self] day, _ in
            await self?.diary?.syncDay(day)
            await self?.today?.load()
        }
        mealPlan = plan
        recipes = RecipeCatalogModel(api: api)
        shopping = ShoppingModel(api: api, marks: shoppingMarks)
        Task { await diary.load() }
    }

    /// «Дневник» по ссылке: дата из `?date=` (веб её игнорирует) и лист
    /// записи нужным способом из `?add=`. `false` — ссылка не на дневник.
    func openFoodTracker(_ link: ScreenLink) -> Bool {
        guard case let .foodTracker(date, add) = link else { return false }
        selectedTab = .diary
        paths[.diary] = []
        if let date, let diary { Task { await diary.select(date) } }
        if let add { openFoodLog(FoodLogMethod(add), date: date) }
        return true
    }

    /// Общая вода: изменение с любого экрана — на обоих сразу, Здоровью — итог.
    func startWater() {
        let ledger = WaterLedger(outbox: outbox, health: health, userID: { [session] in await session.user?.id })
        ledger.onChanged = { [weak self] day, value in
            self?.today?.applyWater(day: day, value)
            self?.diary?.applyWater(day: day, value)
        }
        water = ledger
    }

    func stopFood() {
        diary = nil
        nutrients = nil
        mealPlan = nil
        recipes = nil
        shopping = nil
        foodLog = nil
    }

    /// Передний план: досылка записей и перечитанный день.
    func refreshFood() async {
        await diary?.flush()
        await diary?.refresh()
    }

    /// Лист «Записать еду»: аксессуар, «Добавить» в дневнике, ссылка `?add=`,
    /// интент. Приём — по часу, если не задан.
    func openFoodLog(_ method: FoodLogMethod, meal: MealType? = nil, date: String? = nil) {
        let calendar = diary?.calendar ?? DayCalendar(timeZone: profileTimeZone)
        foodLog = FoodLogRequest.make(method: method, date: date, meal: meal, now: Date(), calendar: calendar)
    }

    /// Команда App Intent или виджета (`ios-system-surfaces`): тот же путь,
    /// что у ссылки.
    func open(_ intent: IntentRoute) {
        open(Router.link(for: intent))
    }

    /// Аксессуар виден на всех вкладках, кроме переписки (там низ занимает
    /// поле сообщения).
    func showsFoodAccessory(on tab: AppTab) -> Bool {
        paths[tab]?.last != .curatorChat
    }

    /// Сценарий UI-теста: «Снять» берёт готовый снимок — камеры в симуляторе нет.
    var usesTestPhoto: Bool {
        #if DEBUG
        return UITestScenario.current != nil
        #else
        return false
        #endif
    }
}

extension FoodLogMethod {
    init(_ method: AddMethod) {
        switch method {
        case .search: self = .search
        case .barcode: self = .barcode
        case .photo: self = .photo
        case .manual: self = .manual
        }
    }
}
