import ImageIO
import UIKit
import UniformTypeIdentifiers
@testable import Vzvesheno
import XCTest

/// «Снимок HEIC 4032×3024» (`ios-food-logging`, задача 3.4): на сервер уходит
/// JPEG 1280×960 без метаданных EXIF и GPS исходника.
final class PhotoPreparationTests: XCTestCase {
    /// Снимок как с камеры iPhone: HEIC 4032×3024 с датой съёмки, камерой и GPS.
    private func heicFixture() throws -> Data {
        let heic = UTType.heic.identifier as CFString
        let supported = (CGImageDestinationCopyTypeIdentifiers() as? [String]) ?? []
        guard supported.contains(heic as String) else {
            throw XCTSkip("ImageIO этого симулятора не пишет HEIC")
        }
        let size = CGSize(width: 4032, height: 3024)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor.systemOrange.setFill()
            context.fill(CGRect(x: 1000, y: 800, width: 2000, height: 1400))
        }
        let cgImage = try XCTUnwrap(image.cgImage)
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, heic, 1, nil))
        let metadata: [CFString: Any] = [
            kCGImagePropertyExifDictionary: [
                kCGImagePropertyExifDateTimeOriginal: "2026:10:17 13:20:00",
                kCGImagePropertyExifLensModel: "iPhone 16 Pro back camera",
            ],
            kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake: "Apple", kCGImagePropertyTIFFModel: "iPhone 16 Pro"],
            kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 55.75, kCGImagePropertyGPSLatitudeRef: "N",
                                            kCGImagePropertyGPSLongitude: 37.61, kCGImagePropertyGPSLongitudeRef: "E"],
        ]
        CGImageDestinationAddImage(destination, cgImage, metadata as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    func testHEICBecomesSmallJPEGWithoutMetadata() throws {
        let heic = try heicFixture()
        // Фикстура действительно HEIC с метаданными — иначе проверка ниже ничего не доказывала бы.
        let source = try XCTUnwrap(CGImageSourceCreateWithData(heic as CFData, nil))
        XCTAssertEqual(CGImageSourceGetType(source) as String?, UTType.heic.identifier)
        let original = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
        XCTAssertNotNil(original[kCGImagePropertyGPSDictionary])

        let jpeg = try XCTUnwrap(PhotoPreparation.jpeg(fromFile: heic))

        let output = try XCTUnwrap(CGImageSourceCreateWithData(jpeg as CFData, nil))
        XCTAssertEqual(CGImageSourceGetType(output) as String?, UTType.jpeg.identifier)
        let properties = CGImageSourceCopyPropertiesAtIndex(output, 0, nil) as? [CFString: Any] ?? [:]
        XCTAssertEqual(properties[kCGImagePropertyPixelWidth] as? Int, 1280)
        XCTAssertEqual(properties[kCGImagePropertyPixelHeight] as? Int, 960)
        XCTAssertNil(properties[kCGImagePropertyGPSDictionary], "GPS не уходит на сервер")
        let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
        XCTAssertNil(exif[kCGImagePropertyExifDateTimeOriginal])
        XCTAssertNil(exif[kCGImagePropertyExifLensModel])
        let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:]
        XCTAssertNil(tiff[kCGImagePropertyTIFFMake])
        XCTAssertNil(tiff[kCGImagePropertyTIFFModel])
        XCTAssertLessThan(jpeg.count, 10 * 1024 * 1024, "проходит лимит сервера 10 МБ")
    }

    /// Маленький снимок не растягивается.
    func testSmallPhotoKeepsItsSize() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 640, height: 480)).image { context in
            UIColor.systemGray.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 640, height: 480))
        }
        let jpeg = try XCTUnwrap(PhotoPreparation.jpeg(from: image))
        let source = try XCTUnwrap(CGImageSourceCreateWithData(jpeg as CFData, nil))
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
        let width = properties[kCGImagePropertyPixelWidth] as? Int ?? 0
        XCTAssertLessThanOrEqual(width, 1280)
        XCTAssertGreaterThan(width, 0)
    }
}
