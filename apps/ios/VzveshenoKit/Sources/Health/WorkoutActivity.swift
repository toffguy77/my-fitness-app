import Foundation

/// Имена случаев `HKWorkoutActivityType`, которые приложение отправляет как
/// есть в поле `type`; в наш код вида их переводит сервер
/// (`healthWorkoutTypes` в `health_import.go`), незнакомые — в `other`.
///
/// `HKWorkoutActivityType` — перечисление Objective-C: `String(describing:)`
/// даёт число, а не имя. Поэтому имена перечислены явно, адаптер
/// `HealthKitStore` сопоставляет им случаи, а тесты сверяют список с
/// серверной таблицей.
public enum WorkoutActivity {
    /// Вид без своего имени в списке.
    public static let other = "other"

    public static let names: [String] = [
        // Есть в таблице сервера.
        "traditionalStrengthTraining",
        "functionalStrengthTraining",
        "running",
        "cycling",
        "swimming",
        "yoga",
        "flexibility",
        "highIntensityIntervalTraining",
        "elliptical",
        "rowing",
        "stairClimbing",
        "stairs",
        "stepTraining",
        "mixedCardio",
        // Частые виды, которые сервер пока считает «Другим»: имя уходит
        // как есть, чтобы таблицу можно было расширить без выпуска приложения.
        "walking",
        "hiking",
        "pilates",
        "coreTraining",
        "crossTraining",
        "cooldown",
        "boxing",
        "kickboxing",
        "martialArts",
        "jumpRope",
        "tennis",
        "soccer",
        "basketball",
        "volleyball",
        "skatingSports",
        "crossCountrySkiing",
        "downhillSkiing",
        "snowboarding",
        "climbing",
        "golf",
        "handCycling",
        "wheelchairRunPace",
        "wheelchairWalkPace",
        "mindAndBody",
        "barre",
        "socialDance",
        "cardioDance",
        "swimBikeRun",
        "paddleSports",
        "surfingSports",
        "waterFitness",
    ]
}
