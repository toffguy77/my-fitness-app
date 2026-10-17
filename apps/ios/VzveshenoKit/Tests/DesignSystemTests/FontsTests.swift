@testable import DesignSystem
import Foundation
import XCTest
#if canImport(UIKit)
import UIKit
#endif

final class FontsTests: XCTestCase {
    /// Файлы шрифтов и их лицензии OFL лежат в ресурсах модуля.
    func testFontFilesAndLicencesAreBundled() {
        XCTAssertEqual(DS.Fonts.urls.count, DS.Fonts.files.count)
        let directory = DS.Fonts.urls.first?.deletingLastPathComponent()
        for licence in ["Literata-OFL.txt", "GolosText-OFL.txt"] {
            let path = directory?.appendingPathComponent(licence).path ?? ""
            XCTAssertTrue(FileManager.default.fileExists(atPath: path), licence)
        }
    }

    #if canImport(UIKit)
    /// Семейства из токенов (`DS.FontFamily`) находятся после регистрации —
    /// иначе `Font.custom` молча упал бы на системный шрифт.
    func testTokenFamiliesResolveAfterRegistration() {
        XCTAssertTrue(DS.Fonts.register())
        for family in [DS.FontFamily.serif, DS.FontFamily.sans] {
            XCTAssertFalse(UIFont.fontNames(forFamilyName: family).isEmpty, "нет семейства \(family)")
            let font = CTFontCreateWithName(family as CFString, 16, nil)
            XCTAssertEqual(CTFontCopyFamilyName(font) as String, family, "по имени \(family) находится другой шрифт")
        }
    }
    #endif
}
