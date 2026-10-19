import API
import Foundation
import Outbox
import Session
import Surfaces
import TestSupport

/// Общие заготовки тестов снимка, виджетов и интентов.
enum Fixture {
    static let moscow = TimeZone(identifier: "Europe/Moscow")!
    /// 17 октября 2025, 12:00 по Москве.
    static let friday = Date(timeIntervalSince1970: 1_760_691_600)
    static let fridayKey = "2025-10-17"

    static func directory() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("surfaces-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Снимок «Сегодня» с макета: 1 923 из 2 472, Б 49 · Ж 31 · У 212, вода 5 из 8.
    static func snapshot(userID: Int64 = 7, role: String = "client", date: String = fridayKey,
                         water: DaySnapshot.Water? = .init(glasses: 5, goal: 8, enabled: true),
                         eaten: Int = 549, goal: Int? = 2472) -> DaySnapshot {
        DaySnapshot(userID: userID, role: role, date: date, timeZone: moscow.identifier, updatedAt: friday,
                    nutrition: .init(eatenKcal: eaten, goalKcal: goal, protein: .init(eaten: 76, goal: 125),
                                     fat: .init(eaten: 49, goal: 80), carbs: .init(eaten: 18, goal: 230)),
                    water: water)
    }

    static func user(_ id: Int64 = 7, role: String = "client") -> SessionUser {
        SessionUser(id: id, email: "anna@example.com", role: role)
    }

    /// Keychain с сессией приложения, как её пишет `SessionStore`.
    static func keychain(user: SessionUser? = user(), accessToken: String = "access") -> InMemorySecureStore {
        let secure = InMemorySecureStore()
        if let user, let data = try? JSONEncoder().encode(NativeSession(accessToken: accessToken, refreshToken: "refresh", user: user)) {
            try? secure.write(data, for: "session")
        }
        return secure
    }

    /// Сервер «Сегодня» (как в `TodayModelTests`): съедено 549 из 2 472.
    static func todayServer() -> StubTransport {
        StubTransport { request in
            switch request.path {
            case let path where path.hasPrefix("/api/v1/dashboard/daily/"):
                let date = String(path.suffix(10))
                return .success(#"{"id":"x","user_id":7,"date":"\#(date)T00:00:00Z","calories":549,"protein":76,"fat":49,"carbs":18,"#
                                + #""steps":6412,"workout_completed":false,"steps_source":"healthkit","weight_source":null,"#
                                + #""workout_source":null}"#)
            case "/api/v1/dashboard/week": return .success(#"{"metrics":[],"count":0}"#)
            case "/api/v1/dashboard/weekly-plan": return .success(#"{"plan":null}"#)
            case "/api/v1/nutrition-calc/targets":
                return .success(#"{"id":1,"date":"2025-10-17","calories":2472,"protein":125,"fat":80,"carbs":230,"#
                                + #""workout_bonus":0,"source":"calculated"}"#)
            case "/api/v1/food-tracker/water":
                return request.method == "POST" ? .success(#"{"glasses":6,"goal":8,"glass_size":250,"enabled":true}"#)
                    : .success(#"{"glasses":5,"goal":8,"glass_size":250,"enabled":true}"#)
            case "/api/v1/dashboard/tasks": return .success(#"{"tasks":[],"count":0,"week":0}"#)
            case "/api/v1/dashboard/onboarding":
                return .success(#"{"active":false,"steps":[],"curator":null,"curator_access":{"allowed":false,"expired":false}}"#)
            case "/api/v1/dashboard/progress": return .success(#"{"weight_trend":[],"nutrition_adherence":0,"target_weight":null}"#)
            case "/api/v1/nutrition-calc/history": return .success(#"{"days":[]}"#)
            case "/api/v1/notifications/unread-counts": return .success(#"{"main":0,"content":0}"#)
            default: return .error(404, code: "not_found")
            }
        }
    }

    static func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
    }
}
