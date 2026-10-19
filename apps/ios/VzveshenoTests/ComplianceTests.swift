import Client
import Foundation
@testable import Vzvesheno
import XCTest

/// ios-platform-compliance: манифест, декларации сборки и зависимости.
final class ComplianceTests: XCTestCase {
    private var info: [String: Any] { Bundle.main.infoDictionary ?? [:] }

    // Сценарий «Проверка Info.plist».
    func testBackgroundModesAndOutboxTask() {
        let modes = info["UIBackgroundModes"] as? [String] ?? []
        XCTAssertTrue(modes.contains("remote-notification"))
        XCTAssertTrue(modes.contains("fetch"))
        let tasks = info["BGTaskSchedulerPermittedIdentifiers"] as? [String] ?? []
        XCTAssertTrue(tasks.contains(AppEnvironment.current().outboxTaskID), "\(tasks)")
    }

    func testBuildDeclarations() {
        XCTAssertEqual(info["ITSAppUsesNonExemptEncryption"] as? Bool, false)
        XCTAssertNil(info["NSUserTrackingUsageDescription"], "запроса App Tracking Transparency нет")
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String, "Взвешено")
        XCTAssertEqual(info["CFBundleShortVersionString"] as? String, "1.0.0")
        XCTAssertEqual(AppEnvironment.current().apiBaseURL.absoluteString, "https://new.burcev.team")
    }

    /// 7.1: тексты системных разрешений — по-русски и про то, зачем они.
    func testPermissionStringsAreRussian() {
        let keys = ["NSCameraUsageDescription", "NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription",
                    "NSHealthShareUsageDescription", "NSHealthUpdateUsageDescription"]
        for key in keys {
            let text = info[key] as? String ?? ""
            XCTAssertFalse(text.isEmpty, key)
            XCTAssertNotNil(text.range(of: "[А-Яа-яЁё]", options: .regularExpression), "\(key): \(text)")
        }
    }

    // Сценарий «Проверка сборки»: манифест в .app и .appex.
    func testPrivacyManifestsInAppAndExtension() throws {
        var bundles = [Bundle.main.bundleURL]
        let plugins = try FileManager.default.contentsOfDirectory(at: XCTUnwrap(Bundle.main.builtInPlugInsURL),
                                                                  includingPropertiesForKeys: nil)
        bundles += plugins.filter { $0.pathExtension == "appex" }
        XCTAssertEqual(bundles.count, 2, "приложение и расширение виджетов")
        for bundle in bundles {
            let url = bundle.appendingPathComponent("PrivacyInfo.xcprivacy")
            let data = try Data(contentsOf: url)
            let plist = try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
            XCTAssertNotNil(plist["NSPrivacyAccessedAPITypes"], bundle.lastPathComponent)
            XCTAssertEqual(plist["NSPrivacyTracking"] as? Bool, false, bundle.lastPathComponent)
        }
    }

    /// Ярлыки приватности: здоровье, фитнес, фото, почта, события и сбои — без отслеживания.
    func testCollectedDataTypes() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let plist = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        let types = (plist["NSPrivacyCollectedDataTypes"] as? [[String: Any]] ?? [])
        let names = Set(types.compactMap { $0["NSPrivacyCollectedDataType"] as? String })
        for required in ["NSPrivacyCollectedDataTypeHealth", "NSPrivacyCollectedDataTypeFitness",
                         "NSPrivacyCollectedDataTypePhotosorVideos", "NSPrivacyCollectedDataTypeEmailAddress",
                         "NSPrivacyCollectedDataTypeProductInteraction", "NSPrivacyCollectedDataTypeCrashData"] {
            XCTAssertTrue(names.contains(required), required)
        }
        XCTAssertTrue(types.allSatisfy { $0["NSPrivacyCollectedDataTypeTracking"] as? Bool == false })
    }

    // Сценарий «Проверка зависимостей»: из сторонних — только Sentry (отчёты о сбоях);
    // у пакета — только swift-markdown Apple (статьи).
    func testOnlyAllowedThirdPartyPackages() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let project = try String(contentsOf: root.appendingPathComponent("project.yml"), encoding: .utf8)
        let manifest = try String(contentsOf: root.appendingPathComponent("VzveshenoKit/Package.swift"), encoding: .utf8)

        let packages = Self.topLevelPackages(project)
        XCTAssertEqual(Set(packages), ["VzveshenoKit", "Sentry"], "сторонний пакет приложения — только Sentry")
        // Единственная зависимость VzveshenoKit — apple/swift-markdown (Apple,
        // swiftlang): разбор статей (design.md ios-client-app).
        let dependencies = manifest.components(separatedBy: ".package(url:").dropFirst()
            .map { String($0.split(separator: "\"")[1]) }
        XCTAssertEqual(dependencies, ["https://github.com/swiftlang/swift-markdown.git"], "у VzveshenoKit только swift-markdown")

        let forbidden = ["appmetrica", "firebase", "adjust", "appsflyer", "amplitude", "mixpanel", "branch", "facebook",
                         "yandexmobile", "mytracker"]
        let lowered = (project + manifest).lowercased()
        for name in forbidden {
            XCTAssertFalse(lowered.contains(name), "запрещённый SDK: \(name)")
        }
    }

    /// Окружение APNs — по конфигурации сборки: Debug → development/sandbox,
    /// Release (архив, TestFlight) → production, на обоих стендах. Иначе
    /// TestFlight-сборка Dev отправляет боевой токен как sandbox, APNs
    /// отвечает BadDeviceToken, и сервер отключает устройство.
    func testPushEnvironmentFollowsBuildConfiguration() throws {
        // Тесты идут в Dev-Debug.
        XCTAssertEqual(info["APSEnvironment"] as? String, "development")
        XCTAssertEqual(PushEnvironment.forBuild(apsEnvironment: AppEnvironment.current().apsEnvironment), "sandbox")

        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let project = try String(contentsOf: root.appendingPathComponent("project.yml"), encoding: .utf8)
        let values = Self.apsEnvironments(project)
        XCTAssertEqual(values, ["Dev-Debug": "development", "Dev-Release": "production",
                                "Prod-Debug": "development", "Prod-Release": "production"])
    }

    /// `APS_ENVIRONMENT` каждой конфигурации из `settings.configs` project.yml.
    static func apsEnvironments(_ yaml: String) -> [String: String] {
        var result: [String: String] = [:]
        var config: String?
        for line in yaml.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("    "), !line.hasPrefix("     "), trimmed.hasSuffix(":"),
               trimmed.hasPrefix("Dev-") || trimmed.hasPrefix("Prod-") {
                config = String(trimmed.dropLast())
            } else if let config, trimmed.hasPrefix("APS_ENVIRONMENT:") {
                result[config] = trimmed.replacingOccurrences(of: "APS_ENVIRONMENT:", with: "")
                    .trimmingCharacters(in: .whitespaces)
            }
        }
        return result
    }

    /// Имена пакетов из раздела `packages:` project.yml.
    static func topLevelPackages(_ yaml: String) -> [String] {
        var inside = false
        var names: [String] = []
        for line in yaml.components(separatedBy: "\n") {
            if line.hasPrefix("packages:") { inside = true; continue }
            if inside, let first = line.first, !first.isWhitespace, first != "#" { break }
            if inside, line.hasPrefix("  "), !line.hasPrefix("   "), line.hasSuffix(":"),
               !line.trimmingCharacters(in: .whitespaces).hasPrefix("#") {
                names.append(line.trimmingCharacters(in: .whitespaces).dropLast().description)
            }
        }
        return names
    }
}
