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
}
