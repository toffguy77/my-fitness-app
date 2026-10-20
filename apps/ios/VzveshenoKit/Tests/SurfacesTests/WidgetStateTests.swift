import Foundation
import Surfaces
import XCTest

/// Что показывают виджеты (задачи 2.1–2.2, спека `ios-widgets`).
final class WidgetStateTests: XCTestCase {
    private let nbsp = "\u{00A0}"

    private func day(_ snapshot: DaySnapshot, now: Date = Fixture.friday) throws -> ClientDay {
        let state = ClientWidgetState(snapshot, sessionUserID: snapshot.userID, now: now)
        guard case let .day(day) = state else {
            XCTFail("виджет без дня: \(state)")
            throw CancellationError()
        }
        return day
    }

    /// Сценарий «Снимок текущего дня»: «1 923» и «ккал из 2 472».
    func testCurrentDaySmallWidget() throws {
        let day = try day(Fixture.snapshot())
        XCTAssertEqual(day.title, "Осталось")
        XCTAssertEqual(day.headline, "1\(nbsp)923")
        XCTAssertEqual(day.caption, "ккал из 2\(nbsp)472")
        XCTAssertEqual(day.fraction, 549.0 / 2472.0, accuracy: 0.0001)
    }

    /// Средний и экран блокировки: макросы, вода, строки виджетов.
    func testMediumAndLockScreenTexts() throws {
        let day = try day(Fixture.snapshot())
        XCTAssertEqual(day.mediumTitle, "Осталось на сегодня")
        XCTAssertEqual(day.macrosLine, "Б 49 · Ж 31 · У 212")
        XCTAssertEqual(day.water, DaySnapshot.Water(glasses: 5, goal: 8, enabled: true))
        XCTAssertEqual(day.compact, "1923")
        XCTAssertEqual(day.inline, "1\(nbsp)923 ккал")
        XCTAssertEqual(day.rectangularDetail, "Б 49 · Ж 31 · У 212 · вода 5/8")
    }

    /// Превышение: «+128», «Сверх нормы»; макрос сверх нормы — с плюсом.
    func testOverTheNorm() throws {
        var snapshot = Fixture.snapshot(eaten: 2600)
        snapshot.nutrition?.protein = .init(eaten: 137, goal: 125)
        let day = try day(snapshot)
        XCTAssertTrue(day.isOver)
        XCTAssertEqual(day.title, "Сверх нормы")
        XCTAssertEqual(day.headline, "+128")
        XCTAssertEqual(day.compact, "+128")
        XCTAssertEqual(day.fraction, 1)
        XCTAssertEqual(day.macros?.first?.text, "Б +12")
    }

    /// Без нормы — съеденное и без макросов.
    func testNoNorm() throws {
        let day = try day(Fixture.snapshot(goal: nil))
        XCTAssertEqual(day.title, "Съедено")
        XCTAssertEqual(day.headline, "549")
        XCTAssertEqual(day.caption, "ккал")
        XCTAssertNil(day.macros)
    }

    /// Вода выключена — ни точек, ни «+ стакан».
    func testWaterDisabledIsHidden() throws {
        let day = try day(Fixture.snapshot(water: .init(glasses: 0, goal: 8, enabled: false)))
        XCTAssertNil(day.water)
        XCTAssertEqual(day.rectangularDetail, "Б 49 · Ж 31 · У 212")
    }

    /// Сценарий «Утро после неоткрытого вечера»: вчерашний снимок — «Нет данных
    /// за сегодня», а не вчерашний остаток.
    func testYesterdaySnapshotShowsNoData() {
        let snapshot = Fixture.snapshot(date: "2025-10-16")
        let state = ClientWidgetState(snapshot, sessionUserID: 7, now: Fixture.friday)
        XCTAssertEqual(state, .noData)
        XCTAssertEqual(state.message, "Нет данных за сегодня")
    }

    /// День — по поясу профиля, а не телефона: 23:30 по Москве 16-го — ещё 16-е.
    func testDayIsJudgedInTheProfileTimeZone() {
        let lateEvening = Date(timeIntervalSince1970: 1_760_646_600) // 2025-10-16 20:30 UTC = 23:30 MSK
        XCTAssertEqual(ClientWidgetState(Fixture.snapshot(date: "2025-10-16"), sessionUserID: 7, now: lateEvening).message, nil)
        XCTAssertEqual(ClientWidgetState(Fixture.snapshot(date: "2025-10-17"), sessionUserID: 7, now: lateEvening), .noData)
    }

