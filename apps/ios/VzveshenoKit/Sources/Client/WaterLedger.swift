import API
import Foundation
import Observation
import Outbox

/// Вода вошедшего клиента по дням — одна на «Сегодня» и «Дневник».
///
/// Раньше у каждого экрана был свой счётчик: «+» в дневнике не менял
/// карточку «Сегодня», а Здоровье получало число стаканов того экрана,
/// который нажали, даже если оно уже устарело. Теперь оба читают и меняют
/// воду здесь: изменение — сразу и через очередь, Здоровье получает итог
/// общего счётчика.
@MainActor
@Observable
public final class WaterLedger {
    public private(set) var days: [String: WaterDay] = [:]

    private let outbox: Outbox?
    private let userID: @Sendable () async -> Int64?
    private let now: @Sendable () -> Date
    @ObservationIgnored public var health: FoodHealthWriter?
    /// Вода изменилась — снимок виджетов и прочие наблюдатели.
    @ObservationIgnored public var onChanged: (@MainActor (_ day: String, _ water: WaterDay) -> Void)?

    public init(outbox: Outbox?, health: FoodHealthWriter? = nil, now: @escaping @Sendable () -> Date = { Date() },
                userID: @escaping @Sendable () async -> Int64?) {
        self.outbox = outbox
        self.health = health
        self.now = now
        self.userID = userID
    }

    public func water(_ day: String) -> WaterDay? { days[day] }

    /// Ответ сервера (уже с ждущими отправки стаканами) или сохранённый.
    public func set(_ water: WaterDay?, day: String) {
        guard let water, days[day] != water else { return }
        days[day] = water
        onChanged?(day, water)
    }

    /// «+» и «−»: счётчик сразу, Здоровью — итог, `POST /water` с `±1` — через
    /// очередь с `Idempotency-Key`. `nil` — не изменилось (нет цели, ниже нуля).
    @discardableResult
    public func change(day: String, by delta: Int, kind: String) async -> (DrainReport?, WaterDay)? {
        guard var current = days[day], current.enabled, delta == 1 || delta == -1, current.glasses + delta >= 0 else {
            return nil
        }
        current.glasses += delta
        days[day] = current
        onChanged?(day, current)
        await health?.setWater(day: day, glasses: current.glasses, glassMilliliters: Double(current.glassSize), at: now())
        guard let outbox, let user = await userID(),
              let endpoint = try? Endpoint.post("/api/v1/food-tracker/water", body: WaterBody(date: day, glasses: delta)),
              (try? await outbox.enqueue(kind: kind, endpoint: endpoint, userID: user)) != nil else {
            return (nil, current)
        }
        return (await outbox.drain(userID: user), current)
    }

    /// Ждущие отправки стаканы поверх ответа сервера.
    static func overlay(_ water: WaterDay?, day: String, pending: [OutboxItem]) -> WaterDay? {
        guard var water else { return nil }
        for change in pending.compactMap(PendingChange.of) {
            if case let .water(date, delta) = change, date == day { water.glasses = max(0, water.glasses + delta) }
        }
        return water
    }
}
