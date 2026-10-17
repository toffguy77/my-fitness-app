#if canImport(SwiftUI)
import SwiftUI

/// Карточка экрана. `standard` — бумага и линия 1 pt без тени; `elevated` —
/// то, что лежит над экраном; `coach` — голос куратора на тёмной поверхности;
/// `plain` — без подложки.
public enum DSCardVariant: String, CaseIterable, Sendable {
    case standard, elevated, coach, plain
}

public struct DSCard<Content: View>: View {
    public typealias Variant = DSCardVariant

    private let variant: Variant
    private let content: Content

    public init(_ variant: Variant = .standard, @ViewBuilder content: () -> Content) {
        self.variant = variant
        self.content = content()
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        content
            .padding(variant == .plain ? 0 : DS.Space.s5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(variant == .coach ? DS.Color.coachFg : DS.Color.fgDefault)
            .background {
                switch variant {
                case .standard:
                    shape.fill(DS.Color.bgSurface).overlay(shape.strokeBorder(DS.Color.lineDefault, lineWidth: 1))
                case .elevated:
                    shape.fill(DS.Color.bgSurface)
                        .shadow(color: DS.Color.bgScrim, radius: 12, y: 4)
                case .coach:
                    shape.fill(DS.Color.coachBg)
                case .plain:
                    Color.clear
                }
            }
    }
}

/// Заголовок карточки — засечками.
public struct DSCardTitle: View {
    private let text: String

    public init(_ text: String) { self.text = text }

    public var body: some View {
        Text(text)
            .dsText(DS.Typography.title3)
            .foregroundStyle(DS.Color.fgDefault)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Сообщение куратора: тёмная поверхность, цитата курсивом засечками.
public struct CoachCard: View {
    private let author: String
    private let message: String
    private let actionTitle: String?
    private let action: (() -> Void)?

    public init(author: String, message: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.author = author
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        DSCard(.coach) {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                Text(author)
                    .dsText(DS.Typography.overline)
                    .foregroundStyle(DS.Color.coachFgMuted)
                Text(message)
                    .dsText(DS.Typography.quote)
                    .foregroundStyle(DS.Color.coachFg)
                    .fixedSize(horizontal: false, vertical: true)
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                        .buttonStyle(DSButtonStyle(.inverse, size: .small))
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
#endif
