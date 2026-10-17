import API
@testable import Client
import Foundation
import TestSupport
import XCTest

/// `ios-onboarding` (задача 1.3).
final class OnboardingTests: XCTestCase {
    private func json(_ endpoint: Endpoint) -> [String: Any]? {
        endpoint.body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    }

    /// «Ввод веса в онбординге»: 78,4 — замер за сегодня, target_weight не тронут.
    func testCurrentWeightIsAMeasurementNotATarget() throws {
        var draft = OnboardingDraft(locale: Locale(identifier: "ru_RU"), timeZone: TimeZone(identifier: "Europe/Moscow")!)
        draft.currentWeight = 78.4
        draft.height = 170
        let requests = try draft.requests(today: "2025-10-17")
        XCTAssertEqual(requests.map(\.path), ["/api/v1/users/settings", "/api/v1/dashboard/daily", "/api/v1/users/onboarding/complete"])
        let settings = try XCTUnwrap(json(requests[0]))
        XCTAssertNil(settings["target_weight"])
        XCTAssertNil(settings["weight"])
        XCTAssertEqual(settings["height"] as? Double, 170)
        XCTAssertEqual(settings["timezone"] as? String, "Europe/Moscow")
        let daily = try XCTUnwrap(json(requests[1]))
        XCTAssertEqual(daily["date"] as? String, "2025-10-17")
        let metric = daily["metric"] as? [String: Any]
        XCTAssertEqual(metric?["type"] as? String, "weight")
        XCTAssertEqual((metric?["data"] as? [String: Any])?["weight"] as? Double, 78.4)
        XCTAssertEqual(requests[1].method, .post)
        XCTAssertEqual(requests[2].method, .put)
    }

    /// «Пропуск всех полей»: только завершение онбординга.
    func testSkippingEverythingOnlyCompletes() throws {
        var draft = OnboardingDraft()
        draft.settingsSkipped = true
        draft.currentWeight = 80
        draft.skipBody()
        let requests = try draft.requests(today: "2025-10-17")
        XCTAssertEqual(requests.map(\.path), ["/api/v1/users/onboarding/complete"])
    }

    func testSettingsArePrefilledFromTheDevice() {
        let draft = OnboardingDraft(locale: Locale(identifier: "en_US"), timeZone: TimeZone(identifier: "Asia/Yekaterinburg")!)
        XCTAssertEqual(draft.language, "en")
        XCTAssertEqual(draft.units, "metric")
        XCTAssertEqual(draft.timezone, "Asia/Yekaterinburg")
        XCTAssertEqual(OnboardingDraft(locale: Locale(identifier: "de_DE")).language, "ru")
    }

    func testBodyAnswersUseServerNames() throws {
        var draft = OnboardingDraft()
        draft.settingsSkipped = true
        draft.birthDate = "1990-05-01"
        draft.sex = .female
        draft.activity = .light
        draft.goal = .loss
        let settings = try XCTUnwrap(json(try draft.requests(today: "2025-10-17")[0]))
        XCTAssertEqual(settings["biological_sex"] as? String, "female")
        XCTAssertEqual(settings["activity_level"] as? String, "light")
        XCTAssertEqual(settings["fitness_goal"] as? String, "loss")
        XCTAssertEqual(settings["birth_date"] as? String, "1990-05-01")
        XCTAssertNil(settings["language"], "шаг «Настройки» пропущен")
    }

    func testServiceStopsOnFailureAndDoesNotComplete() async {
        let transport = StubTransport { request in
            request.path == "/api/v1/dashboard/daily" ? .error(400, code: "validation") : .success("{}")
        }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        var draft = OnboardingDraft()
        draft.currentWeight = 78.4
        do {
            try await OnboardingService(api: api).complete(draft, today: "2025-10-17")
            XCTFail("ошибка не дошла")
        } catch {}
        XCTAssertTrue(transport.requests(to: "/api/v1/users/onboarding/complete").isEmpty)
    }

    func testHeightBounds() {
        XCTAssertEqual(BodyInput.height("170"), 170)
        XCTAssertNil(BodyInput.height("49"))
        XCTAssertNil(BodyInput.height("301"))
    }
}
