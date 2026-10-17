import Foundation
import Security
import Session
@testable import Vzvesheno
import XCTest

/// ios-session-storage: «Проверка атрибутов» на настоящем Keychain.
final class KeychainTests: XCTestCase {
    func testSessionItemAttributes() throws {
        let environment = AppEnvironment.current()
        let group = try XCTUnwrap(environment.keychainAccessGroup, "группа Keychain из Info.plist")
        XCTAssertTrue(group.hasSuffix("team.burcev.app.dev.shared"), group)
        let store = KeychainStore(policy: KeychainPolicy(service: "tests.\(UUID().uuidString)", accessGroup: group))
        defer { try? store.deleteAll() }

        try store.write(Data("refresh".utf8), for: "session")
        let attributes = try XCTUnwrap(store.storedAttributes("session"))
        XCTAssertEqual(attributes[kSecAttrAccessible as String] as? String,
                       kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
        XCTAssertEqual(attributes[kSecAttrAccessGroup as String] as? String, group)
        XCTAssertEqual(try store.read("session"), Data("refresh".utf8))

        try store.deleteAll()
        XCTAssertNil(try store.read("session"))
    }
}
