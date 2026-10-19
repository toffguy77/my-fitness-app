import API
import Foundation
import Health
import Observation
import Outbox

/// Запись еды и воды в Здоровье (`healthkit-client`). Реализует `HealthSync`;
/// тесты подставляют свою.
public protocol FoodHealthWriter: Sendable {
    func write(_ entry: DiaryEntryForHealth) async
    func delete(entryID: String) async
    func reconcileDay(_ day: String, entries: [DiaryEntryForHealth]) async
    func setWater(day: String, glasses: Int, glassMilliliters: Double, at date: Date) async
}

extension HealthSync: FoodHealthWriter {}

/// Что записать в дневник: продукт, приём, день, порция и её КБЖУ.
public struct EntryDraft: Sendable, Equatable {
    public var foodID: String
    public var name: String
    public var meal: MealType
    public var date: String
    public var portion: Portion
    /// Итог порции.
    public var nutrition: Nutrition

    public init(foodID: String, name: String, meal: MealType, date: String, portion: Portion, nutrition: Nutrition) {
        self.foodID = foodID
        self.name = name
        self.meal = meal
        self.date = date
        self.portion = portion
        self.nutrition = nutrition
    }

    /// Продукт и порция: КБЖУ пересчитываются из «на 100 г».
    public init(food: FoodItem, meal: MealType, date: String, portion: Portion) {
        self.init(foodID: food.id, name: food.name, meal: meal, date: date, portion: portion,
                  nutrition: portion.nutrition(per100: food.per100))
    }
}

/// Запись в строке дневника: с сервера или ждущая отправки.
public struct DiaryRow: Sendable, Equatable, Identifiable {
    public let entry: FoodEntry
    /// Добавлена без сети и ещё не принята сервером.
    public let pending: Bool

    public init(entry: FoodEntry, pending: Bool = false) {
        self.entry = entry
        self.pending = pending
    }

    public var id: String { entry.id }
}

/// Удалённая запись, которую ещё можно вернуть.
public struct DiaryDeletion: Sendable, Equatable {
    public let entry: FoodEntry
}

/// Модель «Дневника» (`ios-food-diary`): день по приёмам, итог, вода,
/// правка, удаление с отменой, повтор и «Сохранить как своё».
///
/// Изменения — оптимистично и через очередь (`Idempotency-Key`): запись,
/// добавленная без сети, видна сразу с отметкой «ждёт отправки» и уменьшает
/// остаток на «Сегодня».
@MainActor
@Observable
public final class DiaryModel {
    public static let addKind = "diary.add"
    public static let undoWindow: Duration = .seconds(5)

    public private(set) var selected: String
    public private(set) var today: String
    public internal(set) var day: DayEntries?
    public internal(set) var water: WaterDay?
    public internal(set) var plan: WeeklyPlan?
    public internal(set) var targets: TargetsAnswer?
    public private(set) var isLoading = false
    public private(set) var loadError: APIError?
    /// Удалённая запись в окне отмены (5 с).
    public private(set) var deletion: DiaryDeletion?
    /// Сообщение после отказа сервера или «Сохранено в своих».
    public var notice: String?
    /// Записи, поставленные в очередь и ещё не принятые: id изменения → запись.
    public internal(set) var queued: [UUID: FoodEntry] = [:]
    /// Ждут отправки: удаление и правка записей с сервера.
    var pendingDeleted: Set<String> = []
    var pendingEdited: [String: EntryUpdateBody] = [:]
    /// На экране сохранённый день / последнее обновление не дошло.
    public internal(set) var freshness = Freshness()
    /// Поменялся итог дня — «Сегодня» уменьшает остаток сразу.
    @ObservationIgnored public var onTotalsChanged: (@MainActor (_ day: String, _ totals: Nutrition) -> Void)?

