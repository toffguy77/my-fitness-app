import XCTest
@testable import Burcev

/// Транспорт с заранее заготовленными ответами, по одному на запрос.
final class StubTransport: HTTPTransport, @unchecked Sendable {
    struct Reply {
        var status: Int
        var body: String
        var headers: [String: String] = [:]
    }

    private let lock = NSLock()
    private var replies: [Reply]
    private(set) var requests: [URLRequest] = []

    init(_ replies: [Reply]) {
        self.replies = replies
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let reply: Reply = lock.withLock {
            requests.append(request)
            return replies.isEmpty ? Reply(status: 500, body: "{}") : replies.removeFirst()
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status,
                                       httpVersion: "HTTP/1.1", headerFields: reply.headers)!
        return (Data(reply.body.utf8), response)
    }

    var requestCount: Int { lock.withLock { requests.count } }
}

final class APIClientTests: XCTestCase {
    private let base = URL(string: "https://burcev.team")!

    func testUnwrapsSuccessEnvelope() async throws {
        let transport = StubTransport([.init(status: 200, body: #"{"status":"success","data":{"glasses":3,"goal":8,"glass_size":250,"enabled":true}}"#)])
        let api = APIClient(baseURL: base, transport: transport)

        let water = try await api.send(Endpoint<Water>.get("/api/v1/food-tracker/water"))

        XCTAssertEqual(water, Water(glasses: 3, goal: 8, glass_size: 250, enabled: true))
    }

    func testServerErrorCarriesCodeAndMessage() async {
        let transport = StubTransport([.init(status: 403, body: #"{"status":"error","code":"curator_access_required","message":"Нет доступа"}"#)])
        let api = APIClient(baseURL: base, transport: transport)

        do {
            _ = try await api.send(Endpoint<Message>.get("/x"))
            XCTFail("ожидалась ошибка")
        } catch {
            XCTAssertEqual(error as? APIError, .server(status: 403, code: "curator_access_required", message: "Нет доступа"))
        }
    }

    func testExpiredTokenIsRefreshedOnceAndRetried() async throws {
        let transport = StubTransport([
            .init(status: 401, body: #"{"status":"error","code":"token_expired"}"#),
            .init(status: 200, body: #"{"status":"success","data":{"glasses":1,"goal":8,"glass_size":250,"enabled":false}}"#),
        ])
        let api = APIClient(baseURL: base, transport: transport)
        await api.setAccessToken("old")
        await api.setRefresher { "fresh" }

        let water = try await api.send(Endpoint<Water>.get("/api/v1/food-tracker/water"))

        XCTAssertEqual(water.glasses, 1)
        XCTAssertEqual(transport.requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer fresh")
    }

    /// Неверный пароль при удалении аккаунта — тоже 401, но токен тут ни при чём.
    func testRefusalOn401IsNotTreatedAsExpiredSession() async {
        let transport = StubTransport([.init(status: 401, body: #"{"status":"error","code":"unauthorized","message":"Неверный пароль"}"#)])
        let api = APIClient(baseURL: base, transport: transport)
        let refreshed = Counter()
        await api.setRefresher { await refreshed.increment(); return "fresh" }

        do {
            _ = try await api.send(Endpoint<DeletionStatus>.post("/api/v1/users/me/deletion", body: ["current_password": "x"]))
            XCTFail("ожидалась ошибка")
        } catch {
            XCTAssertEqual(error as? APIError, .server(status: 401, code: "unauthorized", message: "Неверный пароль"))
        }
        let count = await refreshed.value
        XCTAssertEqual(count, 0)
        XCTAssertEqual(transport.requestCount, 1)
    }

    func testSessionEndsWhenRefreshReturnsNothing() async {
        let transport = StubTransport([.init(status: 401, body: #"{"status":"error","code":"token_expired"}"#)])
        let api = APIClient(baseURL: base, transport: transport)
        await api.setRefresher { nil }

        do {
            _ = try await api.send(Endpoint<Water>.get("/x"))
            XCTFail("ожидалась ошибка")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized)
        }
    }

    func testSendsClientHeaderAndJSONBody() async throws {
        let transport = StubTransport([.init(status: 201, body: #"{"status":"success","data":{"glasses":2,"goal":8,"glass_size":250,"enabled":true}}"#)])
        let api = APIClient(baseURL: base, transport: transport)

        _ = try await api.send(Endpoint<Water>.post("/api/v1/food-tracker/water", body: AddWaterRequest(date: "2026-10-11", glasses: 1)))

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertTrue(request.value(forHTTPHeaderField: "X-Client")?.hasPrefix("ios/") ?? false)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(String(data: request.httpBody ?? Data(), encoding: .utf8), #"{"date":"2026-10-11","glasses":1}"#)
    }

    func testRefreshTokenIsReadFromSetCookie() {
        let response = HTTPURLResponse(
            url: base, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Set-Cookie": "refresh_token=abc123; Path=/api/v1/auth; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax"])!

        XCTAssertEqual(APIClient.refreshToken(from: response, url: base), "abc123")
    }

    func testClearedCookieIsNotATokens() {
        let response = HTTPURLResponse(
            url: base, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Set-Cookie": "refresh_token=; Path=/api/v1/auth; Max-Age=0; HttpOnly; Secure"])!

        XCTAssertNil(APIClient.refreshToken(from: response, url: base))
    }
}

final class ModelDecodingTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder.api.decode(Envelope<T>.self, from: Data(json.utf8)).data!
    }

    func testTargetsWhenCalculated() throws {
        let targets = try decode(DailyTargets.self, #"{"status":"success","data":{"id":1,"user_id":2,"date":"2026-10-11T00:00:00Z","calories":2100.5,"protein":120,"fat":70,"carbs":230,"source":"curator_override"}}"#)

        XCTAssertEqual(targets.macros?.calories, 2100.5)
        XCTAssertTrue(targets.isCuratorOverride)
    }

    func testTargetsWhenProfileIsIncomplete() throws {
        let targets = try decode(DailyTargets.self, #"{"status":"success","data":{"targets":null,"message":"Укажите вес","missing":{"profile":false,"weight":true}}}"#)

        XCTAssertNil(targets.macros)
        XCTAssertEqual(targets.message, "Укажите вес")
    }

    func testEntriesWithoutTargetGoals() throws {
        let response = try decode(EntriesResponse.self, #"""
        {"status":"success","data":{"entries":{"breakfast":[{"id":"e1","userId":1,"foodId":"f1","foodName":"Овсянка","mealType":"breakfast","portionType":"grams","portionAmount":150,"nutrition":{"calories":180,"protein":6,"fat":3,"carbs":30},"time":"08:30","date":"2026-10-11T00:00:00Z","createdAt":"2026-10-11T05:30:00.123Z","updatedAt":"2026-10-11T05:30:00Z"}],"lunch":[],"dinner":[],"snack":[]},"dailyTotals":{"calories":180,"protein":6,"fat":3,"carbs":30}}}
        """#)

        XCTAssertEqual(response.entries(for: .breakfast).first?.foodName, "Овсянка")
        XCTAssertTrue(response.entries(for: .dinner).isEmpty)
        XCTAssertEqual(response.dailyTotals.calories, 180)
    }

    /// Поиск смешивает числовые идентификаторы каталога и UUID — оба строки.
    func testSearchItemsWithMixedIdsAndMissingBrand() throws {
        let response = try decode(SearchResponse.self, #"{"status":"success","data":{"items":[{"id":"4821","name":"Гречка","servingSize":100,"servingUnit":"g","nutritionPer100":{"calories":313,"protein":12.6,"fat":3.3,"carbs":62.1},"source":"database","verified":false},{"id":"0b7e…","name":"Творог","brand":"Простоквашино","nutritionPer100":{"calories":121,"protein":17,"fat":5,"carbs":3},"source":"user","verified":true}],"total":2}}"#)

        XCTAssertEqual(response.items.map(\.id), ["4821", "0b7e…"])
        XCTAssertNil(response.items[0].brand)
    }

    func testUnknownRoleDoesNotBreakLogin() throws {
        let result = try decode(LoginResult.self, #"{"status":"success","data":{"user":{"id":7,"email":"a@b.c","role":"auditor","email_verified":true,"onboarding_completed":true,"created_at":"2026-10-11T05:30:00Z"},"token":"jwt"}}"#)

        XCTAssertEqual(result.user.role, .unknown)
        XCTAssertNil(result.user.name)
    }

    func testCuratorClientWithoutPlanOrWater() throws {
        let clients = try decode([ClientCard].self, #"{"status":"success","data":[{"id":5,"name":"Анна","today_kbzhu":{"calories":900,"protein":50,"fat":30,"carbs":100},"plan":null,"alerts":[{"level":"red","message":"Мало белка"}],"unread_count":2,"last_weight":null,"weight_trend":"","target_weight":null,"today_water":null,"active_tasks_count":0,"overdue_tasks_count":0,"streak_days":3}]}"#)

        XCTAssertNil(clients[0].plan)
        XCTAssertEqual(clients[0].alerts.first?.level, "red")
    }

    func testDayFormat() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Moscow")!
        let date = calendar.date(from: DateComponents(year: 2026, month: 3, day: 7, hour: 23))!

        XCTAssertEqual(APIDates.day(date, calendar: calendar), "2026-03-07")
    }
}

actor Counter {
    private(set) var value = 0
    func increment() { value += 1 }
}
