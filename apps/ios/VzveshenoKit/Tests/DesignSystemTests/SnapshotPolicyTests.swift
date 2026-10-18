import XCTest

/// Снимок без эталона в CI не превращается в эталон: иначе повтор
/// упавшего теста (`-retry-tests-on-failure`) находит его и проходит.
final class SnapshotPolicyTests: XCTestCase {
    func testMissingReferenceFailsInCI() {
        XCTAssertEqual(SnapshotPolicy.decide(hasReference: false, environment: ["CI": "true"]), .missingInCI)
        XCTAssertEqual(SnapshotPolicy.decide(hasReference: false, environment: ["CI": "1"]), .missingInCI)
    }

    func testMissingReferenceIsRecordedLocally() {
        XCTAssertEqual(SnapshotPolicy.decide(hasReference: false, environment: [:]), .record)
        XCTAssertEqual(SnapshotPolicy.decide(hasReference: false, environment: ["CI": "false"]), .record)
    }

    func testReferenceIsCompared() {
        XCTAssertEqual(SnapshotPolicy.decide(hasReference: true, environment: ["CI": "true"]), .compare)
        XCTAssertEqual(SnapshotPolicy.decide(hasReference: true, environment: [:]), .compare)
    }

    func testExplicitRecordWins() {
        XCTAssertEqual(SnapshotPolicy.decide(hasReference: true, environment: ["SNAPSHOT_RECORD": "1", "CI": "true"]), .record)
    }
}
