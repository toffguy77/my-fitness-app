#if canImport(UIKit) && canImport(SwiftUI)
import DesignSystem
import SwiftUI
import UIKit
import XCTest

/// Снапшот вида: PNG рядом с тестом в `__Snapshots__`.
///
/// Что делать, решает `SnapshotPolicy`: эталона нет (или `SNAPSHOT_RECORD=1`,
/// через xcodebuild — `TEST_RUNNER_SNAPSHOT_RECORD=1`) — снимок записывается,
/// а тест падает: новый эталон смотрит человек и коммитит. В CI снимок без
/// эталона ложится рядом как `.new.png`, а не на место эталона, — иначе
/// повтор упавшего теста нашёл бы его и прошёл. Расхождение — рядом
/// кладётся `.actual.png` для сравнения.
/// Эталоны сняты на iPhone 16 Pro с iOS 18.5 (ios.yml); на другой версии
/// системы шрифты сглаживаются иначе.
@MainActor
func assertSnapshot<V: View>(
    _ view: V,
    named name: String,
    width: CGFloat = 393,
    colorScheme: ColorScheme = .light,
    dynamicType: DynamicTypeSize = .large,
    file: StaticString = #filePath,
    testName: String = #function,
    line: UInt = #line
) {
    DS.Fonts.register()
    let content = view
        .padding(DS.Space.screenX)
        .frame(width: width)
        .background(DS.Color.bgCanvas)
        .environment(\.colorScheme, colorScheme)
        .environment(\.dynamicTypeSize, dynamicType)
        .environment(\.locale, Locale(identifier: "ru_RU"))
    let renderer = ImageRenderer(content: content)
    renderer.scale = 2
    renderer.proposedSize = ProposedViewSize(width: width, height: nil)
    guard let image = renderer.cgImage, let png = UIImage(cgImage: image).pngData() else {
        XCTFail("не отрисовалось: \(name)", file: file, line: line)
        return
    }

    let directory = URL(fileURLWithPath: "\(file)").deletingLastPathComponent().appendingPathComponent("__Snapshots__")
    let test = testName.replacingOccurrences(of: "()", with: "")
    let reference = directory.appendingPathComponent("\(test).\(name).png")
    let actual = directory.appendingPathComponent("\(test).\(name).actual.png")
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: actual)
    try? FileManager.default.removeItem(at: directory.appendingPathComponent("\(test).\(name).new.png"))

    let stored = (try? Data(contentsOf: reference)).flatMap { UIImage(data: $0)?.cgImage }
    switch SnapshotPolicy.decide(hasReference: stored != nil, environment: ProcessInfo.processInfo.environment) {
    case .record:
        try? png.write(to: reference)
        XCTFail("записан эталон \(reference.lastPathComponent) — проверьте и закоммитьте", file: file, line: line)
        return
    case .missingInCI:
        let fresh = directory.appendingPathComponent("\(test).\(name).new.png")
        try? png.write(to: fresh)
        XCTFail("нет эталона \(reference.lastPathComponent): снимок — \(fresh.lastPathComponent) в артефакте ios-snapshots; "
                + "проверьте, переименуйте без .new и закоммитьте", file: file, line: line)
        return
    case .compare:
        break
    }
    guard let expected = stored else { return }
    if let difference = ImageDifference.compare(expected, image), difference > 0.001 {
        try? png.write(to: actual)
        XCTFail("снапшот \(name) разошёлся с эталоном: \(String(format: "%.2f", difference * 100))% точек", file: file, line: line)
    } else if ImageDifference.compare(expected, image) == nil {
        try? png.write(to: actual)
        XCTFail("снапшот \(name): размер \(image.width)×\(image.height), эталон \(expected.width)×\(expected.height)",
                file: file, line: line)
    }
}

enum ImageDifference {
    /// Доля точек, отличающихся заметно (больше 10 из 255 по любому каналу);
    /// `nil` — разные размеры.
    static func compare(_ lhs: CGImage, _ rhs: CGImage) -> Double? {
        guard lhs.width == rhs.width, lhs.height == rhs.height else { return nil }
        let left = pixels(lhs)
        let right = pixels(rhs)
        var differing = 0
        for index in stride(from: 0, to: left.count, by: 4) {
            for channel in 0..<4 where abs(Int(left[index + channel]) - Int(right[index + channel])) > 10 {
                differing += 1
                break
            }
        }
        return Double(differing) / Double(lhs.width * lhs.height)
    }

    private static func pixels(_ image: CGImage) -> [UInt8] {
        var buffer = [UInt8](repeating: 0, count: image.width * image.height * 4)
        buffer.withUnsafeMutableBytes { bytes in
            let context = CGContext(data: bytes.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
                                    bytesPerRow: image.width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            context?.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        }
        return buffer
    }
}
#endif

/// Записать снимок, сверить с эталоном или упасть без эталона.
///
/// Без эталона на Mac снимок записывается на его место (человек смотрит и
/// коммитит). В CI (`CI` — через `TEST_RUNNER_CI` у xcodebuild) так нельзя:
/// раннер повторяет упавший тест, повтор нашёл бы только что записанный
/// эталон и прошёл, и прогон стал бы зелёным с эталоном, которого нет в git.
enum SnapshotPolicy: Equatable {
    case record
    case missingInCI
    case compare

    static func decide(hasReference: Bool, environment: [String: String]) -> SnapshotPolicy {
        if environment["SNAPSHOT_RECORD"] == "1" { return .record }
        if hasReference { return .compare }
        let ci = environment["CI"].map { !$0.isEmpty && $0 != "0" && $0.lowercased() != "false" } ?? false
        return ci ? .missingInCI : .record
    }
}
