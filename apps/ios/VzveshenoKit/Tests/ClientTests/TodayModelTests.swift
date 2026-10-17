import API
@testable import Client
import Foundation
import Outbox
import TestSupport
import XCTest

/// Модель «Сегодня»: загрузка, выбор дня, вода, смена дня, без опроса
/// (задачи 2.2–2.4).
@MainActor
final class TodayModelTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)

    /// 17 октября 2025, 12:00 по Москве.
    nonisolated private static let friday = Date(timeIntervalSince1970: 1_760_691_600)

    nonisolated static func server(water: String = #"{"glasses":5,"goal":8,"glass_size":250,"enabled":true}"#) -> StubTransport {
        StubTransport { request in
            switch request.path {
            case let path where path.hasPrefix("/api/v1/dashboard/daily/"):
                let date = String(path.suffix(10))
                return .success(#"{"id":"x","user_id":7,"date":"\#(date)T00:00:00Z","calories":549,"protein":76,"fat":49,"carbs":18,"steps":6412,"workout_completed":false,"steps_source":"healthkit","weight_source":null,"workout_source":null}"#)
            case "/api/v1/dashboard/week": return .success(#"{"metrics":[],"count":0}"#)
            case "/api/v1/dashboard/weekly-plan": return .success(#"{"plan":null}"#)
            case "/api/v1/nutrition-calc/targets":
                return .success(#"{"id":1,"date":"2025-10-17","calories":2472,"protein":125,"fat":80,"carbs":230,"#
                                + #""workout_bonus":0,"source":"calculated"}"#)
            case "/api/v1/food-tracker/water":
                return request.method == "POST" ? .success(#"{"glasses":6,"goal":8,"glass_size":250,"enabled":true}"#) : .success(water)
            case "/api/v1/dashboard/tasks": return .success(#"{"tasks":[],"count":0,"week":0}"#)
            case "/api/v1/dashboard/onboarding":
                return .success(#"{"active":false,"steps":[],"curator":null,"curator_access":{"allowed":false,"expired":false}}"#)
            case "/api/v1/dashboard/progress": return .success(#"{"weight_trend":[],"nutrition_adherence":0,"target_weight":null}"#)
            case "/api/v1/nutrition-calc/history": return .success(#"{"days":[]}"#)
            case "/api/v1/notifications/unread-counts": return .success(#"{"main":2,"content":1}"#)
            case "/api/v1/dashboard/daily":
                return .success(#"{"id":"x","date":"2025-10-17","calories":0,"steps":0,"workout_completed":false}"#)
            default: return .error(404, code: "not_found")
            }
        }
    }

    private func makeModel(_ transport: StubTransport, now: @escaping @Sendable () -> Date = { TodayModelTests.friday })
        -> (TodayModel, Outbox) {
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api)
        let model = TodayModel(api: api, outbox: outbox, calendar: calendar, now: now, userID: { 7 })
        return (model, outbox)
    }

    func testLoadsTheDayAndComputesTheCard() async {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        XCTAssertEqual(model.selected, "2025-10-17")
        XCTAssertEqual(model.nutrition?.headline, "1\u{00A0}923")
        XCTAssertEqual(model.snapshot?.unread?.total, 3)
        XCTAssertEqual(model.title, "Сегодня")
        XCTAssertEqual(model.subtitle, "пятница, 17 октября")
        XCTAssertEqual(transport.requests(to: "/api/v1/dashboard/week").first?.query, "start=2025-10-13&end=2025-10-19")
    }

    /// «Цель по воде не задана» — карточки нет.
    func testNoWaterCardWithoutGoal() async {
        let (model, _) = makeModel(Self.server(water: #"{"glasses":0,"goal":8,"glass_size":250,"enabled":false}"#))
        await model.load()
        XCTAssertNil(WaterCard(water: model.snapshot?.water))
    }

    /// «Стакан воды»: счётчик сразу, POST с Idempotency-Key.
    func testGlassOfWaterIsOptimisticAndIdempotent() async throws {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        var written: [Int] = []
        model.onWaterChanged = { _, glasses, _ in written.append(glasses) }

        await model.addGlass()

        XCTAssertEqual(model.snapshot?.water?.glasses, 6)
        XCTAssertEqual(written, [6])
        let post = try XCTUnwrap(transport.requests(to: "/api/v1/food-tracker/water").first { $0.method == "POST" })
        XCTAssertNotNil(UUID(uuidString: post.header("Idempotency-Key") ?? ""), "ключ повтора — UUID")
        XCTAssertEqual(post.json?["date"] as? String, "2025-10-17")
        XCTAssertEqual(post.json?["glasses"] as? Int, 1)
    }

    /// «Выбор среды»: карточки за среду, заголовок — дата среды.
    func testSelectingWednesdayReloadsTheCards() async {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        await model.select("2025-10-15")
        XCTAssertEqual(model.snapshot?.day.day, "2025-10-15")
        XCTAssertEqual(model.title, "15 октября")
        XCTAssertEqual(model.subtitle, "среда, 15 октября")
        XCTAssertTrue(transport.requests.contains { $0.path == "/api/v1/dashboard/daily/2025-10-15" })
        XCTAssertTrue(transport.requests.contains { $0.path == "/api/v1/nutrition-calc/targets" && $0.query == "date=2025-10-15" })
        await model.select("2025-10-18")
        XCTAssertEqual(model.selected, "2025-10-15", "будущий день не выбирается")
    }

    /// «Полночь»: в 23:59 открыт «Сегодня», наступает полночь — показан новый день.
    func testMidnightShowsTheNewDay() async throws {
        let clock = Clock(Date(timeIntervalSince1970: 1_760_734_740)) // 17.10 23:59 МСК
        let center = NotificationCenter()
        let transport = Self.server()
        let (model, _) = makeModel(transport, now: { clock.now })
        await model.load()
        XCTAssertEqual(model.selected, "2025-10-17")
        model.observeDayChanges(center: center)

        clock.now = Date(timeIntervalSince1970: 1_760_734_860) // 18.10 00:01
        center.post(name: TodayModel.dayChanged, object: nil)
        for _ in 0..<200 where model.selected != "2025-10-18" || model.isLoading {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertEqual(model.today, "2025-10-18")
        XCTAssertEqual(model.selected, "2025-10-18")
        XCTAssertTrue(transport.requests.contains { $0.path == "/api/v1/dashboard/daily/2025-10-18" })
    }

    func testDayChangeNameIsTheSystemOne() {
        #if canImport(Darwin)
        XCTAssertEqual(TodayModel.dayChanged, Notification.Name.NSCalendarDayChanged)
        #else
        XCTAssertEqual(TodayModel.dayChanged.rawValue, "NSCalendarDayChangedNotification")
        #endif
    }

    func testForegroundAfterMidnightRollsOver() async {
        let clock = Clock(Date(timeIntervalSince1970: 1_760_734_740))
        let (model, _) = makeModel(Self.server(), now: { clock.now })
        await model.load()
        clock.now = Date(timeIntervalSince1970: 1_760_734_860)
        await model.refresh()
        XCTAssertEqual(model.selected, "2025-10-18")
    }

    /// Событие сокета о переписке обновляет карточку куратора; о статье — колокольчик.
    func testRealtimeEventsRefreshCuratorAndBell() async {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        let before = transport.requests(to: "/api/v1/dashboard/onboarding").count
        await model.handle(.newMessage(conversationID: "c1"))
        XCTAssertEqual(transport.requests(to: "/api/v1/dashboard/onboarding").count, before + 1)
        let bell = transport.requests(to: "/api/v1/notifications/unread-counts").count
        await model.handle(.contentNotification)
        XCTAssertEqual(transport.requests(to: "/api/v1/notifications/unread-counts").count, bell + 1)
    }

    /// Нет опроса: в модели «Сегодня» нет таймеров и циклов со сном.
    func testTodayDoesNotPoll() throws {
        let directory = RepositoryFiles.url("apps/ios/VzveshenoKit/Sources/Client")
        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path).filter { $0.hasSuffix(".swift") }
        XCTAssertFalse(files.isEmpty)
        for file in files {
            let source = try String(contentsOf: directory.appendingPathComponent(file), encoding: .utf8)
            for forbidden in ["Timer", "DispatchSourceTimer", "Task.sleep", "asyncAfter"] {
                XCTAssertFalse(source.contains(forbidden), "\(file): \(forbidden)")
            }
        }
    }

    func testWorkoutTaskCompletesWithKindAndDuration() async throws {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        await model.completeTask("t1", workout: (kind: "strength", minutes: 45))
        let post = try XCTUnwrap(transport.requests(to: "/api/v1/dashboard/tasks/t1/complete").first)
        XCTAssertEqual(post.json?["date"] as? String, "2025-10-17")
        XCTAssertEqual(post.json?["workout_type"] as? String, "strength")
        XCTAssertEqual(post.json?["workout_duration"] as? Int, 45)
    }

    func testManualWeightGoesAsMeasurement() async throws {
        let transport = Self.server()
        let (model, _) = makeModel(transport)
        await model.load()
        await model.saveWeight(78.4)
        let post = try XCTUnwrap(transport.requests(to: "/api/v1/dashboard/daily").first)
        let metric = post.json?["metric"] as? [String: Any]
        XCTAssertEqual(metric?["type"] as? String, "weight")
        XCTAssertEqual((metric?["data"] as? [String: Any])?["weight"] as? Double, 78.4)
    }

    func testOfflineShowsTheCachedDay() async throws {
        let transport = Self.server()
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let cache = ScreenCache(root: FileManager.default.temporaryDirectory.appendingPathComponent("today-\(UUID())"))
        let model = TodayModel(api: api, outbox: nil, cache: cache, calendar: calendar, now: { Self.friday }, userID: { 7 })
        await model.load()
        transport.setHandler { _ in .offline }
        await model.load()
        XCTAssertEqual(model.snapshot?.fromCache, true)
        XCTAssertEqual(model.nutrition?.headline, "1\u{00A0}923")
    }

    func testWeeklyReportRefusalIsTranslated() async {
        let transport = StubTransport { request in
            guard request.path == "/api/v1/dashboard/weekly-report" else { return .error(404, code: "not_found") }
            XCTAssertEqual(request.json?["week_start"] as? String, "2025-10-13T00:00:00+03:00")
            return .error(400, code: "validation", params: #"{"errors":["weekly photo not uploaded"]}"#)
        }
        let (model, _) = makeModel(transport)
        let result = await model.submitWeeklyReport()
        XCTAssertEqual(result, .incomplete(["Нет фото недели"]))
    }
}

final class Clock: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Date

    init(_ value: Date) { self.value = value }

    var now: Date {
        get { lock.withLock { value } }
        set { lock.withLock { value = newValue } }
    }
}
