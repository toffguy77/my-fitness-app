import AVFoundation
import SwiftUI
import UIKit
import VisionKit

/// Сканер штрихкода (`ios-food-logging`): `DataScannerViewController`
/// распознаёт EAN-13, EAN-8 и UPC-E сам и подсвечивает код; где VisionKit не
/// поддерживается — `AVCaptureMetadataOutput`. Ручной ввод — всегда рядом.
enum BarcodeScannerKind {
    case visionKit
    case avFoundation
    /// Камеры нет (симулятор) или доступ запрещён.
    case unavailable

    @MainActor
    static var current: BarcodeScannerKind {
        guard AVCaptureDevice.default(for: .video) != nil else { return .unavailable }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .denied, .restricted: return .unavailable
        default: break
        }
        if DataScannerViewController.isSupported && DataScannerViewController.isAvailable { return .visionKit }
        return .avFoundation
    }
}

/// Фонарик задней камеры — и для VisionKit, и для AVFoundation.
enum Torch {
    static var isAvailable: Bool { AVCaptureDevice.default(for: .video)?.hasTorch ?? false }

    static func set(_ on: Bool) {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else { return }
        try? device.lockForConfiguration()
        device.torchMode = on ? .on : .off
        device.unlockForConfiguration()
    }
}

/// Камера со сканером выбранного вида.
struct BarcodeCameraView: View {
    let kind: BarcodeScannerKind
    let onCode: (String) -> Void

    var body: some View {
        switch kind {
        case .visionKit: VisionKitScanner(onCode: onCode)
        case .avFoundation: MetadataScanner(onCode: onCode)
        case .unavailable: Color.clear
        }
    }
}

struct VisionKitScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce])],
            qualityLevel: .balanced, recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) {
        controller.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void

        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            for item in addedItems {
                if case let .barcode(barcode) = item, let code = barcode.payloadStringValue {
                    onCode(code)
                    return
                }
            }
        }
    }
}

/// Запасной сканер на AVFoundation.
struct MetadataScanner: UIViewRepresentable {
    let onCode: (String) -> Void

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        let session = context.coordinator.session
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        if let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device),
           session.canAddInput(input) {
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            if session.canAddOutput(output) {
                session.addOutput(output)
                output.setMetadataObjectsDelegate(context.coordinator, queue: .main)
                output.metadataObjectTypes = [.ean13, .ean8, .upce].filter(output.availableMetadataObjectTypes.contains)
            }
            context.coordinator.start()
        }
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {}

    static func dismantleUIView(_ view: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class PreviewView: UIView {
        override static var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        // swiftlint:disable:next force_cast
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate, @unchecked Sendable {
        let session = AVCaptureSession()
        let onCode: (String) -> Void

        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        // Запуск и остановка сессии — не на главном потоке (рекомендация AVFoundation).
        func start() {
            nonisolated(unsafe) let session = session
            DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
        }

        func stop() {
            nonisolated(unsafe) let session = session
            DispatchQueue.global(qos: .userInitiated).async { session.stopRunning() }
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
                            from connection: AVCaptureConnection) {
            guard let code = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
            let onCode = onCode
            MainActor.assumeIsolated { onCode(code) }
        }
    }
}
