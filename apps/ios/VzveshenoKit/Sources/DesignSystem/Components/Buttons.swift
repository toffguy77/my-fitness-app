#if canImport(SwiftUI)
import SwiftUI

/// Кнопка-таблетка. `primary` — одна на экран; `secondary` — контур; `ghost`
/// — без подложки; `danger` — после подтверждения; `inverse` — на `coach`.
public struct DSButtonStyle: ButtonStyle {
    public enum Kind: String, CaseIterable, Sendable {
        case primary, secondary, ghost, danger, inverse
    }

    public enum Size: CaseIterable, Sendable {
        /// 36 pt — в строках и на карточках; область нажатия всё равно 44.
        case small
        /// 44 pt.
        case medium
        /// 48 pt — главное действие экрана.
        case large

        var height: CGFloat {
            switch self {
            case .small: return 36
            case .medium: return DS.Size.touch
            case .large: return DS.Size.control
            }
        }
    }

    private let kind: Kind
    private let size: Size
    @Environment(\.isEnabled) private var isEnabled

    public init(_ kind: Kind = .primary, size: Size = .large) {
        self.kind = kind
        self.size = size
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .dsText(DS.Typography.headline)
            .lineLimit(2)
            .multilineTextAlignment(.center)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, DS.Space.s5)
            .padding(.vertical, DS.Space.s2)
            .frame(minHeight: size.height)
            .frame(maxWidth: size == .large ? .infinity : nil)
            .foregroundStyle(isEnabled ? foreground : DS.Color.fgDisabled)
            .background(Capsule().fill(isEnabled ? background : DS.Color.bgSubtle))
            .overlay(Capsule().strokeBorder(kind == .secondary ? DS.Color.lineStrong : Color.clear, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .contentShape(Rectangle().inset(by: size == .small ? -4 : 0))
            .frame(minHeight: DS.Size.touch)
    }

    private var foreground: Color {
        switch kind {
        case .primary: return DS.Color.primaryFg
        case .secondary, .ghost: return DS.Color.fgDefault
        case .danger: return DS.Color.statusDangerFg
        case .inverse: return DS.Color.coachBg
        }
    }

    private var background: Color {
        switch kind {
        case .primary: return DS.Color.primaryDefault
        case .secondary, .ghost: return .clear
        case .danger: return DS.Color.statusDangerSoft
        case .inverse: return DS.Color.coachFg
        }
    }
}

/// Круглая кнопка-иконка 44 pt; подпись для VoiceOver обязательна.
public struct DSIconButton: View {
    private let systemImage: String
    private let label: String
    private let action: () -> Void

    public init(_ systemImage: String, label: String, action: @escaping () -> Void) {
        self.systemImage = systemImage
        self.label = label
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(DS.Color.fgDefault)
                .frame(minWidth: DS.Size.touch, minHeight: DS.Size.touch)
                .background(Circle().fill(DS.Color.bgSubtle))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
#endif
