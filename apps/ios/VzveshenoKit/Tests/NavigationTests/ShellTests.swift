import Foundation
@testable import Navigation
import TestSupport
import XCTest

final class ShellTests: XCTestCase {
    // ios-role-shell: интерфейс по роли.
    func testShellPerRole() {
        XCTAssertEqual(Shell(role: Role("client")).tabs, [.today, .diary, .menu, .articles])
        XCTAssertEqual(Shell(role: Role("coordinator")).tabs, [.clients, .chats, .leads, .support])
        XCTAssertEqual(Shell(role: Role("super_admin")).tabs, [.leads, .support])
        // Сценарий «Новая серверная роль»: nutritionist — «доступно в веб-версии».
        XCTAssertEqual(Shell(role: Role("nutritionist")), .webOnly)
        XCTAssertEqual(Shell(role: Role("nutritionist")).tabs, [])
        XCTAssertNotEqual(Shell(role: .superAdmin), .client, "суперадмин не получает клиентский интерфейс")
    }

    // Сценарий «Роль ещё не пришла»: ни одного таббара.
    func testNoRoleYetShowsLoading() {
        XCTAssertEqual(LaunchState.resolve(isSignedIn: true, serverRole: nil, cachedRole: nil,
                                           serverUnreachable: false, updateRequired: false), .loading)
    }

    // Сценарий «Нет сети, есть кэш профиля».
    func testOfflineWithCachedProfile() {
        XCTAssertEqual(LaunchState.resolve(isSignedIn: true, serverRole: nil, cachedRole: .client,
                                           serverUnreachable: true, updateRequired: false), .shell(.client, offline: true))
    }

    // Сценарий «Куратор входит».
    func testCoordinatorFromServer() {
        XCTAssertEqual(LaunchState.resolve(isSignedIn: true, serverRole: .coordinator, cachedRole: .client,
                                           serverUnreachable: false, updateRequired: false), .shell(.curator, offline: false))
    }

    func testUpdateRequiredWinsOverEverything() {
        XCTAssertEqual(LaunchState.resolve(isSignedIn: false, serverRole: nil, cachedRole: nil,
                                           serverUnreachable: false, updateRequired: true), .updateRequired)
    }

    func testRoleCodableRoundTrip() throws {
        let data = try JSONEncoder().encode([Role.superAdmin, Role.other("nutritionist")])
        XCTAssertEqual(try JSONDecoder().decode([Role].self, from: data), [.superAdmin, .other("nutritionist")])
    }

    /// Подписи вкладок есть в каталоге строк приложения.
    func testTabTitlesAreInCatalog() throws {
        let catalog = try StringCatalog(relativePath: "apps/ios/Vzvesheno/Resources/Localizable.xcstrings")
        for tab in AppTab.allCases {
            XCTAssertNotNil(catalog.value(tab.titleKey), tab.titleKey)
        }
    }
}

final class VersionGateTests: XCTestCase {
    private func config(_ min: String) -> ClientConfig {
        ClientConfig(ios: .init(minSupportedVersion: min))
    }

    func testVersionComparison() throws {
        let cases: [(String, String, Bool)] = [
            ("1.0.0", "1.0.0", false), ("1.0.0", "1.0.1", true), ("1.2.0", "1.10.0", true),
            ("2.0", "1.9.9", false), ("1.0.0", "1", false), ("0.9.9", "1.0.0", true),
        ]
        for (current, minimum, blocked) in cases {
            XCTAssertEqual(VersionGate.isUpdateRequired(current: current, config: config(minimum)), blocked, "\(current) / \(minimum)")
        }
    }

    // Сценарий «Версия ниже минимальной».
    func testBelowMinimumBlocks() {
        XCTAssertTrue(VersionGate.isUpdateRequired(current: "1.0.0", config: config("1.2.0")))
    }

    func testMissingOrBrokenConfigDoesNotBlock() {
        XCTAssertFalse(VersionGate.isUpdateRequired(current: "1.0.0", config: nil))
        XCTAssertFalse(VersionGate.isUpdateRequired(current: "1.0.0", config: config("скоро")))
        XCTAssertNil(AppVersion("1.2.3.4"))
        XCTAssertNil(AppVersion("1.-2"))
    }

    // Сценарий «Конфигурация недоступна»: последняя сохранённая.
    func testUnreachableConfigUsesLastSaved() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("config-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: url) }
        let cache = FileConfigCache(url: url)
        let online = ConfigLoader(cache: cache) { ClientConfig(ios: .init(minSupportedVersion: "1.2.0")) }
        _ = await online.load()
        let offline = ConfigLoader(cache: cache) { throw URLError(.notConnectedToInternet) }
        let loaded = await offline.load()
        XCTAssertEqual(loaded?.ios.minSupportedVersion, "1.2.0")
        XCTAssertTrue(VersionGate.isUpdateRequired(current: "1.0.0", config: loaded))

        let empty = ConfigLoader(cache: FileConfigCache(url: url.appendingPathExtension("none"))) {
            throw URLError(.notConnectedToInternet)
        }
        let nothing = await empty.load()
        XCTAssertNil(nothing)
        XCTAssertFalse(VersionGate.isUpdateRequired(current: "1.0.0", config: nothing), "недоступность /config не блокирует")
    }

    func testDecodesServerConfig() throws {
        let json = #"{"features":{"email":true},"ios":{"min_supported_version":"1.0.0"},"support_url":"mailto:support@burcev.team","#
            + #""legal":{"terms_url":"https://burcev.team/legal/terms","privacy_url":"https://burcev.team/legal/privacy"}}"#
        let config = try JSONDecoder().decode(ClientConfig.self, from: Data(json.utf8))
        XCTAssertEqual(config.ios.minSupportedVersion, "1.0.0")
        XCTAssertEqual(config.legal?.termsURL, "https://burcev.team/legal/terms")
    }
}

/// Маршрут после входа (`ios-auth-flows`).
final class PostSignInRouteTests: XCTestCase {
    private func resolve(role: Role = .client, deletion: Bool = false, verified: Bool? = true, onboarded: Bool? = true) -> LaunchState {
        LaunchState.resolve(isSignedIn: true, serverRole: role, cachedRole: nil, serverUnreachable: false, updateRequired: false,
                            pendingDeletion: deletion, emailVerified: verified, onboardingCompleted: onboarded)
    }

    /// «Почта не подтверждена» — экран кода.
    func testUnverifiedEmailOpensTheCodeScreen() {
        XCTAssertEqual(resolve(verified: false), .verifyEmail)
        XCTAssertEqual(resolve(role: .coordinator, verified: false), .verifyEmail)
    }

    func testOnboardingOnlyForClients() {
        XCTAssertEqual(resolve(onboarded: false), .onboarding)
        XCTAssertEqual(resolve(role: .coordinator, onboarded: false), .shell(.curator, offline: false))
    }

    func testPendingDeletionComesFirst() {
        XCTAssertEqual(resolve(deletion: true, verified: false, onboarded: false), .pendingDeletion)
    }

    func testEverythingDoneOpensTheRolesRoot() {
        XCTAssertEqual(resolve(), .shell(.client, offline: false))
        XCTAssertEqual(resolve(verified: nil, onboarded: nil), .shell(.client, offline: false), "старая сессия без признаков")
    }

    func testExportOpensUnderTheProfile() {
        XCTAssertEqual(Router.target(for: .export, shell: .client), NavigationTarget(tab: .today, path: [.profile, .export]))
        XCTAssertEqual(Router.target(for: .article(slug: "x"), shell: .client),
                       NavigationTarget(tab: .articles, path: [.article(slug: "x")]))
    }
}
