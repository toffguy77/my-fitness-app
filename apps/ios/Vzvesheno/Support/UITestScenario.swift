#if DEBUG
import API
import Foundation
import Session

/// Сценарии UI-тестов: приложение запускается с `-uiTestScenario <имя>` и
/// ходит не в сеть, а в заготовленные ответы. Только отладочная сборка.
enum UITestScenario: String {
    case client
    case coordinator
    case superAdmin = "super_admin"
    case nutritionist
    /// Версия ниже минимальной из /config.
    case update
    case signedOut
    /// Нет сети, а в Keychain — профиль клиента.
    case offlineClient

    static var current: UITestScenario? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-uiTestScenario"), index + 1 < arguments.count else { return nil }
        return UITestScenario(rawValue: arguments[index + 1])
    }

    var role: String {
        switch self {
        case .coordinator: return "coordinator"
        case .superAdmin: return "super_admin"
        case .nutritionist: return "nutritionist"
        case .client, .update, .signedOut, .offlineClient: return "client"
        }
    }

    @MainActor
    func makeModel(environment: AppEnvironment) -> AppModel {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("uitest-\(UUID().uuidString)")
        let secure = InMemorySecureStore()
        if self != .signedOut {
            let session = NativeSession(accessToken: "access", refreshToken: "refresh",
                                        user: SessionUser(id: 7, email: "anna@example.com", name: "Анна", role: role,
                                                          emailVerified: true, onboardingCompleted: true))
            if let data = try? JSONEncoder().encode(session) {
                try? secure.write(data, for: "session")
            }
        }
        return AppModel(environment: environment, transport: ScenarioTransport(scenario: self), secure: secure,
                        installMarker: MarkedInstall(), directory: directory, deviceName: "UI test")
    }
}

private struct MarkedInstall: InstallMarker {
    func isMarked() -> Bool { true }
    func mark() {}
}

/// Заготовленные ответы сервера для сценария.
private struct ScenarioTransport: HTTPTransport {
    let scenario: UITestScenario

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let path = request.url?.path ?? ""
        if scenario == .offlineClient && path != "/api/v1/config" {
            throw URLError(.notConnectedToInternet)
        }
        let (status, body) = respond(path)
        let response = HTTPURLResponse(url: request.url ?? URL(fileURLWithPath: "/"), statusCode: status,
                                       httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])
        guard let response else { throw URLError(.badServerResponse) }
        return (Data(body.utf8), response)
    }

    private func respond(_ path: String) -> (Int, String) {
        switch path {
        case "/api/v1/config":
            let minimum = scenario == .update ? "9.0.0" : "1.0.0"
            return (200, #"{"features":{},"ios":{"min_supported_version":"\#(minimum)"},"support_url":"mailto:support@burcev.team","#
                + #""legal":{"terms_url":"https://new.burcev.team/legal/terms","privacy_url":"https://new.burcev.team/legal/privacy"}}"#)
        case "/api/v1/auth/me":
            return (200, #"{"status":"success","data":{"user":{"id":7,"email":"anna@example.com","role":"\#(scenario.role)"}}}"#)
        case "/api/v1/auth/providers":
            return (200, #"{"status":"success","data":{"providers":["yandex","vk"]}}"#)
        case "/api/v1/users/profile":
            return (200, #"{"status":"success","data":{"settings":{"language":"ru"}}}"#)
        case "/api/v1/auth/native/logout":
            return (204, "")
        default:
            return (404, #"{"status":"error","code":"not_found"}"#)
        }
    }
}
#endif
