import API
import Client
@testable import Curator
import Foundation
import TestSupport
import XCTest

let clientDetailFixture = fixture("client-detail")

@MainActor
final class ClientCardModelTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)

    private func card(_ handler: @escaping StubTransport.Handler) -> (ClientCardModel, StubTransport) {
        let transport = StubTransport(handler: handler)
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios", transport: transport)
        let now = Date(timeIntervalSince1970: 1_792_400_400)
        return (ClientCardModel(api: api, clientID: 11, calendar: calendar, now: { now }), transport)
    }

    private func detailHandler(put: StubResponse) -> StubTransport.Handler {
        { request in
            switch (request.method, request.path) {
            case ("GET", "/api/v1/curator/clients/11"): return .success(clientDetailFixture)
            case ("GET", "/api/v1/curator/clients/11/notices"): return .success("[]")
            case ("PUT", _): return put
            default: return .error(404, code: "not_found")
            }
        }
    }

    func testDetailDecodesSourcesAndCuratorEntries() async throws {
        let (model, transport) = card(detailHandler(put: .success("{}")))
        await model.load()
        let detail = try XCTUnwrap(model.detail)
        XCTAssertEqual(transport.requests(to: "/api/v1/curator/clients/11").first?.query, "days=7")
        XCTAssertEqual(detail.client.displayName, "Мария К.")
        XCTAssertEqual(detail.days.first?.stepsSource, "healthkit")
        // «Добавлено куратором» — запись по фото.
        XCTAssertEqual(detail.days.first?.foodEntries.map(\.addedByCurator), [true, false])
        // Фото недели — только с наших адресов.
        XCTAssertNotNil(detail.photos[0].url)
        XCTAssertNil(detail.photos[1].url)
    }

    // Ошибка возвращает прежнее значение и показывает «Не удалось сохранить».
    func testTargetWeightRollsBackOnError() async {
        let (model, transport) = card(detailHandler(put: .error(500, code: "internal")))
        await model.load()
        await model.setTargetWeight(62.34)
        XCTAssertEqual(transport.requests(to: "/api/v1/curator/clients/11/target-weight").first?.json?["target_weight"] as? Double, 62.3)
        XCTAssertEqual(model.detail?.client.targetWeight, 64)
        XCTAssertEqual(model.notice, "Не удалось сохранить")
    }

    func testTargetWeightOutOfRangeIsNotSent() async {
        let (model, transport) = card(detailHandler(put: .success("{}")))
        await model.load()
        await model.setTargetWeight(19.9)
        await model.setTargetWeight(500.1)
        XCTAssertTrue(transport.requests(to: "/api/v1/curator/clients/11/target-weight").isEmpty)
        XCTAssertEqual(model.detail?.client.targetWeight, 64)
        await model.setTargetWeight(500)
        XCTAssertEqual(model.detail?.client.targetWeight, 500)
    }

    func testWaterGoalRollsBackOnError() async {
        let (model, _) = card(detailHandler(put: .offline))
        await model.load()
        await model.setWaterGoal(10)
        XCTAssertEqual(model.detail?.waterGoal, 8)
        XCTAssertEqual(model.notice, "Не удалось сохранить")
    }

    // Сценарий «Убрать цель по воде».
    func testRemoveWaterGoalSendsNull() async throws {
        let (model, transport) = card(detailHandler(put: .success(#"{"message":"Цель по воде обновлена"}"#)))
        await model.load()
        XCTAssertNil(model.waterCaption)
        await model.setWaterGoal(nil)
        let body = try XCTUnwrap(transport.requests(to: "/api/v1/curator/clients/11/water-goal").first?.body)
        XCTAssertEqual(String(data: body, encoding: .utf8), #"{"water_goal":null}"#)
        XCTAssertEqual(model.waterCaption, "Блок воды скрыт у клиента. Задайте цель, чтобы включить.")
        XCTAssertNil(model.notice)
    }

    // Сценарий «Правка существующего плана»: даты недоступны и не уходят.
    func testEditingPlanLocksDates() async throws {
        let plan = ClientPlan(id: "w1", macros: Macros(calories: 2240, protein: 120, fat: 75, carbs: 250), startDate: "2026-10-13",
                              endDate: "2026-10-19", comment: "Держим белок", isActive: true)
        var draft = PlanDraft(plan: plan)
        XCTAssertFalse(draft.datesEditable)
        XCTAssertTrue(PlanDraft.new(today: "2026-10-19", calendar: calendar).datesEditable)
        draft.calories = "2100"
        let (model, transport) = card { request in
            request.path.hasSuffix("/weekly-plans") ? .success("[]") : .success("{}")
        }
        let problem = await model.save(draft, editing: "w1")
        XCTAssertNil(problem)
        let sent = try XCTUnwrap(transport.requests(to: "/api/v1/curator/clients/11/weekly-plan/w1").first)
        XCTAssertEqual(sent.method, "PUT")
        XCTAssertEqual(sent.json?["calories"] as? Double, 2100)
        XCTAssertNil(sent.json?["start_date"])
        XCTAssertNil(sent.json?["end_date"])
    }

    func testNewPlanValidation() {
        var draft = PlanDraft.new(today: "2026-10-19", calendar: calendar)
        XCTAssertEqual(draft.endDate, "2026-10-25")
        XCTAssertFalse(draft.isValid)
        draft.calories = "2240"
        draft.protein = "120"
        draft.fat = "75,5"
        draft.carbs = "250"
        XCTAssertTrue(draft.isValid)
        XCTAssertEqual(draft.createBody.fat, 75.5)
        draft.endDate = "2026-10-18"
        XCTAssertEqual(draft.problem, "Конец плана раньше начала")
    }

    // Сценарий «Еженедельная задача без дней».
    func testWeeklyTaskNeedsDays() {
        var draft = TaskDraft(deadline: "2026-10-26")
        draft.title = "Замеры талии"
        draft.recurrence = .weekly
        XCTAssertFalse(draft.isValid, "«Готово» недоступна")
        draft.days = [0, 1]
        XCTAssertTrue(draft.isValid)
        XCTAssertEqual(draft.createBody.recurrenceDays, [1, 0], "Пн…Вс, воскресенье — 0, как в вебе")
        draft.recurrence = .once
        XCTAssertNil(draft.createBody.recurrenceDays)
    }

    func testTaskFiltersAreComputedLocally() async {
        let tasks = """
        [{"id":"a","title":"Вода","type":"habit","deadline":"2026-10-25","recurrence":"daily","status":"active"},
         {"id":"b","title":"Замеры","type":"measurement","deadline":"2026-10-15","recurrence":"once","status":"overdue"},
         {"id":"c","title":"Овощи","type":"nutrition","deadline":"2026-10-10","recurrence":"once","status":"completed"},
         {"id":"d","title":"Шаги","type":"workout","deadline":"2026-10-18","recurrence":"once","status":"active"}]
        """
        let (model, transport) = card { _ in .success(tasks) }
        model.tab = .tasks
        await model.loadTasks()
        XCTAssertNil(transport.requests.first?.query, "весь список: `?status=overdue` сервер не находит")
        XCTAssertEqual(model.visibleTasks.map(\.id), ["a"])
        model.taskFilter = .overdue
        XCTAssertEqual(model.visibleTasks.map(\.id), ["b", "d"])
        model.taskFilter = .completed
        XCTAssertEqual(model.visibleTasks.map(\.id), ["c"])
    }

    // Сценарий «Без итога».
    func testFeedbackNeedsSummary() async throws {
        var draft = FeedbackDraft()
        XCTAssertFalse(draft.isValid)
        XCTAssertEqual(draft.summaryHint, "Заполните итог")
        let (model, transport) = card { request in
            request.path.hasSuffix("/weekly-reports") ? .success("[]") : .success(#"{"message":"Отзыв сохранён"}"#)
        }
        let problem = await model.submit(draft, reportID: "r1")
        XCTAssertEqual(problem, "Заполните итог")
        XCTAssertTrue(transport.requests.isEmpty)
        draft.summary = "Хорошая неделя"
        draft.nutrition = .excellent
        draft.nutritionComment = "Белок в норме"
        draft.photoUploaded = true
        let sent = await model.submit(draft, reportID: "r1")
        XCTAssertNil(sent)
        let body = try XCTUnwrap(transport.requests(to: "/api/v1/curator/clients/11/weekly-reports/r1/feedback").first?.json)
        XCTAssertEqual(body["summary"] as? String, "Хорошая неделя")
        XCTAssertEqual((body["nutrition"] as? [String: Any])?["rating"] as? String, "excellent")
        XCTAssertNil(body["activity"])
        XCTAssertEqual(body["photo_uploaded"] as? Bool, true)
    }

    func testReportStatus() throws {
        let reports: [WeeklyReport] = try JSONDecoder().decode([WeeklyReport].self, from: Data("""
        [{"id":"r1","week_start":"2026-10-13","week_end":"2026-10-19","week_number":42,"summary":{},"has_feedback":false},
         {"id":"r2","week_start":"2026-09-29","week_end":"2026-10-05","week_number":40,"summary":{},"has_feedback":true,
          "curator_feedback":{"summary":"Отлично","nutrition":{"rating":"good","comment":""}}}]
        """.utf8))
        XCTAssertEqual(reports.map(\.statusTitle), ["Ожидает обратной связи", "Обратная связь дана"])
        XCTAssertEqual(reports[0].periodTitle, "13–19 октября")
        XCTAssertEqual(reports[1].periodTitle, "29 сентября – 5 октября")
        XCTAssertEqual(reports[1].feedback?.nutrition?.rating, .good)
    }
}
