import Foundation

/// Что приложение читает из Здоровья (`healthkit-client`).
public enum HealthReadKind: String, Codable, CaseIterable, Sendable {
    case steps
    case weight
    case workouts
}

/// Взвешивание из Здоровья (`bodyMass`).
public struct WeightSample: Equatable, Sendable {
    public let id: UUID
    public let date: Date
    public let kilograms: Double

    public init(id: UUID = UUID(), date: Date, kilograms: Double) {
        self.id = id
        self.date = date
        self.kilograms = kilograms
    }
}

/// Тренировка из Здоровья (`HKWorkout`).
public struct WorkoutSample: Equatable, Sendable {
    public let id: UUID
    public let start: Date
    /// Активная длительность (`HKWorkout.duration`, без пауз), секунды.
    public let duration: TimeInterval
    /// Имя случая `HKWorkoutActivityType` (`running`, `traditionalStrengthTraining`…);
    /// в наш код вида его переводит сервер.
    public let activity: String

    public init(id: UUID, start: Date, duration: TimeInterval, activity: String) {
        self.id = id
        self.start = start
        self.duration = duration
        self.activity = activity
    }
}

/// Изменения одного вида данных с сохранённого якоря (`HKAnchoredObjectQuery`).
public struct HealthChanges: Equatable, Sendable {
    /// Моменты начала новых образцов шагов. Сами образцы не нужны: сумма
    /// дня берётся из статистики Здоровья, а не складывается из образцов.
    public var stepDates: [Date]
    public var weights: [WeightSample]
    public var workouts: [WorkoutSample]
    public var deletedWorkouts: [UUID]
    /// Новый якорь (`HKQueryAnchor`, заархивированный адаптером).
    public var anchor: Data?

    public init(stepDates: [Date] = [], weights: [WeightSample] = [], workouts: [WorkoutSample] = [],
                deletedWorkouts: [UUID] = [], anchor: Data? = nil) {
        self.stepDates = stepDates
        self.weights = weights
        self.workouts = workouts
        self.deletedWorkouts = deletedWorkouts
        self.anchor = anchor
    }
}

/// Запись дневника, как она уходит в Здоровье: `HKCorrelation(.food)`.
public struct FoodSample: Equatable, Sendable {
    /// `HKMetadataKeySyncIdentifier`, `entry:<id>`.
    public let syncIdentifier: String
    /// `HKMetadataKeySyncVersion`: каждая правка — на единицу больше.
    public let version: Int
    public let date: Date
    public let name: String?
    public let kilocalories: Double
    public let protein: Double
    public let fat: Double
    public let carbohydrates: Double

    public init(syncIdentifier: String, version: Int, date: Date, name: String?, kilocalories: Double,
                protein: Double, fat: Double, carbohydrates: Double) {
        self.syncIdentifier = syncIdentifier
        self.version = version
        self.date = date
        self.name = name
        self.kilocalories = kilocalories
        self.protein = protein
        self.fat = fat
        self.carbohydrates = carbohydrates
    }
}

/// Стакан воды: `dietaryWater`.
public struct WaterSample: Equatable, Sendable {
    /// `water:<дата>:<номер стакана>`.
    public let syncIdentifier: String
    public let version: Int
    public let date: Date
    public let milliliters: Double

    public init(syncIdentifier: String, version: Int, date: Date, milliliters: Double) {
        self.syncIdentifier = syncIdentifier
        self.version = version
        self.date = date
        self.milliliters = milliliters
    }
}

/// Здоровье за протоколом: на устройстве — `HKHealthStore`
/// (`HealthKitStore`), в тестах — подделка.
///
/// Чтения образцов шагов здесь нет намеренно: телефон и часы пишут шаги за
/// одно и то же время, и правильную сумму дня даёт только статистика
/// Здоровья (`HKStatisticsCollectionQuery`, `.cumulativeSum`).
public protocol HealthStore: Sendable {
    /// Здоровье есть на устройстве (на iPad его нет).
    var isAvailable: Bool { get }

    /// Системный запрос разрешений. Отказ на чтение Здоровье не сообщает.
    func requestAuthorization() async throws

    /// Суммы шагов по дням `[start, end)`: ключ — начало суток в `timeZone`.
    /// Дни без шагов в словаре отсутствуют.
    func dailyStepTotals(from start: Date, to end: Date, timeZone: TimeZone) async throws -> [Date: Double]

    /// Взвешивания в `[start, end)`.
    func weights(from start: Date, to end: Date) async throws -> [WeightSample]

    /// Новое и удалённое с якоря; без якоря — всё не раньше `notBefore`.
    func changes(of kind: HealthReadKind, since anchor: Data?, notBefore: Date) async throws -> HealthChanges

    /// `HKObserverQuery` с фоновой доставкой на каждый вид. `onChange`
    /// вызывается и в фоне; адаптер вызывает completion handler Здоровья
    /// после его завершения.
    func startObserving(_ onChange: @escaping @Sendable (HealthReadKind) async -> Void) async throws

    /// Останавливает наблюдателей и `disableAllBackgroundDelivery`.
    func stopObserving() async

    /// Сохраняет корреляцию еды; прежний образец с тем же идентификатором
    /// синхронизации заменяется.
    func save(_ food: FoodSample) async throws

    func save(_ water: WaterSample) async throws

    /// Удаляет образцы еды или воды с этим идентификатором синхронизации.
    func deleteSamples(syncIdentifier: String) async throws
}
