@testable import API
import Foundation
import TestSupport
import XCTest

final class AnalyticsTests: XCTestCase {
    func testEventsGoOnlyToOwnEndpoint() async throws {
        let transport = StubTransport { _ in StubResponse(status: 202) }
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "ios/1.0.0/1", transport: transport)
        let client = AnalyticsClient(api: api, visitorID: "6f9619ff-8b86-d011-b42d-00c04fc964ff", appVersion: "1.0.0")
        await client.send([.init(name: "app_opened", occurredAt: Date(timeIntervalSince1970: 0))])

        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(transport.requests.count, 1)
        XCTAssertEqual(request.path, "/api/v1/public/analytics/events")
        XCTAssertNil(request.header("Authorization"))
        let body = try XCTUnwrap(request.json)
        XCTAssertEqual(body["platform"] as? String, "ios")
        XCTAssertEqual(body["visitor_id"] as? String, "6f9619ff-8b86-d011-b42d-00c04fc964ff")
        let events = try XCTUnwrap(body["events"] as? [[String: Any]])
        XCTAssertEqual(events.first?["name"] as? String, "app_opened")
        XCTAssertEqual(events.first?["occurred_at"] as? String, "1970-01-01T00:00:00Z")
    }

    func testFailureIsSilent() async {
        let transport = StubTransport { _ in .offline }
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "x", transport: transport)
        await AnalyticsClient(api: api, visitorID: "v", appVersion: "1").send([.init(name: "x")])
        XCTAssertEqual(transport.requests.count, 1)
    }

    /// После входа установка связывается с аккаунтом — тем же visitor_id.
    func testIdentifyLinksTheVisitor() async throws {
        let transport = StubTransport { _ in .success(#"{"linked":true}"#) }
        let api = APIClient(baseURL: URL(string: "https://burcev.team")!, clientHeader: "x", transport: transport)
        await AnalyticsClient(api: api, visitorID: "6f9619ff-8b86-d011-b42d-00c04fc964ff", appVersion: "1").identify()
        let request = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(request.path, "/api/v1/analytics/identify")
        XCTAssertEqual(request.json?["visitor_id"] as? String, "6f9619ff-8b86-d011-b42d-00c04fc964ff")
    }

    func testVisitorIDIsAStableUUID() {
        let name = "analytics-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        let first = AnalyticsVisitor.id(in: defaults)
        XCTAssertNotNil(UUID(uuidString: first), "сервер требует uuid")
        XCTAssertEqual(first, first.lowercased())
        XCTAssertEqual(AnalyticsVisitor.id(in: defaults), first)
    }

    /// Каждое событие приложения объявлено в словаре сервера, не серверное, и
    /// каждое его свойство там перечислено: иначе сервер отбросит событие
    /// молча (так на сайте год не приходили first_food_entry и lead_saved).
    func testEveryAppEventIsDeclaredOnTheServer() throws {
        let source = try RepositoryFiles.read("apps/api/internal/modules/analytics/dictionary.go")
        XCTAssertFalse(ProductEvent.declared.isEmpty)
        for (name, properties) in ProductEvent.declared {
            let constant = try XCTUnwrap(Self.constant(for: name, in: source), "\(name) нет в словаре сервера")
            let entry = try XCTUnwrap(Self.entry(for: constant, in: source), "\(constant) не описан в Dictionary")
            XCTAssertFalse(entry.contains("ServerOnly: true"), "\(name) — серверное событие, приложение его не шлёт")
            for property in properties {
                XCTAssertTrue(entry.contains("\"\(property)\""), "\(name): свойство \(property) не объявлено")
            }
        }
    }

    /// `EventFoo = "name"` → `EventFoo`.
    static func constant(for name: String, in source: String) -> String? {
        let pattern = try? NSRegularExpression(pattern: #"\b(Event[A-Za-z]+)\s*=\s*"\#(name)""#)
        let range = NSRange(source.startIndex..., in: source)
        guard let match = pattern?.firstMatch(in: source, range: range), let found = Range(match.range(at: 1), in: source) else {
            return nil
        }
        return String(source[found])
    }

    /// Описание события в `Dictionary`: от `\tEventFoo:` до конца записи.
    static func entry(for constant: String, in source: String) -> String? {
        let lines = source.components(separatedBy: "\n")
        guard let start = lines.firstIndex(where: { $0.hasPrefix("\t\(constant):") }) else { return nil }
        if lines[start].hasSuffix("},") { return lines[start] }
        guard let end = lines[start...].firstIndex(where: { $0 == "\t}," }) else { return lines[start] }
        return lines[start...end].joined(separator: "\n")
    }
}
