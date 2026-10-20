import SwiftUI
import VisionKit

/// Штрихкод: камера телефона находит код сама, без кнопки «снять».
/// Где сканер недоступен (симулятор, старые устройства) — ручной ввод.
struct BarcodeView: View {
    @Environment(SessionStore.self) private var session
    @Binding var selected: FoodItem?

    @State private var manualCode = ""
    @State private var looking = false
    @State private var message: String?
    @State private var lastCode: String?

    var body: some View {
        VStack(spacing: 12) {
            if BarcodeScanner.isAvailable {
                BarcodeScanner { code in
                    Task { await lookup(code) }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .frame(maxHeight: 320)
                .padding(.horizontal)
                .overlay { if looking { ProgressView().controlSize(.large) } }
                Text("Наведите камеру на штрихкод на упаковке.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ContentUnavailableView("Камера недоступна", systemImage: "barcode.viewfinder",
                                       description: Text("Введите цифры штрихкода вручную."))
            }

            HStack {
                TextField("Цифры штрихкода", text: $manualCode)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                Button("Найти") { Task { await lookup(manualCode) } }
                    .disabled(manualCode.count < 8 || looking)
            }
            .padding(.horizontal)

            if let message {
                Text(message)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            Spacer()
        }
        .padding(.top)
    }

    private func lookup(_ raw: String) async {
        let code = raw.filter(\.isNumber)
        // Сканер видит один код много раз в секунду — ищем его один раз.
        guard !code.isEmpty, code != lastCode || !manualCode.isEmpty, !looking else { return }
        lastCode = code
        looking = true
        message = nil
        defer { looking = false }
        do {
            let result = try await session.api.send(Endpoint<BarcodeResult>.get("/api/v1/food-tracker/barcode/\(code)"))
            if result.found, let food = result.food {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                selected = food
            } else {
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
                message = result.message ?? "Продукт не найден. Попробуйте поиск или добавьте вручную."
            }
        } catch {
            message = error.userMessage
        }
    }
}

struct BarcodeScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    @MainActor static var isAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
            qualityLevel: .balanced,
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

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                if case let .barcode(barcode) = item, let code = barcode.payloadStringValue {
                    onCode(code)
                    return
                }
            }
        }
    }
}
