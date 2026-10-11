import Foundation
import HealthKit

/// Связь с Apple Здоровьем.
///
/// Читаем то, что телефон и часы знают лучше человека: шаги, вес, активную
/// энергию. Пишем то, что человек ведёт у нас: съеденное и воду — чтобы
/// Здоровье и другие приложения видели полную картину дня.
///
/// Каждая запись в Здоровье помечена идентификатором записи дневника
/// (`HKMetadataKeyExternalUUID`): удаление в дневнике убирает её и оттуда, а
/// повторная запись того же идентификатора не задваивает калории.
final class HealthService: @unchecked Sendable { // HKHealthStore потокобезопасен
    static let shared = HealthService()

    private let store = HKHealthStore()

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Включено ли человеком в профиле. Разрешения Здоровья — отдельно: их
    /// iOS спрашивает один раз, и отказ приложение не видит (только пустые данные).
    static var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "health.enabled") }
        set { UserDefaults.standard.set(newValue, forKey: "health.enabled") }
    }

    private static let readTypes: Set<HKObjectType> = [
        HKQuantityType(.stepCount),
        HKQuantityType(.bodyMass),
        HKQuantityType(.activeEnergyBurned),
        HKObjectType.workoutType(),
    ]

    private static let nutritionTypes: [HKQuantityTypeIdentifier] = [
        .dietaryEnergyConsumed, .dietaryProtein, .dietaryFatTotal, .dietaryCarbohydrates,
    ]

    private static let writeTypes: Set<HKSampleType> = Set(
        nutritionTypes.map { HKQuantityType($0) } + [HKQuantityType(.dietaryWater), HKQuantityType(.bodyMass)]
    )

    func requestAuthorization() async throws {
        guard Self.isAvailable else { return }
        try await store.requestAuthorization(toShare: Self.writeTypes, read: Self.readTypes)
    }

    // MARK: - Чтение

    /// Сумма шагов за календарный день — с учётом дублей iPhone и часов
    /// (statistics query их сводит, простая сумма образцов — нет).
    func steps(on day: Date) async -> Int? {
        guard Self.isAvailable else { return nil }
        let value = await sum(.stepCount, unit: .count(), on: day)
        return value.map { Int($0.rounded()) }
    }

    func activeEnergy(on day: Date) async -> Double? {
        await sum(.activeEnergyBurned, unit: .kilocalorie(), on: day)
    }

    /// Последнее взвешивание не позже конца дня.
    func latestWeight(onOrBefore day: Date) async -> Double? {
        guard Self.isAvailable else { return nil }
        let end = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: day))!
        let predicate = HKQuery.predicateForSamples(withStart: nil, end: end)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.bodyMass), predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
            limit: 1)
        let samples = try? await descriptor.result(for: store)
        return samples?.first?.quantity.doubleValue(for: .gramUnit(with: .kilo))
    }

    /// Взвешивание именно в этот день — последнее из сделанных. Вес за
    /// прошлые дни в дневник дня не переносим: это был бы другой день.
    func weightMeasured(on day: Date) async -> Double? {
        guard Self.isAvailable else { return nil }
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.bodyMass), predicate: dayPredicate(day))],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
            limit: 1)
        let samples = try? await descriptor.result(for: store)
        return samples?.first?.quantity.doubleValue(for: .gramUnit(with: .kilo))
    }

    /// Была ли за день хотя бы одна тренировка.
    func hasWorkout(on day: Date) async -> Bool {
        guard Self.isAvailable else { return false }
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.workout(dayPredicate(day))],
            sortDescriptors: [],
            limit: 1)
        return ((try? await descriptor.result(for: store))?.isEmpty == false)
    }

    private func sum(_ id: HKQuantityTypeIdentifier, unit: HKUnit, on day: Date) async -> Double? {
        let descriptor = HKStatisticsQueryDescriptor(
            predicate: .quantitySample(type: HKQuantityType(id), predicate: dayPredicate(day)),
            options: .cumulativeSum)
        guard let stats = try? await descriptor.result(for: store) else { return nil }
        return stats.sumQuantity()?.doubleValue(for: unit)
    }

    private func dayPredicate(_ day: Date) -> NSPredicate {
        let start = Calendar.current.startOfDay(for: day)
        let end = Calendar.current.date(byAdding: .day, value: 1, to: start)!
        return HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    }

    // MARK: - Запись

    /// Записывает съеденное. Время — время записи в дневнике в выбранный день.
    func saveNutrition(entryID: String, day: Date, time: String, macros: Macros, name: String) async {
        guard Self.isEnabled, Self.isAvailable else { return }
        await deleteSamples(externalID: entryID)
        let date = Self.date(day, time: time)
        let metadata: [String: Any] = [
            HKMetadataKeyExternalUUID: entryID,
            HKMetadataKeyFoodType: name,
        ]
        let values: [(HKQuantityTypeIdentifier, HKUnit, Double)] = [
            (.dietaryEnergyConsumed, .kilocalorie(), macros.calories),
            (.dietaryProtein, .gram(), macros.protein),
            (.dietaryFatTotal, .gram(), macros.fat),
            (.dietaryCarbohydrates, .gram(), macros.carbs),
        ]
        let samples = values.filter { $0.2 > 0 }.map { id, unit, value in
            HKQuantitySample(type: HKQuantityType(id), quantity: HKQuantity(unit: unit, doubleValue: value),
                             start: date, end: date, metadata: metadata)
        }
        try? await store.save(samples)
    }

    func deleteNutrition(entryID: String) async {
        guard Self.isEnabled, Self.isAvailable else { return }
        await deleteSamples(externalID: entryID)
    }

    func saveWater(milliliters: Double, at date: Date = Date()) async {
        guard Self.isEnabled, Self.isAvailable, milliliters > 0 else { return }
        let sample = HKQuantitySample(type: HKQuantityType(.dietaryWater),
                                      quantity: HKQuantity(unit: .literUnit(with: .milli), doubleValue: milliliters),
                                      start: date, end: date)
        try? await store.save(sample)
    }

    func saveWeight(kilograms: Double, at date: Date = Date()) async {
        guard Self.isEnabled, Self.isAvailable, kilograms > 0 else { return }
        let sample = HKQuantitySample(type: HKQuantityType(.bodyMass),
                                      quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kilograms),
                                      start: date, end: date)
        try? await store.save(sample)
    }

    private func deleteSamples(externalID: String) async {
        let predicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID,
                                                    allowedValues: [externalID])
        for id in Self.nutritionTypes {
            _ = try? await store.deleteObjects(of: HKQuantityType(id), predicate: predicate)
        }
    }

    /// День из дневника + время «15:04» → момент в часовом поясе устройства.
    static func date(_ day: Date, time: String) -> Date {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        let start = Calendar.current.startOfDay(for: day)
        guard parts.count == 2 else { return start }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: start) ?? start
    }
}