    public let calendar: DayCalendar
    let api: APIClient
    let outbox: Outbox?
    let reader: ScreenReader
    private let sleeper: Sleeper
    let now: @Sendable () -> Date
    let userID: @Sendable () async -> Int64?
    @ObservationIgnored public var health: FoodHealthWriter?
    /// Вода — общая с «Сегодня»; без неё (тесты) — своя.
    @ObservationIgnored public var waterLedger: WaterLedger?
    @ObservationIgnored private var deletionTask: Task<Void, Never>?
    @ObservationIgnored private var generation = 0

    /// `account` известен сразу — сохранённый день показывается в первом кадре.
    public init(api: APIClient, outbox: Outbox?, cache: ScreenCache? = nil, calendar: DayCalendar, sleeper: Sleeper = TaskSleeper(),
                health: FoodHealthWriter? = nil, now: @escaping @Sendable () -> Date = { Date() }, account: Int64? = nil,
                userID: @escaping @Sendable () async -> Int64?) {
        self.api = api
        self.outbox = outbox
        reader = ScreenReader(api: api, cache: cache, now: now)
        self.calendar = calendar
        self.sleeper = sleeper
        self.health = health
        self.now = now
        self.userID = userID
        let today = calendar.key(now())
        self.today = today
        selected = today
        if let account { hydrate(date: today, userID: account) }
    }

    // MARK: Производные

    public var state: DiaryScreenState {
        DiaryScreenState(selected: selected, today: today, calendar: calendar, day: day, rows: rows, water: water,
                         plan: plan, targets: targets, loaded: day != nil)
    }

    /// Записи дня: с сервера, без удаляемой, плюс ждущие отправки.
    public var rows: [MealType: [DiaryRow]] {
        var result: [MealType: [DiaryRow]] = [:]
        for meal in MealType.allCases {
            let server = (day?.entries[meal] ?? []).filter { $0.id != deletion?.entry.id && !pendingDeleted.contains($0.id) }
                .map { DiaryRow(entry: $0) }
            let local = queued.values.filter { $0.date == selected && $0.mealType == meal && $0.id != deletion?.entry.id }
                .sorted { $0.time < $1.time }.map { DiaryRow(entry: $0, pending: true) }
            result[meal] = server + local
        }
        return result
    }

    /// Итог показанного дня.
    public var totals: Nutrition {
        rows.values.joined().reduce(.zero) { $0 + $1.entry.nutrition }
    }

    // MARK: Загрузка

    /// Открыть день: ссылка `?date=`, ‹ ›, календарь.
    public func select(_ date: String) async {
        rollOver()
        guard date != selected else { return }
        selected = date
        // Записи прежнего дня под новой датой не показываются.
        day = nil
        await load()
    }

    public func shift(days: Int) async {
        await select(calendar.adding(days: days, to: selected))
    }

    /// Выход на передний план и смена дня.
    public func refresh() async {
        rollOver()
        await load()
    }

    private func rollOver() {
        let current = calendar.key(now())
        guard current != today else { return }
        if selected == today { selected = current }
        today = current
    }

    /// Сохранённый день — сразу, затем свежий; без сети остаётся сохранённый
    /// с записями, правками и удалениями, ждущими отправки.
    public func load() async {
        generation += 1
        let started = generation
        let date = selected
        isLoading = true
        defer { if started == generation { isLoading = false } }
        let user = await userID()
        let pending = await pendingItems(user)
        guard started == generation else { return }
        restoreQueued(pending)
        if day == nil { hydrate(date: date, userID: user) }
        let endpoints = DiaryEndpoints(date: date)
        let reader = reader
        async let entriesAnswer = reader.fetch(DayEntries.self, endpoints.entries, userID: user)
        async let waterAnswer = reader.fetchOrCached(WaterDay.self, endpoints.water, userID: user)
        async let planAnswer = reader.fetchOrCached(WeeklyPlanAnswer.self, endpoints.plan, userID: user)
        async let targetsAnswer = reader.fetchOrCached(TargetsAnswer.self, endpoints.targets, userID: user)
        let loaded = await entriesAnswer
        let loadedWater = await waterAnswer
        let loadedPlan = await planAnswer
        let loadedTargets = await targetsAnswer
        let fresh = await pendingItems(user)
        guard started == generation else { return }
        restoreQueued(fresh)
        switch loaded {
        case let .success(value):
            day = value
            loadError = nil
            freshness.markFresh()
            await reconcileHealth(date, value)
        case let .failure(error):
            freshness.markFailed(error)
            if day == nil || error != .network { loadError = error }
        }
        if case let .success((value, _)) = loadedWater { water = WaterLedger.overlay(value, day: date, pending: fresh) }
        waterLedger?.set(water, day: date)
        if case let .success((value, _)) = loadedPlan { plan = value.plan }
        if case let .success((value, _)) = loadedTargets { targets = value }
        notifyTotals()
    }

