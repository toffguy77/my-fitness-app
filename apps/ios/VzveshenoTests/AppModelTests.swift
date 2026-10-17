import API
import Foundation
import Navigation
import Session
@testable import Vzvesheno
import XCTest

/// ios-role-shell и ios-deep-links на модели приложения с заготовленными ответами.
@MainActor
final class AppModelTests: XCTestCase {
    private func started(_ scenario: UITestScenario) async -> AppModel {
        let model = scenario.makeModel(environment: AppEnvironment.current())
        await model.start()
        return model
    }

    func testShellForEachRole() async {
        let expected: [(UITestScenario, LaunchState)] = [
            (.client, .shell(.client, offline: false)),
            (.coordinator, .shell(.curator, offline: false)),
            (.superAdmin, .shell(.admin, offline: false)),
            (.nutritionist, .shell(.webOnly, offline: false)),
            (.signedOut, .signedOut),
            (.update, .updateRequired),
            (.offlineClient, .shell(.client, offline: true)),
        ]
        for (scenario, state) in expected {
            let model = await started(scenario)
            XCTAssertEqual(model.launch, state, scenario.rawValue)
        }
    }

    func testCoordinatorTabs() async {
        let model = await started(.coordinator)
        guard case let .shell(shell, _) = model.launch else { return XCTFail("нет оболочки") }
        XCTAssertEqual(shell.tabs.map(\.title), ["Клиенты", "Чаты", "Заявки", "Обращения"])
        XCTAssertEqual(model.selectedTab, .clients)
    }

    func testClientTabsHaveNoChatTab() async {
        let model = await started(.client)
        guard case let .shell(shell, _) = model.launch else { return XCTFail("нет оболочки") }
        XCTAssertEqual(shell.tabs.map(\.title), ["Сегодня", "Дневник", "Меню", "Ещё"])
    }

    func testDeepLinkOpensTabAndPath() async throws {
        let model = await started(.client)
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/food-tracker?date=2026-10-15&add=barcode")))
        XCTAssertEqual(model.selectedTab, .diary)
        XCTAssertEqual(model.paths[.diary], [.diaryDay(date: "2026-10-15", add: .barcode)])
    }

    /// Сценарий «Пуш на устройстве после выхода».
    func testLinkBeforeSignInOpensAfterSignIn() async throws {
        let model = await started(.signedOut)
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/chat")))
        XCTAssertEqual(model.launch, .signedOut)
        let user = SessionUser(id: 7, email: "anna@example.com", role: "client")
        try await model.complete(.signedIn(NativeSession(accessToken: "a", refreshToken: "r", user: user), created: false))
        XCTAssertEqual(model.launch, .shell(.client, offline: false))
        XCTAssertEqual(model.selectedTab, .today)
        XCTAssertEqual(model.paths[.today], [.curatorChat])
    }

    /// Сценарий «Ссылка входа при открытой сессии»: сессия не заменяется молча.
    func testMagicLinkWhileSignedInAsksFirst() async throws {
        let model = await started(.client)
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/auth/link/consume?token=attacker")))
        XCTAssertEqual(model.authLinkAwaitingConfirmation, .magicLink(token: "attacker"))
        XCTAssertEqual(model.launch, .shell(.client, offline: false), "сессия на месте, пока человек не подтвердил")
        model.cancelSwitchingAccount()
        XCTAssertNil(model.authLinkAwaitingConfirmation)
        let user = await model.session.user
        XCTAssertEqual(user?.id, 7)
    }

    func testResetLinkWhileSignedOutOpensImmediately() async throws {
        let model = await started(.signedOut)
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/reset-password?token=r1")))
        XCTAssertNil(model.authLinkAwaitingConfirmation)
        XCTAssertEqual(model.signInStep, .resetPassword(token: "r1"))
    }

    func testSignOutReturnsToSignIn() async {
        let model = await started(.client)
        await model.signOut()
        // Конец сессии доходит через поток событий.
        for _ in 0..<50 where model.launch != .signedOut {
            try? await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(model.launch, .signedOut)
        let user = await model.session.user
        XCTAssertNil(user)
    }
}
