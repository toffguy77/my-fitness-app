import ImageIO
import UIKit
import UniformTypeIdentifiers

/// Снимок для сервера (`ios-food-logging`, «Фото еды готовится на телефоне»):
/// JPEG качества 0,8, длинная сторона не больше 1280 px, без EXIF и GPS.
/// Сервер HEIC не принимает, а перекодирование на телефоне бесплатно.
///
/// Пиксели перерисовываются в новый растр (поворот из EXIF применяется при
/// отрисовке), и JPEG пишется через ImageIO только с качеством — метаданные
/// исходника в него не попадают.
enum PhotoPreparation {
    static func jpeg(from image: UIImage, maxSide: CGFloat = 1280, quality: CGFloat = 0.8) -> Data? {
        let size = image.size
        let scale = min(1, maxSide / max(size.width, size.height, 1))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        guard let cgImage = resized.cgImage else { return nil }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(destination, cgImage, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return data as Data
    }

    /// Снимок из «Фото» или файла (HEIC, JPEG, PNG) → JPEG для сервера.
    static func jpeg(fromFile data: Data) -> Data? {
        UIImage(data: data).flatMap { jpeg(from: $0) }
    }
}
