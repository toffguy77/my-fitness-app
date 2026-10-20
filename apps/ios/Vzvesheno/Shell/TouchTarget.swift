import DesignSystem
import SwiftUI

extension View {
    /// Небольшая подпись-кнопка («Убрать», «Повторить», «Сменить фото»):
    /// область нажатия и рамка для VoiceOver расширены во все стороны, а
    /// раскладка не меняется. HIG требует не меньше 44 pt; аудит доступности
    /// иначе находит «Hit area is too small» — рамка элемента по самой подписи.
    func touchTarget(_ outset: CGFloat = 14) -> some View {
        contentShape(Rectangle().inset(by: -outset))
    }

    /// Мелкая подпись 11 pt (метки «база», «бета», автор реплики), которая
    /// растёт с Dynamic Type по кривой footnote: у caption2 рост на крупных
    /// размерах неполный, и аудит считает его частичной поддержкой.
    func microScaled(weight: Font.Weight = .medium) -> some View {
        font(.custom(DS.FontFamily.sans, size: 11, relativeTo: .footnote).weight(weight))
    }
}
