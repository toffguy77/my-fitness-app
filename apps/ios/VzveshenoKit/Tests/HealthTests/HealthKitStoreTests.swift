#if canImport(HealthKit) && os(iOS)
@testable import Health
import HealthKit
import XCTest

/// Адаптер HealthKit — только на симуляторе в CI.
final class HealthKitStoreTests: XCTestCase {
    /// Каждое имя из `WorkoutActivity.names` (их сверяют с таблицей сервера)
    /// адаптер умеет получить из `HKWorkoutActivityType`.
    func testEveryKnownActivityNameHasACase() {
        let mapped = Set(HealthKitStore.activityNames.values)
        for name in WorkoutActivity.names {
            XCTAssertTrue(mapped.contains(name), "нет случая HKWorkoutActivityType для \(name)")
        }
        XCTAssertEqual(HealthKitStore.activityName(.running), "running")
        XCTAssertEqual(HealthKitStore.activityName(.traditionalStrengthTraining), "traditionalStrengthTraining")
        XCTAssertEqual(HealthKitStore.activityName(.fishing), WorkoutActivity.other)
    }

    /// Вес в Здоровье не пишется никогда: он оттуда приходит.
    func testWritesFoodAndWaterButNeverBodyMass() {
        let share = HealthKitStore.shareTypes
        XCTAssertFalse(share.contains(HKQuantityType(.bodyMass)))
        XCTAssertTrue(share.contains(HKQuantityType(.dietaryWater)))
        XCTAssertTrue(share.contains(HKQuantityType(.dietaryEnergyConsumed)))
        XCTAssertEqual(HealthKitStore.readTypes, [HKQuantityType(.stepCount), HKQuantityType(.bodyMass),
                                                  HKObjectType.workoutType()])
    }
}
#endif