    /// Открыт день: записи, сделанные в вебе или куратором, попадают в
    /// Здоровье, удалённые там — удаляются.
    private func reconcileHealth(_ date: String, _ entries: DayEntries) async {
        guard let health else { return }
        await health.reconcileDay(date, entries: entries.all.map(healthEntry))
    }

    func healthEntry(_ entry: FoodEntry) -> DiaryEntryForHealth {
        DiaryEntryForHealth(id: entry.id, date: moment(of: entry), name: entry.foodName,
                            kilocalories: entry.nutrition.calories, protein: entry.nutrition.protein,
                            fat: entry.nutrition.fat, carbohydrates: entry.nutrition.carbs)
    }

    private func moment(of entry: FoodEntry) -> Date {
        let midnight = calendar.date(entry.date) ?? now()
        let parts = entry.time.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return midnight.addingTimeInterval(12 * 3600) }
        return midnight.addingTimeInterval(TimeInterval(parts[0] * 3600 + parts[1] * 60))
    }

    private func notifyTotals() {
        onTotalsChanged?(selected, totals)
    }

    /// День изменился не через дневник («Съел» в «Меню»): показанный день
    /// перечитывается, другой — сверяется со Здоровьем.
    public func syncDay(_ day: String) async {
        if day == selected {
            await load()
            return
        }
        let user = await userID()
        guard health != nil,
              case let .success(entries) = await reader.fetch(DayEntries.self, DiaryEndpoints(date: day).entries, userID: user)
        else { return }
        await reconcileHealth(day, entries)
    }

    // MARK: Добавление

    /// Время записи: сейчас для сегодняшнего дня, иначе полдень.
    public func time(for date: String) -> String {
        date == calendar.key(now()) ? ClockText.hhmm(now(), calendar: calendar) : "12:00"
    }

    /// Добавить записи: сразу видны («ждёт отправки», пока сервер не принял),
    /// `POST /food-tracker/entries` — через очередь, по одному на запись.
    @discardableResult
    public func add(_ drafts: [EntryDraft]) async -> Bool {
        guard let outbox, let user = await userID() else { return false }
        var ids: [UUID] = []
        for draft in drafts {
            let body = NewEntryBody(foodId: draft.foodID, mealType: draft.meal, portionType: draft.portion.unit,
                                    portionAmount: draft.portion.amount, time: time(for: draft.date), date: draft.date,
                                    // Все пять переопределений, как веб: запись описана телом целиком
                                    // (и `ai-` продукт сервер заводит только по ним).
                                    foodName: draft.name, nutrition: draft.nutrition)
            guard let endpoint = try? Endpoint.post(Self.entriesPath, body: body),
                  let item = try? await outbox.enqueue(kind: Self.addKind, endpoint: endpoint, userID: user) else { continue }
            queued[item.id] = Self.entry(id: item.id, body: body)
            ids.append(item.id)
        }
        notifyTotals()
        await drain(user)
        return !ids.isEmpty
    }

    public func add(_ draft: EntryDraft) async {
        await add([draft])
    }

    static func entry(id: UUID, body: NewEntryBody) -> FoodEntry {
        FoodEntry(id: "local-\(id.uuidString.lowercased())", foodID: body.foodId, foodName: body.foodName ?? "",
                  mealType: body.mealType, portionType: body.portionType, portionAmount: body.portionAmount,
                  nutrition: Nutrition(calories: body.calories ?? 0, protein: body.protein ?? 0, fat: body.fat ?? 0,
                                       carbs: body.carbs ?? 0),
                  time: body.time, date: body.date)
    }

    /// Досылка: принятое снимается из «ждёт отправки», день перечитывается
    /// (у записи появляется настоящий id и она уходит в Здоровье).
    private func drain(_ user: Int64) async {
        guard let outbox else { return }
        let report = await outbox.drain(userID: user)
        var changed = false
        for id in report.delivered where queued[id] != nil {
            queued[id] = nil
            changed = true
        }
        for id in report.rejected where queued[id] != nil {
            queued[id] = nil
            changed = true
            notice = "Запись не сохранилась. Проверьте порцию и попробуйте ещё раз."
        }
        if !report.rejected.isEmpty && notice == nil {
            notice = "Не удалось сохранить изменение. Попробуйте ещё раз."
        }
        if changed || !report.delivered.isEmpty { await load() } else { notifyTotals() }
    }

    func forgetQueued(_ id: UUID) {
        queued[id] = nil
    }

    /// Общая вода изменилась (в том числе на «Сегодня»).
    public func applyWater(day: String, _ value: WaterDay) {
        guard day == selected else { return }
        water = value
    }

    /// Досылка по возвращению сети или переднему плану.
    public func flush() async {
        guard let user = await userID() else { return }
        await drain(user)
    }

    // MARK: Правка

    /// Правка записи: приём, порция, время, название, КБЖУ → `PUT`.
    public func update(_ entry: FoodEntry) async {
        if let queuedID = Self.queuedID(entry.id) {
            // Ещё не отправлена: прежнее изменение снимается, новое ставится
            // вместо него — на сервер уйдёт только итог правки.
            await outbox?.discard(queuedID)
            queued[queuedID] = nil
            await add([EntryDraft(foodID: entry.foodID ?? "", name: entry.foodName, meal: entry.mealType, date: entry.date,
                                  portion: Portion(unit: entry.portionType, amount: entry.portionAmount),
                                  nutrition: entry.nutrition)])
            return
        }
        guard let outbox, let user = await userID() else { return }
        replaceLocally(entry)
        pendingEdited[entry.id] = EntryUpdateBody(entry: entry)
        if let endpoint = try? Endpoint.put("/api/v1/food-tracker/entries/\(entry.id)", body: EntryUpdateBody(entry: entry)) {
            _ = try? await outbox.enqueue(kind: "diary.update", endpoint: endpoint, userID: user)
        }
        await health?.write(healthEntry(entry))
        notifyTotals()
        await drain(user)
    }

    private func replaceLocally(_ entry: FoodEntry) {
        guard var current = day else { return }
        for meal in MealType.allCases {
            current.entries[meal]?.removeAll { $0.id == entry.id }
        }
        if entry.date == selected {
            current.entries[entry.mealType, default: []].append(entry)
            current.entries[entry.mealType]?.sort { $0.time < $1.time }
        }
        day = current
    }

    // MARK: Удаление с отменой

    /// Свайп «Удалить»: запись пропадает сразу, `DELETE` уходит через 5 с,
    /// если не нажато «Отменить». Новое удаление завершает предыдущее.
    public func delete(_ entry: FoodEntry) async {
        if let previous = deletion {
            deletionTask?.cancel()
            await commitDeletion(previous.entry)
        }
        deletion = DiaryDeletion(entry: entry)
        notifyTotals()
        deletionTask = Task { [weak self, sleeper] in
            do {
                try await sleeper.sleep(for: Self.undoWindow)
            } catch {
                return
            }
            guard let self, self.deletion?.entry.id == entry.id else { return }
            await self.commitDeletion(entry)
        }
    }

    /// «Отменить» в течение 5 с: запись на месте, запроса нет.
    public func undoDelete() {
        deletionTask?.cancel()
        deletionTask = nil
        deletion = nil
        notifyTotals()
    }

    /// Окно отмены закрылось (или экран ушёл): удалить сейчас.
    public func commitPendingDeletion() async {
        guard let pending = deletion else { return }
        deletionTask?.cancel()
        await commitDeletion(pending.entry)
    }

    /// `local-<uuid>` записи, ждущей отправки, → id изменения в очереди.
    static func queuedID(_ entryID: String) -> UUID? {
        guard entryID.hasPrefix("local-") else { return nil }
        return UUID(uuidString: String(entryID.dropFirst("local-".count)))
    }

    private func commitDeletion(_ entry: FoodEntry) async {
        if deletion?.entry.id == entry.id { deletion = nil }
        if let queuedID = Self.queuedID(entry.id) {
            // Сервер о записи не знает: снять из очереди, `DELETE` не нужен.
            await outbox?.discard(queuedID)
            queued[queuedID] = nil
            notifyTotals()
            return
        }
        if var current = day {
            for meal in MealType.allCases { current.entries[meal]?.removeAll { $0.id == entry.id } }
            day = current
        }
        pendingDeleted.insert(entry.id)
        notifyTotals()
        guard let outbox, let user = await userID() else { return }
        _ = try? await outbox.enqueue(kind: "diary.delete", endpoint: .delete("/api/v1/food-tracker/entries/\(entry.id)"),
                                      userID: user)
        await health?.delete(entryID: entry.id)
        await drain(user)
    }

    /// Ожидание окна отмены — для тестов.
    public func waitForDeletion() async {
        await deletionTask?.value
    }

    // MARK: Повтор и своё

    /// «Повторить сегодня»: та же еда и порция в сегодняшнем дне.
    public func repeatToday(_ entry: FoodEntry) async {
        let today = calendar.key(now())
        let draft = EntryDraft(foodID: entry.foodID ?? "", name: entry.foodName, meal: entry.mealType, date: today,
                               portion: Portion(unit: entry.portionType, amount: entry.portionAmount),
                               nutrition: entry.nutrition)
        await add([draft])
        notice = "Добавлено в сегодняшний \(entry.mealType.accusative)."
    }

    /// «Сохранить как своё»: продукт записи — в «Мои продукты».
    public func saveAsOwn(_ entry: FoodEntry) async {
        guard let source = entry.foodID, !source.isEmpty else { return }
        struct Body: Encodable, Sendable {
            let sourceFoodID: String
            let name: String
            enum CodingKeys: String, CodingKey {
                case name
                case sourceFoodID = "source_food_id"
            }
        }
        do {
            let endpoint = try Endpoint.post("/api/v1/food-tracker/user-foods/clone",
                                             body: Body(sourceFoodID: source, name: entry.foodName))
            let _: UserFood = try await api.send(endpoint)
            notice = "«\(entry.foodName)» сохранено в ваших продуктах."
        } catch {
            notice = "Не получилось сохранить продукт. Попробуйте ещё раз."
        }
    }

    // MARK: Вода

    /// «−» и «+»: счётчик сразу, `POST /water` с `glasses: ±1` через очередь.
    public func changeWater(by delta: Int) async {
        if let waterLedger {
            if waterLedger.water(selected) == nil { waterLedger.set(water, day: selected) }
            guard let (report, current) = await waterLedger.change(day: selected, by: delta, kind: "diary.water") else { return }
            water = current
            if let report, !report.rejected.isEmpty { notice = "Не удалось сохранить изменение. Попробуйте ещё раз." }
            return
        }
        guard var current = water, current.enabled, delta == 1 || delta == -1 else { return }
        guard current.glasses + delta >= 0 else { return }
        current.glasses += delta
        water = current
        await health?.setWater(day: selected, glasses: current.glasses, glassMilliliters: Double(current.glassSize), at: now())
        guard let outbox, let user = await userID(),
              let endpoint = try? Endpoint.post("/api/v1/food-tracker/water", body: WaterBody(date: selected, glasses: delta))
        else { return }
        _ = try? await outbox.enqueue(kind: "diary.water", endpoint: endpoint, userID: user)
        await drain(user)
    }
}

