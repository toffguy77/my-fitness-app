import Client
@testable import Curator
import Foundation
import XCTest

final class CuratorTextTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)
    /// 17 октября 2025, 14:00 по Москве.
    private let now = Date(timeIntervalSince1970: 1_760_698_800)

    // ios-curator-chat «Список переписок»: время — как в вебе.
    func testRelativeTime() {
        let table: [(TimeInterval, String)] = [
            (20, "только что"),
            (5 * 60, "5 мин назад"),
            (3 * 3600 + 120, "3 ч назад"),
            (23 * 3600, "23 ч назад"),
            (26 * 3600, "вчера"),
            (3 * 86_400, "14.10.2025"),
        ]
        for (ago, expected) in table {
            XCTAssertEqual(CuratorText.relative(now.addingTimeInterval(-ago), now: now, calendar: calendar), expected, "\(ago)")
        }
    }

    func testPreview() {
        XCTAssertEqual(CuratorText.preview(type: "image", content: "https://x"), "Фото")
        XCTAssertEqual(CuratorText.preview(type: "file", content: "https://x"), "Файл")
        XCTAssertEqual(CuratorText.preview(type: "food_entry", content: "Торт"), "КБЖУ запись")
        XCTAssertEqual(CuratorText.preview(type: nil, content: nil), "Нет сообщений")
        let long = String(repeating: "а", count: 49) + " ббб"
        XCTAssertEqual(CuratorText.preview(type: "text", content: long), String(repeating: "а", count: 49) + "...")
        XCTAssertEqual(CuratorText.preview(type: "text", content: "Спасибо!"), "Спасибо!")
    }

    func testInitialsAndPlurals() {
        XCTAssertEqual(CuratorText.initials("Мария К."), "МК")
        XCTAssertEqual(CuratorText.initials("игорь"), "И")
        XCTAssertEqual(CuratorText.initials(" "), "?")
        XCTAssertEqual(CuratorText.years(32), "32 года")
        XCTAssertEqual(CuratorText.years(41), "41 год")
        XCTAssertEqual(CuratorText.years(11), "11 лет")
        XCTAssertEqual(CuratorText.days(1), "1 день")
        XCTAssertEqual(CuratorText.days(3), "3 дня")
        XCTAssertEqual(CuratorText.days(12), "12 дней")
    }

    // ios-curator-client-card «Карточка открывается на нужной вкладке».
    func testCardTabFromLink() {
        let table: [(String?, ClientCardTab)] = [
            ("overview", .overview), ("plan", .plan), ("tasks", .tasks), ("reports", .reports),
            ("Reports", .reports), (nil, .overview), ("", .overview), ("billing", .overview),
        ]
        for (raw, tab) in table {
            XCTAssertEqual(ClientCardTab(link: raw), tab, raw ?? "nil")
        }
    }
}
