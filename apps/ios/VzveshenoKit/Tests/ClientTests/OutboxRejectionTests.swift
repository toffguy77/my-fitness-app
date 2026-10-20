import API
@testable import Client
import Foundation
import Outbox
import TestSupport
import XCTest

/// Отказ из досылки, которую запустил не экран (фон, сеть, пуш, расширение):
/// откат и сообщение у владельца изменения.
@MainActor
final class OutboxRejectionTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow")!)
    nonisolated private static let now = Date(timeIntervalSince1970: 1_760_696_400)

    func testOwnerByKind() {
        let table: [(String, OutboxRejectionOwner)] = [
            ("diary.add", .diary), ("diary.delete", .diary), ("menu.eat", .diary),
            ("today.metric.weight", .today), ("today.task", .today), ("surface.water", .today), ("surface.weight", .today),
            ("push.task", .today), ("chat.message", .chat), ("health.import", .app), ("что-то", .app),
        ]
        for (kind, owner) in table {
            XCTAssertEqual(OutboxRejectionOwner(kind: kind), owner, kind)
        }
        let text = OutboxRejectionOwner.diary.message(for: .server(status: 422, code: "validation", params: [:]),
                                                      messages: ErrorMessages { _ in "Проверьте значение" })
        XCTAssertEqual(text, "Запись дневника не сохранилась: Проверьте значение")
    }

    /// Запись без сети «ждёт отправки»; фоновая досылка получает 422 — строка
    /// уходит, сообщение по коду ошибки.
    func testDiaryRollsBackRejectionFromAnotherDrain() async throws {
        let server = DiaryModelTests.Server()
        let reject = LockedFlag(false)
        let base = DiaryModelTests.transport(server)
        let transport = StubTransport { request in
            if reject.value, request.method == "POST" { return .error(422, code: "validation") }
            return base.handle(request)
        }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let outbox = Outbox(store: InMemoryOutboxStore(), api: api)
        let model = DiaryModel(api: api, outbox: outbox, calendar: calendar, sleeper: ManualSleeper(), now: { Self.now },
                               userID: { 7 })
        await model.load()
        server.lock.withLock { server.offline = true }
        let food = FoodItem(id: "f9", name: "Гречка", per100: Nutrition(calories: 110, protein: 4, fat: 1, carbs: 21))
        await model.add(EntryDraft(food: food, meal: .dinner, date: "2025-10-17", portion: Portion(amount: 150)))
        XCTAssertEqual(model.queued.count, 1)

        server.lock.withLock { server.offline = false }
        reject.value = true
        let observer = Collecting()
        await outbox.setObserver(observer)
        let report = await outbox.drain(userID: 7)
        XCTAssertEqual(report.rejected.count, 1)
        let rejected = try XCTUnwrap(observer.items.first)
        await model.outboxRejected(rejected.0, error: rejected.1)

        XCTAssertTrue(model.queued.isEmpty)
        XCTAssertTrue(model.state.meals[2].rows.isEmpty, "строка «ждёт отправки» снята")
        XCTAssertTrue(model.notice?.hasPrefix("Запись дневника не сохранилась") == true, model.notice ?? "")
    }
}

final class Collecting: OutboxObserver, @unchecked Sendable {
    private let lock = NSLock()
    private var log: [(OutboxItem, APIError)] = []

    var items: [(OutboxItem, APIError)] { lock.withLock { log } }

    func outboxDelivered(_ item: OutboxItem, response: RawResponse) async {}
    func outboxRejected(_ item: OutboxItem, error: APIError) async { lock.withLock { log.append((item, error)) } }
}