    /// Таймлайн: запись сейчас и на ближайшую полночь по поясу профиля; в
    /// записи на полночь остатка уже нет.
    func testTimelineHasAnEntryAtMidnightInTheProfileZone() throws {
        let snapshot = Fixture.snapshot()
        let dates = WidgetTimelinePlan.dates(snapshot: snapshot, now: Fixture.friday)
        XCTAssertEqual(dates.count, 2)
        XCTAssertEqual(dates[0], Fixture.friday)
        // 18 октября 00:00 MSK = 17 октября 21:00 UTC.
        XCTAssertEqual(dates[1], Date(timeIntervalSince1970: 1_760_734_800))
        XCTAssertNotNil(ClientWidgetState(snapshot, sessionUserID: 7, now: dates[0]).headline)
        XCTAssertEqual(ClientWidgetState(snapshot, sessionUserID: 7, now: dates[1]), .noData)
    }

    /// Полночь — по поясу профиля, даже если телефон в другом.
    func testMidnightFollowsTheSnapshotZone() {
        var snapshot = Fixture.snapshot()
        snapshot.timeZone = "Asia/Vladivostok"
        let dates = WidgetTimelinePlan.dates(snapshot: snapshot, now: Fixture.friday)
        // 18 октября 00:00 VLAT (UTC+10) = 17 октября 14:00 UTC.
        XCTAssertEqual(dates[1], Date(timeIntervalSince1970: 1_760_709_600))
    }

    /// Сценарий «Куратор добавил виджет клиента».
    func testCoordinatorSeesClientWidgetAsAvailableToClients() {
        let snapshot = DaySnapshot(userID: 3, role: "coordinator", date: Fixture.fridayKey, timeZone: "Europe/Moscow",
                                   updatedAt: Fixture.friday, curator: .init(attentionCount: 3, unread: 5))
        let state = ClientWidgetState(snapshot, sessionUserID: 3, now: Fixture.friday)
        XCTAssertEqual(state, .wrongRole)
        XCTAssertEqual(state.message, "Доступно клиентам")
    }

    /// Виджет куратора: «Требуют внимания: N», «Непрочитанные: M»; клиенту — «Доступно кураторам».
    func testCuratorWidget() {
        let curator = DaySnapshot(userID: 3, role: "coordinator", date: "2025-10-01", timeZone: "Europe/Moscow",
                                  updatedAt: Fixture.friday, curator: .init(attentionCount: 3, unread: 5))
        let state = CuratorWidgetState(curator, sessionUserID: 3)
        XCTAssertEqual(state, .counts(attention: 3, unread: 5))
        XCTAssertEqual(state.attentionText, "Требуют внимания: 3")
        XCTAssertEqual(state.unreadText, "Непрочитанные: 5")

        let client = CuratorWidgetState(Fixture.snapshot(), sessionUserID: 7)
        XCTAssertEqual(client, .wrongRole)
        XCTAssertEqual(client.message, "Доступно кураторам")
        XCTAssertEqual(CuratorWidgetState(DaySnapshot(userID: 1, role: "super_admin", date: "2025-10-17", timeZone: "UTC",
                                                      updatedAt: Fixture.friday), sessionUserID: 1), .wrongRole)
    }

    /// Выход: снимка нет — виджеты без данных, «Войдите во Взвешено».
    func testSignedOutShowsNoData() {
        XCTAssertEqual(ClientWidgetState(nil, sessionUserID: nil, now: Fixture.friday), .signedOut)
        XCTAssertEqual(ClientWidgetState(nil, sessionUserID: 7, now: Fixture.friday).message, "Войдите во Взвешено")
        XCTAssertEqual(CuratorWidgetState(nil, sessionUserID: nil), .signedOut)
    }

    /// Снимок остался, а сессии нет или она чужая (выход без стирания,
    /// переустановка, смена аккаунта) — данные не показываются.
    func testSnapshotOfAnotherAccountIsNotShown() {
        let snapshot = Fixture.snapshot(userID: 7)
        XCTAssertEqual(ClientWidgetState(snapshot, sessionUserID: nil, now: Fixture.friday), .signedOut)
        XCTAssertEqual(ClientWidgetState(snapshot, sessionUserID: 9, now: Fixture.friday), .signedOut)
        XCTAssertEqual(CuratorWidgetState(DaySnapshot(userID: 3, role: "coordinator", date: Fixture.fridayKey, timeZone: "UTC",
                                                      updatedAt: Fixture.friday, curator: .init(attentionCount: 1, unread: 1)),
                                          sessionUserID: 9), .signedOut)
    }
}

private extension ClientWidgetState {
    var headline: String? {
        if case let .day(day) = self { return day.headline }
        return nil
    }
}
