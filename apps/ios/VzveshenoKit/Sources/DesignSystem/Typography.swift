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
    @ScaledMetric private var tracking: CGFloat

    init(style: DS.TextStyle) {
        self.style = style
        // Межстрочный и межбуквенный интервалы растут вместе с размером
        // шрифта: постоянные пункты на крупном тексте аудит доступности
        // считает неполной поддержкой Dynamic Type.
        _lineSpacing = ScaledMetric(wrappedValue: max(style.lineSpacing, 0), relativeTo: style.relativeTo.textStyle)
        _tracking = ScaledMetric(wrappedValue: style.tracking, relativeTo: style.relativeTo.textStyle)
    }

    func body(content: Content) -> some View {
        content
            .font(style.brandFont)
            .tracking(tracking)
            .lineSpacing(lineSpacing)
            .textCase(style.uppercase ? .uppercase : nil)
    }
}

extension DS.TextStyle {
    /// Шрифт бренда для `dsText`: курсив — настоящим начертанием
    /// Literata Italic, а не наклоном прямого (`Font.italic()` на своём
    /// шрифте даёт синтезированный наклон).
    public var brandFont: Font {
        guard italic, family == DS.FontFamily.serif else { return font }
        var font = Font.custom("Literata-Italic", size: size, relativeTo: relativeTo.textStyle).weight(fontWeight)
        if monospacedDigits { font = font.monospacedDigit() }
        return font
    }
}
#endif
