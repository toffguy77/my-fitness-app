import API
import Foundation
import Outbox

/// Запись дневника для Здоровья.
public struct DiaryEntryForHealth: Equatable, Sendable {
    public let id: String
    /// Момент приёма пищи.
    public let date: Date
    public let name: String?
    public let kilocalories: Double
    public let protein: Double
    public let fat: Double
    public let carbohydrates: Double

    public init(id: String, date: Date, name: String?, kilocalories: Double, protein: Double, fat: Double,
                carbohydrates: Double) {
        self.id = id
        self.date = date
        self.name = name
        self.kilocalories = kilocalories
        self.protein = protein
        self.fat = fat
        self.carbohydrates = carbohydrates
    }

    /// `HKMetadataKeySyncIdentifier` записи (`design.md`).
    public var syncIdentifier: String { "entry:\(id)" }

    var fingerprint: String {
        [date.timeIntervalSince1970, kilocalories, protein, fat, carbohydrates].map { String($0) }.joined(separator: "|")
            + "|" + (name ?? "")
    }
}

/// Обмен со Здоровьем (`healthkit-client`): подключение, чтение в очередь
/// импорта, запись еды и воды, отключение.
///
/// Всё, что уходит на сервер, идёт через очередь (`ios-offline-outbox`):
/// `PUT /users/settings {apple_health_enabled}` ставится раньше первой пачки,
/// и порядок очереди гарантирует, что сервер увидит признак до импорта.
public actor HealthSync {
    /// Досылка очереди аккаунта, чьё это подключение.
    public typealias Drain = @Sendable (Int64) async -> Void

    /// Виды изменений в очереди.
    public static let importKind = "health.import"
    public static let settingsKind = "health.settings"
    public static let settingsPath = "/api/v1/users/settings"

    private let store: HealthStore
    private let outbox: Outbox
    private let stateStore: HealthStateStore
    private let now: @Sendable () -> Date
    private let drain: Drain
    private var state: HealthState
    private var chain: Task<Void, Never>?

    public init(store: HealthStore, outbox: Outbox, stateStore: HealthStateStore,
                now: @escaping @Sendable () -> Date = { Date() }, drain: @escaping Drain) {
        self.store = store
        self.outbox = outbox
        self.stateStore = stateStore
        self.now = now
        self.drain = drain
        state = stateStore.load()
    }

    public var isAvailable: Bool { store.isAvailable }
    public var isConnected: Bool { state.connected }
    public var currentState: HealthState { state }

    /// Подсказка о потерянном доступе для «Сегодня».
    public func showsAccessHint() -> Bool {
        HealthAccessHint.shouldShow(state, now: now())
    }

    /// Часовой пояс профиля (`/users/profile → settings.timezone`).
    public func setTimeZone(_ identifier: String) {
        guard TimeZone(identifier: identifier) != nil, identifier != state.timeZoneID else { return }
        state.timeZoneID = identifier
        persist()
    }

    // MARK: Подключение

    /// «Продолжить» на экране подключения: системный запрос, затем признак
    /// на сервере, наблюдатели и первая загрузка за 90 дней.
    ///
    /// Возвращает `false`, если Здоровья на устройстве нет.
    @discardableResult
    public func connect(userID: Int64) async throws -> Bool {
        guard store.isAvailable else { return false }
        try await store.requestAuthorization()
        try await enqueueSettings(enabled: true, userID: userID)

        var fresh = HealthState()
        fresh.timeZoneID = state.timeZoneID
        fresh.written = state.userID == userID ? state.written : [:]
        fresh.connected = true
        fresh.userID = userID
        fresh.connectedAt = now()
        state = fresh
        persist()

        try? await store.startObserving(observerHandler())
        await sync(HealthReadKind.allCases)
        await drainQueue()
        return true
    }

    /// Выключение в профиле: наблюдатели и фоновая доставка остановлены,
    /// признак снят, запись прекращена. Записанное в Здоровье остаётся там.
    public func disconnect() async {
        guard state.connected else { return }
        await store.stopObserving()
        let userID = state.userID
        state.connected = false
        state.anchors = [:]
        state.connectedAt = nil
        state.lastDataAt = nil
        persist()
        if let userID {
            try? await enqueueSettings(enabled: false, userID: userID)
        }
        await drainQueue()
    }

    /// Запуск приложения, в том числе фоновый по событию Здоровья:
    /// наблюдатели живут только до конца процесса и регистрируются заново.
    public func resume(userID: Int64?) async {
        guard state.connected else { return }
        guard let userID, userID == state.userID else {
            // Подключение другого аккаунта: его данные этому не отправляются.
            await erase()
            return
        }
        try? await store.startObserving(observerHandler())
        await sync(HealthReadKind.allCases)
        await drainQueue()
    }

    /// Выход на передний план: забрать пропущенное фоновой доставкой.
    public func refresh() async {
        guard state.connected else { return }
        await sync(HealthReadKind.allCases)
        await drainQueue()
    }

    /// Выход из аккаунта.
    public func erase() async {
        await store.stopObserving()
        stateStore.erase()
        state = HealthState()
    }

    private func observerHandler() -> @Sendable (HealthReadKind) async -> Void {
        { [weak self] kind in
            guard let self else { return }
            await self.sync([kind])
            await self.drainQueue()
        }
    }

    private func drainQueue() async {
        guard let userID = state.userID else { return }
        await drain(userID)
    }

    private func enqueueSettings(enabled: Bool, userID: Int64) async throws {
        let endpoint = try Endpoint.put(Self.settingsPath, body: ["apple_health_enabled": enabled])
        try await outbox.enqueue(kind: Self.settingsKind, endpoint: endpoint, userID: userID)
    }

    // MARK: Чтение

    /// Забирает изменения с сохранённых якорей и ставит пачки импорта в
    /// очередь. Проходы идут по одному: два события Здоровья подряд не
    /// прочитают один якорь дважды.
    public func sync(_ kinds: [HealthReadKind]) async {
        let previous = chain
        let task = Task { await previous?.value; await self.performSync(kinds) }
        chain = task
        await task.value
    }

    private func performSync(_ kinds: [HealthReadKind]) async {
        guard state.connected, let userID = state.userID else { return }
        let builder = HealthRecordBuilder(timeZone: state.timeZone)
        let moment = now()
        let window = SyncWindow(builder: builder, cutoff: builder.profile.backfillStart(now: moment), now: moment)
        let cutoff = window.cutoff
        var items: [HealthImportItem] = []
        var anchors: [HealthReadKind: Data] = [:]

        for kind in kinds {
            let anchor = state.anchors[kind]
            guard let changes = try? await store.changes(of: kind, since: anchor, notBefore: cutoff),
                  let built = await buildItems(for: kind, changes: changes, initial: anchor == nil, window: window) else {
                continue
            }
            items += built
            if let next = changes.anchor { anchors[kind] = next }
        }

        // Пока шёл запрос к Здоровью, человек мог отключить его или выйти.
        guard state.connected, state.userID == userID else { return }
        do {
            for chunk in HealthImportLimits.chunk(items) {
                let endpoint = try Endpoint.post(HealthImportLimits.path, body: HealthImportBatch(items: chunk))
                try await outbox.enqueue(kind: Self.importKind, endpoint: endpoint, userID: userID)
            }
        } catch {
            // Якоря не сдвигаются: следующий проход прочитает то же заново.
            return
        }
        state.anchors.merge(anchors) { $1 }
        if items.contains(where: \.carriesStepsOrWeight) {
            state.lastDataAt = moment
        }
        persist()
    }

    /// Сутки профиля и границы прохода.
    private struct SyncWindow {
        let builder: HealthRecordBuilder
        /// Начало первой загрузки — 90 дней назад.
        let cutoff: Date
        let now: Date
    }

    /// Записи одного вида; `nil` — Здоровье не ответило, якорь не двигается.
    private func buildItems(for kind: HealthReadKind, changes: HealthChanges, initial: Bool,
                            window: SyncWindow) async -> [HealthImportItem]? {
        let builder = window.builder
        let cutoff = window.cutoff
        let now = window.now
        let profile = builder.profile
        switch kind {
        case .steps:
            let today = profile.startOfDay(now)
            let days: [Date] = initial
                ? profile.days(from: cutoff, through: now)
                : Array(Set(changes.stepDates.map(profile.startOfDay))).filter { $0 <= today }
            guard let first = days.min(), let last = days.max() else { return [] }
            guard let totals = try? await store.dailyStepTotals(from: first, to: profile.day(after: last),
                                                                 timeZone: profile.timeZone) else {
                return nil
            }
            return builder.stepItems(days: days, totals: totals, includeZero: !initial)
        case .weight:
            let fresh = changes.weights.filter { !initial || $0.date >= cutoff }
            guard let first = fresh.map(\.date).min(), let last = fresh.map(\.date).max() else { return [] }
            guard let samples = try? await store.weights(from: profile.startOfDay(first), to: profile.day(after: last)) else {
                return nil
            }
            return builder.weightItems(for: Set(fresh.map { profile.dateString($0.date) }), samples: samples)
        case .workouts:
            let added = changes.workouts.filter { !initial || $0.start >= cutoff }
            return builder.workoutItems(added: added, deleted: initial ? [] : changes.deletedWorkouts)
        }
    }

    // MARK: Запись

    /// Запись дневника → корреляция еды. Правка — новая версия того же
    /// идентификатора синхронизации; без изменений — ничего.
    public func write(_ entry: DiaryEntryForHealth) async {
        guard state.connected else { return }
        let id = entry.syncIdentifier
        let fingerprint = entry.fingerprint
        let previous = state.written[id]
        guard previous?.fingerprint != fingerprint else { return }
        let version = (previous?.version ?? 0) + 1
        let sample = FoodSample(syncIdentifier: id, version: version, date: entry.date, name: entry.name,
                                kilocalories: entry.kilocalories, protein: entry.protein, fat: entry.fat,
                                carbohydrates: entry.carbohydrates)
        do {
            try await store.save(sample)
        } catch {
            return
        }
        state.written[id] = WrittenSample(version: version, fingerprint: fingerprint,
                                          day: ProfileCalendar(timeZone: state.timeZone).dateString(entry.date))
        persist()
    }

    /// Удаление записи дневника удаляет её корреляцию.
    public func delete(entryID: String) async {
        guard state.connected else { return }
        await remove("entry:\(entryID)")
    }

    /// Открыт день дневника: записи, сделанные в вебе или куратором,
    /// попадают в Здоровье, а удалённые там — удаляются.
    public func reconcileDay(_ day: String, entries: [DiaryEntryForHealth]) async {
        guard state.connected else { return }
        for entry in entries {
            await write(entry)
        }
        let present = Set(entries.map(\.syncIdentifier))
        let stale = state.written.filter { $0.value.day == day && $0.key.hasPrefix("entry:") && !present.contains($0.key) }
        for id in stale.keys.sorted() {
            await remove(id)
        }
    }

    /// Вода дня: по образцу `dietaryWater` на стакан. Убранный стакан
    /// удаляется, у оставшихся время не переписывается.
    public func setWater(day: String, glasses: Int, glassMilliliters: Double, at date: Date) async {
        guard state.connected, glasses >= 0, glassMilliliters > 0 else { return }
        let prefix = "water:\(day):"
        let fingerprint = String(glassMilliliters)
        if glasses > 0 {
            for index in 1...glasses {
                let id = prefix + String(index)
                let previous = state.written[id]
                guard previous?.fingerprint != fingerprint else { continue }
                let version = (previous?.version ?? 0) + 1
                do {
                    try await store.save(WaterSample(syncIdentifier: id, version: version, date: date,
                                                     milliliters: glassMilliliters))
                } catch {
                    continue
                }
                state.written[id] = WrittenSample(version: version, fingerprint: fingerprint, day: day)
            }
            persist()
        }
        let extra = state.written.keys.filter { id in
            id.hasPrefix(prefix) && (Int(id.dropFirst(prefix.count)) ?? 0) > glasses
        }
        for id in extra.sorted() {
            await remove(id)
        }
    }

    private func remove(_ syncIdentifier: String) async {
        do {
            try await store.deleteSamples(syncIdentifier: syncIdentifier)
        } catch {
            return
        }
        state.written[syncIdentifier] = nil
        persist()
    }

    private func persist() {
        try? stateStore.save(state)
    }
}
