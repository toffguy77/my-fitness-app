#if canImport(SwiftUI)
import SwiftUI

extension View {
    /// Стиль текста из токенов: шрифт бренда с Dynamic Type, межбуквенный
    /// интервал, межстрочный и прописные, если стиль их требует.
    public func dsText(_ style: DS.TextStyle) -> some View {
        modifier(DSTextModifier(style: style))
    }
}

private struct DSTextModifier: ViewModifier {
    let style: DS.TextStyle
    @ScaledMetric private var lineSpacing: CGFloat

    init(style: DS.TextStyle) {
        self.style = style
        _lineSpacing = ScaledMetric(wrappedValue: max(style.lineSpacing, 0), relativeTo: style.relativeTo.textStyle)
    }

    func body(content: Content) -> some View {
        content
            .font(style.font)
            .tracking(style.tracking)
            .lineSpacing(lineSpacing)
            .textCase(style.uppercase ? .uppercase : nil)
    }
}
#endif
