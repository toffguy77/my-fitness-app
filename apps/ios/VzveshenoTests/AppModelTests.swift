import API
import Client
import Foundation
import Navigation
import Outbox
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
            // Свежая /config приходит фоном после запуска — дождаться её.
            await model.refreshConfig()
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
        XCTAssertEqual(shell.tabs.map(\.title), ["Сегодня", "Дневник", "Меню", "Статьи"])
    }

    /// «Дневник» — корень своей вкладки: ссылка открывает его на дате из
    /// `?date=` и лист «Записать еду» на способе из `?add=`, а не кладёт
    /// второй дневник в путь навигации.
    func testDeepLinkOpensTabAndPath() async throws {
        let model = await started(.client)
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/food-tracker?date=2026-10-15&add=barcode")))
        XCTAssertEqual(model.selectedTab, .diary)
        XCTAssertEqual(model.paths[.diary], [])
        XCTAssertEqual(model.foodLog?.method, .barcode)
        XCTAssertEqual(model.foodLog?.date, "2026-10-15")
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

    /// Холодный запуск по ссылке: сессия ещё только в Keychain — всё равно вопрос.
    func testColdStartLinkWithStoredSessionAsksFirst() async throws {
        let model = UITestScenario.client.makeModel(environment: AppEnvironment.current())
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/auth/link/consume?token=attacker")))
        XCTAssertEqual(model.authLinkAwaitingConfirmation, .magicLink(token: "attacker"))
        await model.start()
        let user = await model.session.user
        XCTAssertEqual(user?.id, 7, "сессия не заменена")
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

/// Очередь изменений на уровне приложения (`ios-offline-outbox`): досылка до
/// восстановления сессии, отказы из любой досылки, ссылки до оболочки.
@MainActor
final class OutboxAppTests: XCTestCase {
    private func breakfast() throws -> Endpoint {
        try Endpoint.post("/api/v1/food-tracker/entries", body: ["foodId": "p1", "date": "2026-10-17"])
    }

    /// Фоновая задача или тихий пуш раньше `start()`: очередь не стирается.
    func testDrainBeforeStartKeepsTheQueueOffline() async throws {
        let model = UITestScenario.offlineClient.makeModel(environment: AppEnvironment.current())
        try await model.outbox.enqueue(kind: "diary.add", endpoint: try breakfast(), userID: 7)
        await model.drainOutbox()
        let left = try await model.outbox.pending()
        XCTAssertEqual(left.count, 1, "запись в метро на месте")
    }

    /// До `start()` досылка сначала поднимает сессию — и отправляет своим токеном.
    func testDrainBeforeStartUsesTheRestoredSession() async throws {
        let model = UITestScenario.client.makeModel(environment: AppEnvironment.current())
        try await model.outbox.enqueue(kind: "diary.add", endpoint: try breakfast(), userID: 7)
        await model.drainOutbox()
        let left = try await model.outbox.pending()
        XCTAssertTrue(left.isEmpty)
    }

    /// Отказ из досылки приложения доходит до «Сегодня»: сообщение по коду.
    func testRejectionFromAppDrainReachesToday() async throws {
        let model = UITestScenario.client.makeModel(environment: AppEnvironment.current())
        await model.start()
        try await model.outbox.enqueue(kind: "today.metric.weight",
                                       endpoint: try Endpoint.post("/api/v1/uitest/rejected", body: ["date": "2026-10-17"]),
                                       userID: 7)
        await model.drainOutbox()
        XCTAssertNotNil(model.today?.notice)
        let left = try await model.outbox.pending()
        XCTAssertTrue(left.isEmpty)
    }

    /// Изменение без своего экрана (Здоровье) — общее сообщение приложения.
    func testRejectionWithoutScreenIsAnAppNotice() async throws {
        let model = UITestScenario.client.makeModel(environment: AppEnvironment.current())
        await model.start()
        try await model.outbox.enqueue(kind: "health.import",
                                       endpoint: try Endpoint.post("/api/v1/uitest/rejected", body: ["a": 1]), userID: 7)
        await model.drainOutbox()
        XCTAssertNotNil(model.outboxNotice)
    }

    /// Отказ, записанный расширением виджетов, показывается при выходе на передний план.
    func testExtensionRejectionIsShownOnForeground() async throws {
        let model = UITestScenario.client.makeModel(environment: AppEnvironment.current())
        await model.start()
        model.rejections.append(RejectedChange(id: UUID(), userID: 7, kind: "surface.water", code: "validation", status: 422))
        await model.showExtensionRejections()
        XCTAssertNotNil(model.today?.notice)
        XCTAssertTrue(model.rejections.take(userID: 7).isEmpty)
    }

    /// Пуш на холодном запуске: оболочки ещё нет — экран открывается с ней.
    func testLinkDuringColdStartOpensWhenShellAppears() async throws {
        let model = UITestScenario.client.makeModel(environment: AppEnvironment.current())
        XCTAssertEqual(model.launch, .loading)
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/chat")))
        await model.start()
        XCTAssertEqual(model.paths[.today], [.curatorChat])
    }

    /// Ссылка во время онбординга открывается, когда он пройден.
    func testLinkDuringOnboardingOpensAfterIt() async throws {
        let model = UITestScenario.newClient.makeModel(environment: AppEnvironment.current())
        await model.start()
        XCTAssertEqual(model.launch, .onboarding)
        await model.open(try XCTUnwrap(URL(string: "https://new.burcev.team/chat")))
        try await model.completeOnboarding(OnboardingDraft())
        XCTAssertEqual(model.launch, .shell(.client, offline: false))
        XCTAssertEqual(model.paths[.today], [.curatorChat])
    }
}

/// `ios-auth-flows`, «Аккаунт в процессе удаления» на модели приложения.
@MainActor
final class PendingDeletionModelTests: XCTestCase {
    func testCancelDeletionOpensTheRolesRoot() async throws {
        let model = UITestScenario.signedOut.makeModel(environment: AppEnvironment.current())
        await model.start()
        let outcome = try await model.auth.login(email: "deleting@example.com", password: "Secret12!")
        try await model.complete(outcome)
        XCTAssertEqual(model.launch, .pendingDeletion)
        XCTAssertEqual(model.pendingDeletion?.title, "Аккаунт будет удалён 31 октября")
        try await model.cancelDeletion()
        XCTAssertNil(model.pendingDeletion)
        XCTAssertEqual(model.launch, .shell(.client, offline: false))
    }

    func testCurrentWeightGoesAsMeasurementThroughTheApp() async throws {
        let model = UITestScenario.newClient.makeModel(environment: AppEnvironment.current())
        await model.start()
        XCTAssertEqual(model.launch, .onboarding)
        var draft = OnboardingDraft()
        draft.currentWeight = 78.4
        try await model.completeOnboarding(draft)
        XCTAssertEqual(model.launch, .shell(.client, offline: false))
    }
}
