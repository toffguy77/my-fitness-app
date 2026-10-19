import Client
import DesignSystem
import SwiftUI
import UIKit

/// Экран сканера без камеры и сети (макет Scan.png): рамка, подсказка и
/// карточка найденного продукта. Камера — фоном.
struct ScanContent<Camera: View>: View {
    let found: FoodItem?
    let portion: Portion
    let message: String?
    let looking: Bool
    let torchOn: Bool
    let torchAvailable: Bool
    var cameraUnavailable = false
    /// Отступ шапки: в листе — 4, во весь экран под строкой состояния — 58.
    var topInset: CGFloat = 4
    let onClose: () -> Void
    let onTorch: () -> Void
    let onManual: () -> Void
    let onAdd: () -> Void
    @ViewBuilder let camera: Camera

    var body: some View {
        ZStack {
            DS.Color.coachBg
            camera
            RadialGradient(colors: [DS.Color.coachBg.opacity(0), DS.Color.coachBg.opacity(0.55)], center: .center,
                           startRadius: 60, endRadius: 520)
                .allowsHitTesting(false)
            VStack(spacing: 0) {
                HStack {
                    circleButton("xmark", "Закрыть", action: onClose).accessibilityIdentifier("scan.close")
                    Spacer()
                    Text("Наведите на штрихкод")
                        .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .headline).weight(.semibold))
                        .foregroundStyle(DS.Color.coachFg)
                    Spacer()
                    circleButton(torchOn ? "flashlight.on.fill" : "flashlight.off.fill", torchOn ? "Выключить фонарик" : "Фонарик",
                                 action: onTorch)
                        .opacity(torchAvailable ? 1 : 0.4)
                        .disabled(!torchAvailable)
                        .accessibilityIdentifier("scan.torch")
                }
                .padding(.horizontal, DS.Space.screenX)
                .padding(.top, topInset)
                Spacer()
                ScanFrame(looking: looking)
                    .frame(width: 250, height: 180)
                Text(cameraUnavailable ? "Камера недоступна — введите цифры штрихкода" : "EAN и UPC распознаются без нажатия")
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.coachFgMuted)
                    .multilineTextAlignment(.center)
                    .padding(.top, 20)
                    .padding(.horizontal, DS.Space.screenX)
                Spacer()
                card
                    .padding(.horizontal, DS.Space.s3)
                    .padding(.bottom, 28)
            }
        }
    }

    @ViewBuilder
    private var card: some View {
        if let found {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                HStack(alignment: .top, spacing: DS.Space.s3) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(found.name).dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                            .accessibilityIdentifier("scan.found")
                        Text(found.subtitle).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    }
                    Spacer(minLength: 0)
                    if found.source == "openfoodfacts" { SourceTag(text: "Open Food Facts") }
                }
                HStack(spacing: 10) {
                    Button(action: onManual) {
                        Text("Ввести код")
                            .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout).weight(.medium))
                            .foregroundStyle(DS.Color.fgDefault)
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(DS.Color.bgSubtle))
                    }
                    .buttonStyle(.plain)
                    // Как на макете: «Ввести код» — треть ряда, «Добавить» — две.
                    .frame(width: 109)
                    .accessibilityIdentifier("scan.manual")
                    SheetPrimaryButton(title: "Добавить \(portion.unit.label(portion.amount))", identifier: "scan.add", action: onAdd)
                }
            }
            .padding(.horizontal, DS.Space.s5)
            .padding(.vertical, 18)
            .background(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous).fill(DS.Color.bgSurface))
        } else {
            VStack(spacing: DS.Space.s3) {
                if let message {
                    Text(message).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("scan.message")
                }
                Button(action: onManual) {
                    Text("Ввести код вручную")
                        .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout).weight(.medium))
                        .foregroundStyle(DS.Color.fgDefault)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(DS.Color.bgSubtle))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("scan.manual")
            }
            .padding(DS.Space.s5)
            .background(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous).fill(DS.Color.bgSurface))
        }
    }

    private func circleButton(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(DS.Color.coachFg)
                .frame(width: DS.Size.touch, height: DS.Size.touch)
                .background(Circle().fill(DS.Color.coachFg.opacity(0.16)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Уголки рамки и линия сканирования.
private struct ScanFrame: View {
    let looking: Bool

    var body: some View {
        ZStack {
            ForEach(0..<4, id: \.self) { corner in
                CornerShape()
                    .stroke(DS.Color.coachFg, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 28, height: 28)
                    .rotationEffect(.degrees(Double(corner) * 90))
                    .frame(maxWidth: .infinity, maxHeight: .infinity,
                           alignment: [Alignment.topLeading, .topTrailing, .bottomTrailing, .bottomLeading][corner])
            }
            Capsule()
                .fill(DS.Color.primaryDefault)
                .frame(height: 2)
                .padding(.horizontal, 14)
                .shadow(color: DS.Color.primaryDefault, radius: 6)
            if looking { ProgressView().tint(DS.Color.coachFg) }
        }
        .accessibilityHidden(true)
    }
}

/// Уголок: дуга радиуса 14 из верхнего левого угла.
private struct CornerShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + 14))
        path.addQuadCurve(to: CGPoint(x: rect.minX + 14, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        return path
    }
}

/// Способ «Штрихкод»: сканер, поиск по коду (кэш на 90 дней), ручной ввод.
struct BarcodeMethodView: View {
    let lookup: BarcodeLookupService
    let meal: MealType
    let onClose: () -> Void
    let onAdd: (FoodItem, Portion) -> Void
    /// Код не найден: «Ввести вручную» с подставленным кодом.
    let onNotFound: (String) -> Void

    @State private var kind = BarcodeScannerKind.unavailable
    @State private var found: FoodItem?
    @State private var message: String?
    @State private var looking = false
    @State private var lastCode: String?
    @State private var torch = false
    @State private var manualShown = false
    @State private var manualCode = ""

    var body: some View {
        VStack(spacing: DS.Space.s3) {
            ScanContent(found: found, portion: portion, message: message, looking: looking, torchOn: torch,
                        torchAvailable: Torch.isAvailable, cameraUnavailable: kind == .unavailable,
                        onClose: onClose,
                        onTorch: { torch.toggle(); Torch.set(torch) },
                        onManual: { manualShown = true },
                        onAdd: { if let found { onAdd(found, portion) } }, camera: {
                BarcodeCameraView(kind: kind) { code in Task { await search(code) } }
            })
            .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
            if manualShown || kind == .unavailable {
                HStack(spacing: DS.Space.s2) {
                    TextField("Цифры штрихкода", text: $manualCode)
                        .keyboardType(.numberPad)
                        .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body))
                        .padding(.horizontal, DS.Space.s3)
                        .frame(height: DS.Size.touch)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(DS.Color.bgSubtle))
                        .accessibilityIdentifier("barcode.manual")
                    Button("Найти") { Task { await search(manualCode, manual: true) } }
                        .buttonStyle(DSButtonStyle(.secondary, size: .medium))
                        .disabled(BarcodeInput.normalize(manualCode) == nil || looking)
                        .accessibilityIdentifier("barcode.find")
                }
            }
        }
        .onAppear { kind = BarcodeScannerKind.current }
        .onDisappear { if torch { Torch.set(false) } }
    }

    private var portion: Portion {
        let unit = found?.defaultUnit ?? .grams
        let serving = found?.servingSize.flatMap { $0 > 0 ? $0 : nil } ?? 100
        return Portion(unit: unit, amount: Portion.clamp(serving, unit: unit))
    }

    /// Сканер видит один код много раз в секунду — ищем его один раз.
    private func search(_ raw: String, manual: Bool = false) async {
        let code = raw.filter(\.isNumber)
        guard !looking, manual || code != lastCode else { return }
        lastCode = code
        looking = true
        message = nil
        defer { looking = false }
        switch await lookup.lookup(code) {
        case let .found(food, _):
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            found = food
        case let .notFound(code):
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            found = nil
            onNotFound(code)
        case let .failed(text):
            found = nil
            message = text
        }
    }
}
