#if canImport(HealthKit) && os(iOS)
import Foundation
import HealthKit

/// Здоровье на устройстве: `HKHealthStore` за протоколом `HealthStore`.
///
/// Логика — в `HealthSync` и `HealthRecordBuilder` (проверяются на Linux);
/// здесь только запросы к HealthKit.
public final class HealthKitStore: HealthStore, @unchecked Sendable { // HKHealthStore потокобезопасен
    private let store = HKHealthStore()
    private let lock = NSLock()
    private var observers: [HKObserverQuery] = []

    public init() {}

    public var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    // MARK: Типы

    static var stepType: HKQuantityType { HKQuantityType(.stepCount) }
    static var weightType: HKQuantityType { HKQuantityType(.bodyMass) }
    static var workoutType: HKWorkoutType { HKObjectType.workoutType() }
    static var waterType: HKQuantityType { HKQuantityType(.dietaryWater) }
    static var foodType: HKCorrelationType { HKCorrelationType(.food) }
    static var nutrients: [(HKQuantityTypeIdentifier, HKUnit)] { [
        (.dietaryEnergyConsumed, .kilocalorie()),
        (.dietaryProtein, .gram()),
        (.dietaryFatTotal, .gram()),
        (.dietaryCarbohydrates, .gram()),
    ] }

    /// Читаем шаги, вес и тренировки.
    public static var readTypes: Set<HKObjectType> { [stepType, weightType, workoutType] }

    /// Пишем еду и воду. Вес — никогда: он приходит из Здоровья, и запись
    /// обратно задваивала бы взвешивания (`healthkit-client`). Корреляцию
    /// `.food` HealthKit не разрешает запрашивать — только её составляющие.
    public static var shareTypes: Set<HKSampleType> {
        Set(nutrients.map { HKQuantityType($0.0) } + [waterType])
    }

    public func requestAuthorization() async throws {
        try await store.requestAuthorization(toShare: Self.shareTypes, read: Self.readTypes)
    }

    // MARK: Чтение