/// Всё, что рисует «Дневник», — без сети и часов; его же собирают снапшоты.
public struct DiaryScreenState: Sendable, Equatable {
    public struct MealGroup: Sendable, Equatable, Identifiable {
        public let meal: MealType
        public let rows: [DiaryRow]
        public var id: String { meal.rawValue }

        /// «320 ккал» или «—».
        public var total: String {
            rows.isEmpty ? "—" : "\(NumberText.grouped(rows.reduce(0) { $0 + $1.entry.nutrition.calories }.jsRounded)) ккал"
        }
    }

    public let selected: String
    public let today: String
    public let calendar: DayCalendar
    public let day: DayEntries?
    public let rows: [MealType: [DiaryRow]]
    public let water: WaterDay?
    public let plan: WeeklyPlan?
    public let targets: TargetsAnswer?
    public let loaded: Bool

    public init(selected: String, today: String, calendar: DayCalendar, day: DayEntries?, rows: [MealType: [DiaryRow]],
                water: WaterDay?, plan: WeeklyPlan?, targets: TargetsAnswer?, loaded: Bool) {
        self.selected = selected
        self.today = today
        self.calendar = calendar
        self.day = day
        self.rows = rows
        self.water = water
        self.plan = plan
        self.targets = targets
        self.loaded = loaded
    }

