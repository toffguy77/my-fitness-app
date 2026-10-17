import Foundation
@testable import Health
import TestSupport
import XCTest

/// 4.2: построитель записей импорта на фикстурах образцов Здоровья.
final class HealthRecordBuilderTests: XCTestCase {
    private let moscow = TimeZone(identifier: "Europe/Moscow")!
    private var builder: HealthRecordBuilder { HealthRecordBuilder(timeZone: moscow) }

    private func at(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    private func json(_ items: [HealthImportItem]) throws -> [[String: Any]] {
        let data = try JSONEncoder.api.encode(HealthImportBatch(items: items))
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return object?["items"] as? [[String: Any]] ?? []
    }

    // Сценарий «Телефон и часы»: телефон 4 000, часы 5 000, из них 3 000 в
    // одно время. Сумма дня — та, что дала статистика Здоровья (6 000),
    // а не сумма образцов (9 000): образцов шагов построитель не видит вовсе.
    func testPhoneAndWatchStepsUseStatisticsTotal() throws {
        let day = builder.profile.startOfDay(at("2026-10-16T12:00:00Z"))
        let items = builder.stepItems(days: [day], totals: [day: 6_000], includeZero: false)
        XCTAssertEqual(items, [.steps(date: "2026-10-16", value: 6_000)])
        XCTAssertEqual(try json(items).first?["value"] as? Double, 6_000)
    }

    func testStepsZeroOnlyForChangedDays() {
        let day = builder.profile.startOfDay(at("2026-10-16T12:00:00Z"))
        XCTAssertEqual(builder.stepItems(days: [day], totals: [:], includeZero: false), [])
        XCTAssertEqual(builder.stepItems(days: [day], totals: [:], includeZero: true), [.steps(date: "2026-10-16", value: 0)])
    }

    // Сценарий «Утреннее взвешивание»: самое раннее взвешивание даты профиля.
    func testEarliestWeightOfProfileDay() {
        let samples = [
            WeightSample(date: at("2026-10-17T18:00:00Z"), kilograms: 79.6),   // 21:00 МСК
            WeightSample(date: at("2026-10-17T04:42:00Z"), kilograms: 78.4),   // 07:42 МСК
            WeightSample(date: at("2026-10-17T04:40:00Z"), kilograms: 14.2),   // ребёнок на весах
            // 01:30 МСК 17-го — по поясу устройства (UTC) это ещё 16-е.
            WeightSample(date: at("2026-10-16T22:30:00Z"), kilograms: 81.0),
            WeightSample(date: at("2026-10-16T05:00:00Z"), kilograms: 78.9),
        ]
        let items = builder.weightItems(for: ["2026-10-16", "2026-10-17"], samples: samples)
        XCTAssertEqual(items, [
            .weight(date: "2026-10-16", kilograms: 78.9),
            .weight(date: "2026-10-17", kilograms: 81.0),
        ])
        let morning = builder.weightItems(for: ["2026-10-17"], samples: Array(samples.prefix(3)))
        XCTAssertEqual(morning, [.weight(date: "2026-10-17", kilograms: 78.4)],
                       "вес вне 20–500 кг пропускается, ранним становится следующее взвешивание")
    }

    func testWeightOnlyForRequestedDates() {
        let samples = [WeightSample(date: at("2026-10-15T05:00:00Z"), kilograms: 79)]
        XCTAssertEqual(builder.weightItems(for: ["2026-10-17"], samples: samples), [])
    }

    // Тренировка и её удаление — поля как в контракте сервера.
    func testWorkoutAndDeletionMatchServerContract() throws {
        let workoutID = UUID(uuidString: "0B7D2C3E-9A11-4E59-8C9E-2B8D7F1A0C11")!
        let deletedID = UUID(uuidString: "6F1E4A2B-3C5D-4E6F-8A9B-0C1D2E3F4A5B")!
        let workout = WorkoutSample(id: workoutID, start: at("2026-10-16T21:30:00Z"), duration: 45 * 60 + 20,
                                    activity: "traditionalStrengthTraining")
        let items = builder.workoutItems(added: [workout], deleted: [deletedID])
        let encoded = try json(items)
        XCTAssertEqual(encoded.count, 2)
        XCTAssertEqual(encoded[0]["kind"] as? String, "workout")
        XCTAssertEqual(encoded[0]["external_id"] as? String, workoutID.uuidString)
        XCTAssertEqual(encoded[0]["date"] as? String, "2026-10-17", "дата — день начала в поясе профиля")
        XCTAssertEqual(encoded[0]["started_at"] as? String, "2026-10-16T21:30:00Z")
        XCTAssertEqual(encoded[0]["type"] as? String, "traditionalStrengthTraining")
        XCTAssertEqual(encoded[0]["duration_min"] as? Double, 45)
        XCTAssertEqual(Set(encoded[1].keys), ["kind", "external_id"])
        XCTAssertEqual(encoded[1]["kind"] as? String, "workout_deleted")
        XCTAssertEqual(encoded[1]["external_id"] as? String, deletedID.uuidString)
    }

    func testWorkoutOutsideServerRangeIsNotSent() {
        let short = WorkoutSample(id: UUID(), start: at("2026-10-16T08:00:00Z"), duration: 20, activity: "running")
        let endless = WorkoutSample(id: UUID(), start: at("2026-10-16T08:00:00Z"), duration: 11 * 3600, activity: "hiking")
        XCTAssertEqual(builder.workoutItems(added: [short, endless], deleted: []), [])
    }

    func testWeightAndStepsFieldsMatchServerContract() throws {
        let encoded = try json([.steps(date: "2026-10-16", value: 6412), .weight(date: "2026-10-16", kilograms: 78.4049)])
        XCTAssertEqual(Set(encoded[0].keys), ["kind", "date", "value"])
        XCTAssertEqual(Set(encoded[1].keys), ["kind", "date", "value_kg"])
        XCTAssertEqual(encoded[1]["value_kg"] as? Double, 78.4)
    }

    /// Каждое имя `HKWorkoutActivityType` из серверной таблицы приложение
    /// умеет назвать: иначе силовая ушла бы как `other`.
    func testServerWorkoutTableNamesAreKnown() throws {
        let source = try RepositoryFiles.read("apps/api/internal/modules/dashboard/health_import.go")
        guard let start = source.range(of: "var healthWorkoutTypes = map[string]string{"),
              let ours = source.range(of: "// Наши коды.", range: start.upperBound..<source.endIndex) else {
            return XCTFail("нет таблицы healthWorkoutTypes в health_import.go")
        }
        let table = source[start.upperBound..<ours.lowerBound]
        let regex = try NSRegularExpression(pattern: #""(\w+)":\s*"\w+""#)
        let text = String(table)
        let names = regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap {
            Range($0.range(at: 1), in: text).map { String(text[$0]) }
        }
        XCTAssertGreaterThanOrEqual(names.count, 10)
        let known = Set(WorkoutActivity.names)
        for name in names {
            XCTAssertTrue(known.contains(name), "сервер знает \(name), приложение — нет")
        }
    }

    func testChunkingKeepsOrderAndLimit() {
        let items = (0..<1_234).map { HealthImportItem.steps(date: "2026-01-01", value: $0 + 1) }
        let chunks = HealthImportLimits.chunk(items)
        XCTAssertEqual(chunks.map(\.count), [500, 500, 234])
        XCTAssertEqual(chunks.flatMap { $0 }, items)
        XCTAssertEqual(HealthImportLimits.chunk([]), [])
    }
}
