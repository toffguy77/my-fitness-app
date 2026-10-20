#if canImport(SwiftUI)
import SwiftUI

/// Плашка «Нет подключения» над кэшем экрана.
public struct OfflineBanner: View {
    private let updatedLabel: String?

    public init(updatedLabel: String? = nil) {
        self.updatedLabel = updatedLabel
    }

    public var body: some View {
        HStack(spacing: DS.Space.s2) {
            Image(systemName: "wifi.slash").accessibilityHidden(true)
            Text("Нет подключения").dsText(DS.Typography.caption).fontWeight(.semibold)
            if let updatedLabel {
                Text("· \(updatedLabel)").dsText(DS.Typography.caption)
            }
        }
        .foregroundStyle(DS.Color.statusInfoFg)
        .padding(.horizontal, DS.Space.s3)
        .padding(.vertical, DS.Space.s2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous).fill(DS.Color.statusInfoSoft))
        .accessibilityElement(children: .combine)
    }
}

/// Ожидание внутри экрана: кольцо и подпись для VoiceOver.
public struct DSSpinner: View {
    private let label: String

    public init(_ label: String = "Загрузка") {
        self.label = label
    }

    public var body: some View {
        ProgressView()
            .controlSize(.large)
            .tint(DS.Color.primaryDefault)
            .accessibilityLabel(label)
    }
}
#endif
