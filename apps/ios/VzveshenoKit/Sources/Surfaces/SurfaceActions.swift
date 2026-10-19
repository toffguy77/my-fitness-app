import API
import Foundation
import Outbox
import Session

/// Всё, чем действие без приложения (виджет, Пункт управления, голос)
/// пользуется: снимок, общая очередь, сессия из Keychain и перезагрузка
/// виджетов.
public struct SurfaceContext: Sendable {
    public let snapshots: SnapshotRepository
    public let outbox: Outbox
    public let reloader: WidgetReloading
    /// Вошедший сейчас — по Keychain; `nil` — никто.
    public let sessionUser: @Sendable () -> SessionUser?
    public let now: @Sendable () -> Date

    public init(snapshots: SnapshotRepository, outbox: Outbox, reloader: WidgetReloading,
                sessionUser: @escaping @Sendable () -> SessionUser?, now: @escaping @Sendable () -> Date = { Date() }) {
        self.snapshots = snapshots
        self.outbox = outbox
        self.reloader = reloader
        self.sessionUser = sessionUser
        self.now = now
    }

    /// Аккаунт, от имени которого можно действовать: сессия в Keychain и
    /// снимок того же аккаунта. Без снимка не действуем: после переустановки
    /// Keychain хранит сессию прежней установки, а приложение ещё не
    /// запускалось и её не проверило.
    func account() -> (user: SessionUser, snapshot: DaySnapshot)? {
        guard let user = sessionUser(), let snapshot = SurfaceAccess.visible(snapshots.load(), sessionUserID: user.id) else {
            return nil
        }
        return (user, snapshot)
    }

    /// Сегодня по поясу профиля — из снимка, а не телефона.
    func today(_ snapshot: DaySnapshot) -> String {
        SurfaceCalendar.dayKey(now(), in: snapshot.zone)
    }

    /// Попытка отправить очередь сейчас — с текущим access-токеном, без
    /// обновления. Без сети и с просроченным токеном изменение остаётся в
    /// очереди, его дошлёт приложение. `true` — изменение `id` доставлено.
    func trySending(_ id: UUID, userID: Int64) async -> Bool {
        let report = await outbox.drain(userID: userID)
        return report.delivered.contains(id)
    }
}

/// Итог «Добавить стакан воды».
public enum WaterOutcome: Equatable, Sendable {
    case signedOut
    case wrongRole
    case disabled
    /// Записано: стаканов за сегодня и цель (если снимок сегодняшний),
    /// отправлено ли сразу.
    case added(glasses: Int?, goal: Int?, delivered: Bool)

    public var dialog: String {
        switch self {
        case .signedOut: return SurfaceDialogs.signedOut
        case .wrongRole: return SurfaceDialogs.clientsOnly
        case .disabled: return "Куратор пока не задал цель по воде"
        case let .added(glasses?, goal?, _): return "Записано: \(glasses) \(SurfaceText.ofGlasses(goal))"
        case .added: return "Стакан воды записан"
        }
    }
}

public enum SurfaceDialogs {
    public static let signedOut = "Откройте Взвешено и войдите в аккаунт"
    public static let clientsOnly = "Это действие доступно клиентам"
}

/// «Добавить стакан воды» без открытия приложения (`ios-controls`).
///
/// 1. Вода в снимке +1 — виджет показывает её сразу.
/// 2. Изменение — в общую очередь со своим `Idempotency-Key`: каждое
///    нажатие — отдельный стакан, повтор отправки того же нажатия сервер не
///    засчитает второй раз.
/// 3. Попытка отправить; без сети или с просроченным токеном изменение ждёт
///    приложение (передний план, фоновое обновление, появление сети).
public struct AddWaterAction: Sendable {
    public let context: SurfaceContext

    public init(context: SurfaceContext) {
        self.context = context
    }

    public func perform() async -> WaterOutcome {
        guard let (user, snapshot) = context.account() else { return .signedOut }
        guard snapshot.isClient else { return .wrongRole }
        guard let water = snapshot.water, water.enabled else { return .disabled }
        let today = context.today(snapshot)
        var counts: (Int, Int)?
        if snapshot.date == today {
            var updated = snapshot
            updated.water?.glasses = water.glasses + 1
            updated.updatedAt = context.now()
            try? context.snapshots.save(updated)
            context.reloader.reloadAllTimelines()
            counts = (water.glasses + 1, water.goal)
        }
        guard let endpoint = try? Endpoint.post("/api/v1/food-tracker/water", body: WaterRequest(date: today, glasses: 1)),
              let item = try? await context.outbox.enqueue(kind: PendingWater.kind, endpoint: endpoint, userID: user.id) else {
            return .added(glasses: counts?.0, goal: counts?.1, delivered: false)
        }
        let delivered = await context.trySending(item.id, userID: user.id)
        return .added(glasses: counts?.0, goal: counts?.1, delivered: delivered)
    }
}

/// Вес голосом (`ios-app-intents`): 20–500 кг, один знак после запятой.
///
/// Нижняя граница — 20, а не 0,1, как в ручном вводе: голос ошибается в
/// разряде («семьдесят восемь» → «7,8»), и такой вес испортил бы тренд. Та же
/// граница у импорта из Здоровья и у цели веса.
public enum VoiceWeight {
    public static let range: ClosedRange<Double> = 20...500
    public static let outOfRange = "Вес — от 20 до 500 кг. Назовите вес ещё раз"

    /// Значение с одним знаком после запятой или `nil` вне границ.
    public static func normalized(_ value: Double) -> Double? {
        guard value.isFinite else { return nil }
        let rounded = (value * 10).rounded() / 10
        return range.contains(rounded) ? rounded : nil
    }
}

/// Итог «Запиши вес».
public enum WeightOutcome: Equatable, Sendable {
    case signedOut
    case wrongRole
    case outOfRange
    case logged(kilograms: Double, delivered: Bool)

    public var dialog: String {
        switch self {
        case .signedOut: return SurfaceDialogs.signedOut
        case .wrongRole: return SurfaceDialogs.clientsOnly
        case .outOfRange: return VoiceWeight.outOfRange
        case let .logged(kilograms, _): return "Записала \(SurfaceText.oneDecimal(kilograms)) кг"
        }
    }
}

/// «Запиши вес»: за сегодня по поясу профиля через очередь
/// (`POST /dashboard/daily`, тип `weight`).
public struct LogWeightAction: Sendable {
    public let context: SurfaceContext

    public init(context: SurfaceContext) {
        self.context = context
    }

    public func perform(kilograms raw: Double) async -> WeightOutcome {
        guard let (user, snapshot) = context.account() else { return .signedOut }
        guard snapshot.isClient else { return .wrongRole }
        guard let kilograms = VoiceWeight.normalized(raw) else { return .outOfRange }
        let body = WeightRequest(date: context.today(snapshot), metric: .init(type: "weight", data: .init(weight: kilograms)))
        guard let endpoint = try? Endpoint.post("/api/v1/dashboard/daily", body: body),
              let item = try? await context.outbox.enqueue(kind: "surface.weight", endpoint: endpoint, userID: user.id) else {
            return .logged(kilograms: kilograms, delivered: false)
        }
        let delivered = await context.trySending(item.id, userID: user.id)
        return .logged(kilograms: kilograms, delivered: delivered)
    }
}

/// Тело `POST /api/v1/dashboard/daily` с весом.
struct WeightRequest: Encodable, Sendable {
    struct Metric: Encodable, Sendable {
        struct Data: Encodable, Sendable {
            let weight: Double
        }
        let type: String
        let data: Data
    }
    let date: String
    let metric: Metric
}
