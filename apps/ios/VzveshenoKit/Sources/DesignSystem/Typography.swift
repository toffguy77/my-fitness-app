#if canImport(SwiftUI)
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

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
        _lineSpacing = ScaledMetric(wrappedValue: style.extraLeading, relativeTo: style.relativeTo.textStyle)
    }

    func body(content: Content) -> some View {
        content
            .font(style.font)
            .tracking(style.tracking)
            .lineSpacing(lineSpacing)
            .textCase(style.uppercase ? .uppercase : nil)
    }
}

extension DS.TextStyle {
    /// Добавка между строками до `lineHeight` токена. Шрифт уже даёт свою
    /// высоту строки (у Literata и Golos она больше кегля), и прибавлять к ней
    /// всю разницу «высота строки − кегль» — значит разрядить текст сверх
    /// токена: у `body` 16/24 строки шли через 27 pt.
    var extraLeading: CGFloat {
        #if canImport(UIKit)
        let natural = UIFont(name: family, size: size)?.lineHeight ?? size * 1.2
        #else
        let natural = size * 1.2
        #endif
        return max(lineHeight - natural, 0)
    }
}
#endif
