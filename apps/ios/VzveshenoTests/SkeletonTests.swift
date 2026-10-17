import Session
import XCTest

final class SkeletonTests: XCTestCase {
    func testInfoPlistDeclaresEnvironment() {
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "AppEnvironment") as? String, "dev")
        print("KeychainAccessGroup=", Bundle.main.object(forInfoDictionaryKey: "KeychainAccessGroup") ?? "nil")
    }

    func testKeychainRoundTripWithAccessGroup() throws {
        let group = Bundle.main.object(forInfoDictionaryKey: "KeychainAccessGroup") as? String
        let store = KeychainStore(policy: KeychainPolicy(service: "skeleton.\(UUID().uuidString)", accessGroup: group))
        try store.write(Data("x".utf8), for: "k")
        XCTAssertEqual(try store.read("k"), Data("x".utf8))
        print("stored attributes:", try store.storedAttributes("k") ?? [:])
        try store.deleteAll()
    }
}