    /// «Сегодня, 17 октября», «Вчера, 16 октября», «Среда, 15 октября».
    public var dayLabel: String {
        let date = DayText.dayMonth(selected)
        if selected == today { return "Сегодня, \(date)" }
        if selected == calendar.adding(days: -1, to: today) { return "Вчера, \(date)" }
        if selected == calendar.adding(days: 1, to: today) { return "Завтра, \(date)" }
        let full = DayText.full(selected, calendar: calendar)
        return full.prefix(1).uppercased() + full.dropFirst()
    }

    public var canGoForward: Bool { selected < today }

    public var meals: [MealGroup] {
        MealType.allCases.map { MealGroup(meal: $0, rows: rows[$0] ?? []) }
    }

    public var totals: Nutrition {
        rows.values.joined().reduce(.zero) { $0 + $1.entry.nutrition }
    }

    /// Итог дня теми же правилами, что «Питание» на «Сегодня».
    public var summary: NutritionSummary {
        let eaten = totals
        let metrics = DailyMetrics(date: selected, calories: eaten.calories.jsRounded, protein: eaten.protein.jsRounded,
                                   fat: eaten.fat.jsRounded, carbs: eaten.carbs.jsRounded)
        return NutritionSummary(day: metrics, plan: plan, targets: targets)
    }

    /// «План куратора» / «Рассчитано автоматически» и «+210 ккал за тренировку».
    public var normSource: String? {
        guard let norm = summary.norm else { return nil }
        let base = norm.source == .curator ? "План куратора" : "Рассчитано автоматически"
        if norm.source == .calculated, let bonus = targets?.targets?.workoutBonus, bonus >= 1 {
            return "\(base) · +\(NumberText.grouped(bonus.jsRounded)) ккал за тренировку"
        }
        return base
    }

    /// «5 из 8 · 250 мл»; без цели куратора — строки нет.
    public var waterLine: String? {
        guard let water, water.enabled else { return nil }
        return "\(water.glasses) из \(water.goal) · \(water.glassSize) мл"
    }
}

extension Double {
    /// Округление, как `Math.round` в вебе.
    public var jsRounded: Int { NumberText.jsRound(self) }
}
