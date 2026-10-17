@testable import Client
import Foundation
import XCTest

final class RealtimeTests: XCTestCase {
    func testFramesBecomeEvents() {
        XCTAssertEqual(RealtimeEvent.parse(Data(#"{"type":"new_message","data":{"id":"m","conversation_id":"c1"}}"#.utf8)),
                       .newMessage(conversationID: "c1"))
        XCTAssertEqual(RealtimeEvent.parse(Data(#"{"type":"unread_count_update","data":{"count":3}}"#.utf8)), .unreadCount(3))
        XCTAssertEqual(RealtimeEvent.parse(Data(#"{"type":"content_notification","data":{"notification":{"id":"n"}}}"#.utf8)),
                       .contentNotification)
        XCTAssertNil(RealtimeEvent.parse(Data(#"{"type":"task_assigned","data":{}}"#.utf8)))
        XCTAssertNil(RealtimeEvent.parse(Data("не json".utf8)))
    }

    func testSocketAddressCarriesTheTicket() {
        let url = RealtimeEvent.socketURL(base: URL(string: "https://new.burcev.team")!, ticket: "abc")
        XCTAssertEqual(url?.absoluteString, "wss://new.burcev.team/ws?ticket=abc")
    }
}