    public func dailyStepTotals(from start: Date, to end: Date, timeZone: TimeZone) async throws -> [Date: Double] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: Self.stepType, predicate: predicate),
            options: .cumulativeSum,
            anchorDate: calendar.startOfDay(for: start),
            intervalComponents: DateComponents(day: 1)
        )
        let collection = try await descriptor.result(for: store)
        var totals: [Date: Double] = [:]
        for statistics in collection.statistics() {
            if let sum = statistics.sumQuantity()?.doubleValue(for: .count()) {
                totals[statistics.startDate] = sum
            }
        }
        return totals
    }

    public func weights(from start: Date, to end: Date) async throws -> [WeightSample] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: Self.weightType, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        return try await descriptor.result(for: store).map {
            WeightSample(id: $0.uuid, date: $0.startDate, kilograms: $0.quantity.doubleValue(for: .gramUnit(with: .kilo)))
        }
    }

    public func changes(of kind: HealthReadKind, since anchor: Data?, notBefore: Date) async throws -> HealthChanges {
        let queryAnchor = anchor.flatMap { try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: $0) }
        // Без якоря — первая загрузка: не глубже `notBefore`.
        let window = queryAnchor == nil
            ? HKQuery.predicateForSamples(withStart: notBefore, end: nil, options: .strictStartDate)
            : nil
        switch kind {
        case .steps:
            let descriptor = HKAnchoredObjectQueryDescriptor(
                predicates: [.quantitySample(type: Self.stepType, predicate: window)], anchor: queryAnchor)
            let result = try await descriptor.result(for: store)
            return HealthChanges(stepDates: result.addedSamples.map(\.startDate), anchor: Self.archive(result.newAnchor))
        case .weight:
            let descriptor = HKAnchoredObjectQueryDescriptor(
                predicates: [.quantitySample(type: Self.weightType, predicate: window)], anchor: queryAnchor)
            let result = try await descriptor.result(for: store)
            let weights = result.addedSamples.map {
                WeightSample(id: $0.uuid, date: $0.startDate, kilograms: $0.quantity.doubleValue(for: .gramUnit(with: .kilo)))
            }
            return HealthChanges(weights: weights, anchor: Self.archive(result.newAnchor))
        case .workouts:
            let descriptor = HKAnchoredObjectQueryDescriptor(predicates: [.workout(window)], anchor: queryAnchor)
            let result = try await descriptor.result(for: store)
            let workouts = result.addedSamples.map {
                WorkoutSample(id: $0.uuid, start: $0.startDate, duration: $0.duration,
                              activity: Self.activityName($0.workoutActivityType))
            }
            return HealthChanges(workouts: workouts, deletedWorkouts: result.deletedObjects.map(\.uuid),
                                 anchor: Self.archive(result.newAnchor))
        }
    }

    private static func archive(_ anchor: HKQueryAnchor) -> Data? {
        try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
    }

    // MARK: Наблюдение

    /// Обработчик завершения наблюдателя — замыкание HealthKit без `Sendable`;
    /// вызывается один раз, когда загрузка поставлена в очередь и отправлена.
    private struct Completion: @unchecked Sendable {
        let call: () -> Void
    }

    public func startObserving(_ onChange: @escaping @Sendable (HealthReadKind) async -> Void) async throws {
        await stopObserving()
        // design.md: вес и тренировки — сразу, шаги — раз в час.
        let plan: [(HealthReadKind, HKSampleType, HKUpdateFrequency)] = [
            (.steps, Self.stepType, .hourly),
            (.weight, Self.weightType, .immediate),
            (.workouts, Self.workoutType, .immediate),
        ]
        for (kind, type, frequency) in plan {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completionHandler, error in
                let completion = Completion(call: completionHandler)
                guard error == nil else {
                    completion.call()
                    return
                }
                Task {
                    await onChange(kind)
                    completion.call()
                }
            }
            store.execute(query)
            lock.withLock { observers.append(query) }
            try await store.enableBackgroundDelivery(for: type, frequency: frequency)
        }
    }

    public func stopObserving() async {
        let running = lock.withLock {
            let current = observers
            observers = []
            return current
        }
        for query in running {
            store.stop(query)
        }
        try? await store.disableAllBackgroundDelivery()
    }

    // MARK: Запись

    public func save(_ food: FoodSample) async throws {
        // Прежняя версия убирается целиком, вместе с составляющими: иначе
        // правка оставила бы в Здоровье калории старой записи.
        try await deleteSamples(syncIdentifier: food.syncIdentifier)
        let values: [Double] = [food.kilocalories, food.protein, food.fat, food.carbohydrates]
        let objects: Set<HKSample> = Set(zip(Self.nutrients, values).compactMap { nutrient, value -> HKSample? in
            guard value > 0 else { return nil }
            return HKQuantitySample(type: HKQuantityType(nutrient.0), quantity: HKQuantity(unit: nutrient.1, doubleValue: value),
                                    start: food.date, end: food.date,
                                    metadata: [HKMetadataKeyExternalUUID: food.syncIdentifier])
        })
        guard !objects.isEmpty else { return }
        var metadata: [String: Any] = [
            HKMetadataKeySyncIdentifier: food.syncIdentifier,
            HKMetadataKeySyncVersion: food.version,
        ]
        if let name = food.name, !name.isEmpty {
            metadata[HKMetadataKeyFoodType] = name
        }
        let correlation = HKCorrelation(type: Self.foodType, start: food.date, end: food.date, objects: objects,
                                        metadata: metadata)
        try await store.save(correlation)
    }

    public func save(_ water: WaterSample) async throws {
        let sample = HKQuantitySample(
            type: Self.waterType,
            quantity: HKQuantity(unit: .literUnit(with: .milli), doubleValue: water.milliliters),
            start: water.date, end: water.date,
            metadata: [HKMetadataKeySyncIdentifier: water.syncIdentifier, HKMetadataKeySyncVersion: water.version]
        )
        try await store.save(sample)
    }

    public func deleteSamples(syncIdentifier: String) async throws {
        let bySync = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier,
                                                 allowedValues: [syncIdentifier])
        if syncIdentifier.hasPrefix("water:") {
            _ = try await store.deleteObjects(of: Self.waterType, predicate: bySync)
            return
        }
        let byEntry = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID,
                                                  allowedValues: [syncIdentifier])
        for (identifier, _) in Self.nutrients {
            _ = try await store.deleteObjects(of: HKQuantityType(identifier), predicate: byEntry)
        }
        _ = try? await store.deleteObjects(of: Self.foodType, predicate: bySync)
    }

    // MARK: Виды тренировок

    /// Имя случая для сервера; неизвестное — `other`.
    static func activityName(_ type: HKWorkoutActivityType) -> String {
        activityNames[type] ?? WorkoutActivity.other
    }

    /// Случаи `HKWorkoutActivityType` для имён `WorkoutActivity.names`.
    /// Тест на симуляторе сверяет, что каждое имя здесь есть.
    static let activityNames: [HKWorkoutActivityType: String] = [
        .traditionalStrengthTraining: "traditionalStrengthTraining",
        .functionalStrengthTraining: "functionalStrengthTraining",
        .running: "running",
        .cycling: "cycling",
        .swimming: "swimming",
        .yoga: "yoga",
        .flexibility: "flexibility",
        .highIntensityIntervalTraining: "highIntensityIntervalTraining",
        .elliptical: "elliptical",
        .rowing: "rowing",
        .stairClimbing: "stairClimbing",
        .stairs: "stairs",
        .stepTraining: "stepTraining",
        .mixedCardio: "mixedCardio",
        .walking: "walking",
        .hiking: "hiking",
        .pilates: "pilates",
        .coreTraining: "coreTraining",
        .crossTraining: "crossTraining",
        .cooldown: "cooldown",
        .boxing: "boxing",
        .kickboxing: "kickboxing",
        .martialArts: "martialArts",
        .jumpRope: "jumpRope",
        .tennis: "tennis",
        .soccer: "soccer",
        .basketball: "basketball",
        .volleyball: "volleyball",
        .skatingSports: "skatingSports",
        .crossCountrySkiing: "crossCountrySkiing",
        .downhillSkiing: "downhillSkiing",
        .snowboarding: "snowboarding",
        .climbing: "climbing",
        .golf: "golf",
        .handCycling: "handCycling",
        .wheelchairRunPace: "wheelchairRunPace",
        .wheelchairWalkPace: "wheelchairWalkPace",
        .mindAndBody: "mindAndBody",
        .barre: "barre",
        .socialDance: "socialDance",
        .cardioDance: "cardioDance",
        .swimBikeRun: "swimBikeRun",
        .paddleSports: "paddleSports",
        .surfingSports: "surfingSports",
        .waterFitness: "waterFitness",
    ]
}
#endif
