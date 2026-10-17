import Foundation

/// Здоровье в памяти: тесты и сценарии UI-тестов, где настоящего HealthKit
/// нет или его системный запрос нельзя показывать.
///
/// Шаги задаются готовыми суммами дня — так же, как их отдаёт статистика
/// Здоровья; образцы шагов здесь, как и в `HealthStore`, не складываются.
public final class InMemoryHealthStore: HealthStore, @unchecked Sendable {
    private let lock = NSLock()
    private var _available: Bool
    private var _authorizationRequests = 0
    private var _observing = false
    private var _backgroundDeliveryDisabled = 0
    private var _stepTotals: [Date: Double] = [:]
    private var _weights: [WeightSample] = []
    private var _deletedWorkouts: [UUID] = []
    /// Журнал изменений: якорь — номер последней прочитанной записи.
    private var journal: [(generation: Int, change: Change)] = []
    private var _food: [String: FoodSample] = [:]
    private var _water: [String: WaterSample] = [:]
    private var _generation = 0
    private var onChange: (@Sendable (HealthReadKind) async -> Void)?

    private enum Change {
        case step(Date)
        case weight(WeightSample)
        case workout(WorkoutSample)
        case deletedWorkout(UUID)
    }

    public init(available: Bool = true) {
        _available = available
    }

    // MARK: Наполнение

    /// Сумма шагов за сутки, начинающиеся в `day`, и момент нового образца.
    public func setSteps(_ total: Double, day: Date, sampleAt: Date? = nil) {
        lock.withLock {
            _stepTotals[day] = total
            record(.step(sampleAt ?? day))
        }
    }

    public func addWeight(_ sample: WeightSample) {
        lock.withLock {
            _weights.append(sample)
            record(.weight(sample))
        }
    }

    public func addWorkout(_ workout: WorkoutSample) {
        lock.withLock {
            record(.workout(workout))
        }
    }

    public func deleteWorkout(_ id: UUID) {
        lock.withLock {
            _deletedWorkouts.append(id)
            record(.deletedWorkout(id))
        }
    }

    private func record(_ change: Change) {
        _generation += 1
        journal.append((_generation, change))
    }

    // MARK: Наблюдение за подделкой

    public var authorizationRequests: Int { lock.withLock { _authorizationRequests } }
    public var isObserving: Bool { lock.withLock { _observing } }
    public var backgroundDeliveryDisabledCount: Int { lock.withLock { _backgroundDeliveryDisabled } }
    public var food: [String: FoodSample] { lock.withLock { _food } }
    public var water: [String: WaterSample] { lock.withLock { _water } }

    /// Событие наблюдателя, как от фоновой доставки.
    public func fire(_ kind: HealthReadKind) async {
        let handler = lock.withLock { _observing ? onChange : nil }
        await handler?(kind)
    }

    // MARK: HealthStore

    public var isAvailable: Bool { lock.withLock { _available } }

    public func requestAuthorization() async throws {
        lock.withLock { _authorizationRequests += 1 }
    }

    public func dailyStepTotals(from start: Date, to end: Date, timeZone: TimeZone) async throws -> [Date: Double] {
        lock.withLock { _stepTotals.filter { $0.key >= start && $0.key < end } }
    }

    public func weights(from start: Date, to end: Date) async throws -> [WeightSample] {
        lock.withLock { _weights.filter { $0.date >= start && $0.date < end } }
    }

    /// Якорь — номер поколения: всё, что добавлено после него, — новое.
    public func changes(of kind: HealthReadKind, since anchor: Data?, notBefore: Date) async throws -> HealthChanges {
        lock.withLock {
            let since = anchor.flatMap { String(bytes: $0, encoding: .utf8) }.flatMap { Int($0) }
            let next = Data(String(_generation).utf8)
            let entries = journal.filter { $0.generation > (since ?? 0) }
            var changes = HealthChanges(anchor: next)
            for entry in entries {
                switch (kind, entry.change) {
                case let (.steps, .step(date)) where since != nil || date >= notBefore:
                    changes.stepDates.append(date)
                case let (.weight, .weight(sample)) where since != nil || sample.date >= notBefore:
                    changes.weights.append(sample)
                case let (.workouts, .workout(workout)) where since != nil || workout.start >= notBefore:
                    changes.workouts.append(workout)
                case let (.workouts, .deletedWorkout(id)) where since != nil:
                    changes.deletedWorkouts.append(id)
                default:
                    break
                }
            }
            if since == nil {
                // Без якоря удалённое не приходит, а удалённые тренировки не
                // приходят и как добавленные.
                let deleted = Set(_deletedWorkouts)
                changes.workouts.removeAll { deleted.contains($0.id) }
            }
            return changes
        }
    }

    public func startObserving(_ onChange: @escaping @Sendable (HealthReadKind) async -> Void) async throws {
        lock.withLock {
            self.onChange = onChange
            _observing = true
        }
    }

    public func stopObserving() async {
        lock.withLock {
            onChange = nil
            _observing = false
            _backgroundDeliveryDisabled += 1
        }
    }

    public func save(_ food: FoodSample) async throws {
        lock.withLock { _food[food.syncIdentifier] = food }
    }

    public func save(_ water: WaterSample) async throws {
        lock.withLock { _water[water.syncIdentifier] = water }
    }

    public func deleteSamples(syncIdentifier: String) async throws {
        lock.withLock {
            _food[syncIdentifier] = nil
            _water[syncIdentifier] = nil
        }
    }
}
