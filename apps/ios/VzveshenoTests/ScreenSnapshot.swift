import DesignSystem
import SwiftUI
import UIKit
import XCTest

/// Снапшот экрана целиком: SwiftUI в окне приложения, отрисовка
/// `drawHierarchy` — так видны и UIKit-элементы (поля ввода, кнопка Apple),
/// которые `ImageRenderer` не рисует.
///
/// Размер — как у макетов (390 × 844 pt, @2x); верхние 54 pt — место строки
/// состояния, как на макетах. Эталон — `__Snapshots__/<тест>.<имя>.png`
/// рядом с файлом; нет эталона (или `SNAPSHOT_RECORD=1`) — записывается и
/// тест падает, расхождение — рядом `.actual.png`. В CI (`CI` из
/// `TEST_RUNNER_CI`) снимок без эталона ложится как `.new.png` и тест падает
/// при каждом повторе: записанный эталон повтор нашёл бы и прошёл. CI
/// выкладывает каталог артефактом `ios-snapshots`.
@MainActor
func assertScreenSnapshot<V: View>(
    _ view: V,
    named name: String,
    colorScheme: ColorScheme = .light,
    height: CGFloat? = 844,
    typeSize: DynamicTypeSize = .large,
    file: StaticString = #filePath,
    testName: String = #function,
    line: UInt = #line
) {
    DS.Fonts.register()
    let width: CGFloat = 390
    let content = view
        .padding(.top, 54)
        .frame(width: width)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(DS.Color.bgCanvas)
        .environment(\.colorScheme, colorScheme)
        .environment(\.locale, Locale(identifier: "ru_RU"))
        .environment(\.dynamicTypeSize, typeSize)
    let hosting = UIHostingController(rootView: content)
    hosting.safeAreaRegions = []
    hosting.overrideUserInterfaceStyle = colorScheme == .dark ? .dark : .light
    let fitted = height ?? hosting.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
    let size = CGSize(width: width, height: ceil(fitted))
    let window = UIWindow(frame: CGRect(origin: .zero, size: size))
    window.overrideUserInterfaceStyle = hosting.overrideUserInterfaceStyle
    window.rootViewController = hosting
    window.isHidden = false
    hosting.view.frame = window.bounds
    hosting.view.setNeedsLayout()
    hosting.view.layoutIfNeeded()
    // Дать SwiftUI дорисовать асинхронное (шрифты, системные кнопки).
    RunLoop.main.run(until: Date().addingTimeInterval(0.4))
    hosting.view.layoutIfNeeded()

    let format = UIGraphicsImageRendererFormat()
    format.scale = 2
    format.opaque = true
    let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
        hosting.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
    }
    window.isHidden = true
    guard let cgImage = image.cgImage, let png = image.pngData() else {
        XCTFail("не отрисовалось: \(name)", file: file, line: line)
        return
    }

    let directory = URL(fileURLWithPath: "\(file)").deletingLastPathComponent().appendingPathComponent("__Snapshots__")
    let test = testName.replacingOccurrences(of: "()", with: "")
    let reference = directory.appendingPathComponent("\(test).\(name).png")
    let actual = directory.appendingPathComponent("\(test).\(name).actual.png")
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: actual)

    let fresh = directory.appendingPathComponent("\(test).\(name).new.png")
    try? FileManager.default.removeItem(at: fresh)
    let environment = ProcessInfo.processInfo.environment
    let stored = (try? Data(contentsOf: reference)).flatMap { UIImage(data: $0)?.cgImage }
    let record = environment["SNAPSHOT_RECORD"] == "1"
    let ci = environment["CI"].map { !$0.isEmpty && $0 != "0" && $0.lowercased() != "false" } ?? false
    guard !record, let expected = stored else {
        if ci && !record {
            try? png.write(to: fresh)
            XCTFail("нет эталона \(reference.lastPathComponent): снимок — \(fresh.lastPathComponent) в артефакте "
                    + "ios-snapshots; сверьте с макетом, переименуйте без .new и закоммитьте", file: file, line: line)
        } else {
            try? png.write(to: reference)
            XCTFail("записан эталон \(reference.lastPathComponent) — сверьте с макетом и закоммитьте", file: file, line: line)
        }
        return
    }
    guard let difference = ScreenImageDifference.compare(expected, cgImage) else {
        try? png.write(to: actual)
        XCTFail("снапшот \(name): размер \(cgImage.width)×\(cgImage.height), эталон \(expected.width)×\(expected.height)",
                file: file, line: line)
        return
    }
    if difference > 0.001 {
        try? png.write(to: actual)
        XCTFail("снапшот \(name) разошёлся с эталоном: \(String(format: "%.2f", difference * 100))% точек", file: file, line: line)
    }
}

enum ScreenImageDifference {
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
        let space = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        buffer.withUnsafeMutableBytes { bytes in
            let context = CGContext(data: bytes.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
                                    bytesPerRow: image.width * 4, space: space,
                                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            context?.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        }
        return buffer
    }
}
