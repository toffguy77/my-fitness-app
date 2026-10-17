// Сгенерировано packages/design-tokens/scripts/build.mjs из tokens/*.json. Не править руками.
//
// Исходник цели DesignSystem пакета VzveshenoKit. Colors.xcassets рядом — её
// ресурс (`resources: [.process("Colors.xcassets")]`), отсюда `Bundle.module`.
// Всё, что не требует SwiftUI, собирается и без него; цвета и шрифты — под
// `#if canImport(SwiftUI)`.

import Foundation

#if canImport(SwiftUI)
import SwiftUI
#endif

public enum DS {
    /// Роли цвета; значение — имя colorset в Colors.xcassets. Светлый и тёмный вариант выбирает система.
    public enum ColorRole: String, CaseIterable, Sendable {
        case bgCanvas = "BgCanvas"
        case bgSurface = "BgSurface"
        case bgSubtle = "BgSubtle"
        case bgNav = "BgNav"
        case bgScrim = "BgScrim"
        case fgDefault = "FgDefault"
        case fgMuted = "FgMuted"
        case fgSubtle = "FgSubtle"
        case fgDisabled = "FgDisabled"
        case fgInverse = "FgInverse"
        case lineDefault = "LineDefault"
        case lineStrong = "LineStrong"
        case primaryDefault = "PrimaryDefault"
        case primaryHover = "PrimaryHover"
        case primaryFg = "PrimaryFg"
        case primarySoft = "PrimarySoft"
        case coachBg = "CoachBg"
        case coachFg = "CoachFg"
        case coachFgMuted = "CoachFgMuted"
        case track = "Track"
        case macroProtein = "MacroProtein"
        case macroProteinFg = "MacroProteinFg"
        case macroFat = "MacroFat"
        case macroFatFg = "MacroFatFg"
        case macroCarbs = "MacroCarbs"
        case macroCarbsFg = "MacroCarbsFg"
        case macroWater = "MacroWater"
        case statusSuccess = "StatusSuccess"
        case statusSuccessFg = "StatusSuccessFg"
        case statusSuccessSoft = "StatusSuccessSoft"
        case statusWarning = "StatusWarning"
        case statusWarningFg = "StatusWarningFg"
        case statusWarningSoft = "StatusWarningSoft"
        case statusDanger = "StatusDanger"
        case statusDangerFg = "StatusDangerFg"
        case statusDangerSoft = "StatusDangerSoft"
        case statusInfo = "StatusInfo"
        case statusInfoFg = "StatusInfoFg"
        case statusInfoSoft = "StatusInfoSoft"
        case focus = "Focus"
    }

    /// Отступы, сетка 4 pt. `s4` — шаг 4 шкалы (16 pt), а не 4 pt.
    public enum Space {
        public static let s0: CGFloat = 0
        public static let s1: CGFloat = 4
        public static let s2: CGFloat = 8
        public static let s3: CGFloat = 12
        public static let s4: CGFloat = 16
        public static let s5: CGFloat = 20
        public static let s6: CGFloat = 24
        public static let s8: CGFloat = 32
        public static let s10: CGFloat = 40
        public static let s12: CGFloat = 48
        public static let s16: CGFloat = 64
        /// Боковое поле экрана на телефоне
        public static let screenX: CGFloat = 20
    }

    /// Радиусы скругления, pt.
    public enum Radius {
        public static let xs: CGFloat = 6
        /// Поля ввода, небольшие плашки
        public static let s: CGFloat = 10
        /// Вложенные карточки, плитки дней
        public static let m: CGFloat = 14
        /// Карточки экрана
        public static let l: CGFloat = 18
        /// Шторки и модальные окна
        public static let xl: CGFloat = 28
        /// Кнопки и чипы
        public static let pill: CGFloat = 9999
    }

    /// Размеры, pt.
    public enum Size {
        /// Минимальная область нажатия (Apple HIG 44 pt, Material 48 dp — берём 44 и не меньше)
        public static let touch: CGFloat = 44
        /// Высота кнопок и полей
        public static let control: CGFloat = 48
        /// Высота нижней навигации без safe area
        public static let tabbar: CGFloat = 64
        /// Максимальная ширина колонки контента на планшете и десктопе
        public static let contentMax: CGFloat = 640
    }

    /// Семейства шрифтов бренда — имена для `Font.custom`.
    public enum FontFamily {
        public static let serif = "Literata"
        public static let sans = "Golos Text"
    }

    /// Системный стиль, вслед за которым стиль бренда масштабируется с Dynamic Type; имена — как у `Font.TextStyle`.
    public enum TextStyleRole: String, CaseIterable, Sendable {
        case largeTitle
        case title
        case title2
        case title3
        case headline
        case body
        case callout
        case subheadline
        case footnote
        case caption
        case caption2
    }

    /// Стиль текста. Размеры в pt; `tracking` — в pt для этого размера.
    public struct TextStyle: Hashable, Sendable {
        public let family: String
        public let size: CGFloat
        public let lineHeight: CGFloat
        /// Вес по шкале CSS: 400 обычный, 500 средний, 600 полужирный.
        public let weight: Int
        public let tracking: CGFloat
        public let relativeTo: TextStyleRole
        /// Цифры одной ширины (tabular-nums).
        public let monospacedDigits: Bool
        public let uppercase: Bool
        public let italic: Bool

        /// Добавка к высоте строки до `lineHeight` (для `.lineSpacing`).
        public var lineSpacing: CGFloat { lineHeight - size }
    }

    public enum Typography {
        public static let display = TextStyle(family: FontFamily.serif, size: 34, lineHeight: 40, weight: 500, tracking: -0.51, relativeTo: .largeTitle, monospacedDigits: false, uppercase: false, italic: false)
        public static let title1 = TextStyle(family: FontFamily.serif, size: 30, lineHeight: 36, weight: 500, tracking: -0.45, relativeTo: .title, monospacedDigits: false, uppercase: false, italic: false)
        public static let title2 = TextStyle(family: FontFamily.serif, size: 22, lineHeight: 28, weight: 500, tracking: 0, relativeTo: .title2, monospacedDigits: false, uppercase: false, italic: false)
        public static let title3 = TextStyle(family: FontFamily.serif, size: 18, lineHeight: 24, weight: 500, tracking: 0, relativeTo: .title3, monospacedDigits: false, uppercase: false, italic: false)
        public static let quote = TextStyle(family: FontFamily.serif, size: 19, lineHeight: 28, weight: 400, tracking: 0, relativeTo: .body, monospacedDigits: false, uppercase: false, italic: true)
        public static let numXl = TextStyle(family: FontFamily.sans, size: 44, lineHeight: 48, weight: 600, tracking: -0.88, relativeTo: .largeTitle, monospacedDigits: true, uppercase: false, italic: false)
        public static let numL = TextStyle(family: FontFamily.sans, size: 22, lineHeight: 26, weight: 600, tracking: -0.22, relativeTo: .title2, monospacedDigits: true, uppercase: false, italic: false)
        public static let headline = TextStyle(family: FontFamily.sans, size: 16, lineHeight: 22, weight: 600, tracking: 0, relativeTo: .headline, monospacedDigits: false, uppercase: false, italic: false)
        public static let body = TextStyle(family: FontFamily.sans, size: 16, lineHeight: 24, weight: 400, tracking: 0, relativeTo: .body, monospacedDigits: false, uppercase: false, italic: false)
        public static let callout = TextStyle(family: FontFamily.sans, size: 15, lineHeight: 20, weight: 400, tracking: 0, relativeTo: .callout, monospacedDigits: false, uppercase: false, italic: false)
        public static let caption = TextStyle(family: FontFamily.sans, size: 13, lineHeight: 18, weight: 400, tracking: 0, relativeTo: .footnote, monospacedDigits: false, uppercase: false, italic: false)
        public static let overline = TextStyle(family: FontFamily.sans, size: 13, lineHeight: 18, weight: 600, tracking: 1.04, relativeTo: .footnote, monospacedDigits: false, uppercase: true, italic: false)
        public static let micro = TextStyle(family: FontFamily.sans, size: 11, lineHeight: 14, weight: 500, tracking: 0, relativeTo: .caption2, monospacedDigits: false, uppercase: false, italic: false)
    }
}

#if canImport(SwiftUI)
extension DS {
    /// Цвета ролей из каталога модуля DesignSystem. Литерал цвета вне DesignSystem запрещён SwiftLint (ds_color_literal).
    public enum Color {
        public static var bgCanvas: SwiftUI.Color { SwiftUI.Color("BgCanvas", bundle: .module) }
        public static var bgSurface: SwiftUI.Color { SwiftUI.Color("BgSurface", bundle: .module) }
        public static var bgSubtle: SwiftUI.Color { SwiftUI.Color("BgSubtle", bundle: .module) }
        public static var bgNav: SwiftUI.Color { SwiftUI.Color("BgNav", bundle: .module) }
        public static var bgScrim: SwiftUI.Color { SwiftUI.Color("BgScrim", bundle: .module) }
        public static var fgDefault: SwiftUI.Color { SwiftUI.Color("FgDefault", bundle: .module) }
        public static var fgMuted: SwiftUI.Color { SwiftUI.Color("FgMuted", bundle: .module) }
        public static var fgSubtle: SwiftUI.Color { SwiftUI.Color("FgSubtle", bundle: .module) }
        public static var fgDisabled: SwiftUI.Color { SwiftUI.Color("FgDisabled", bundle: .module) }
        public static var fgInverse: SwiftUI.Color { SwiftUI.Color("FgInverse", bundle: .module) }
        public static var lineDefault: SwiftUI.Color { SwiftUI.Color("LineDefault", bundle: .module) }
        public static var lineStrong: SwiftUI.Color { SwiftUI.Color("LineStrong", bundle: .module) }
        public static var primaryDefault: SwiftUI.Color { SwiftUI.Color("PrimaryDefault", bundle: .module) }
        public static var primaryHover: SwiftUI.Color { SwiftUI.Color("PrimaryHover", bundle: .module) }
        public static var primaryFg: SwiftUI.Color { SwiftUI.Color("PrimaryFg", bundle: .module) }
        public static var primarySoft: SwiftUI.Color { SwiftUI.Color("PrimarySoft", bundle: .module) }
        public static var coachBg: SwiftUI.Color { SwiftUI.Color("CoachBg", bundle: .module) }
        public static var coachFg: SwiftUI.Color { SwiftUI.Color("CoachFg", bundle: .module) }
        public static var coachFgMuted: SwiftUI.Color { SwiftUI.Color("CoachFgMuted", bundle: .module) }
        public static var track: SwiftUI.Color { SwiftUI.Color("Track", bundle: .module) }
        public static var macroProtein: SwiftUI.Color { SwiftUI.Color("MacroProtein", bundle: .module) }
        public static var macroProteinFg: SwiftUI.Color { SwiftUI.Color("MacroProteinFg", bundle: .module) }
        public static var macroFat: SwiftUI.Color { SwiftUI.Color("MacroFat", bundle: .module) }
        public static var macroFatFg: SwiftUI.Color { SwiftUI.Color("MacroFatFg", bundle: .module) }
        public static var macroCarbs: SwiftUI.Color { SwiftUI.Color("MacroCarbs", bundle: .module) }
        public static var macroCarbsFg: SwiftUI.Color { SwiftUI.Color("MacroCarbsFg", bundle: .module) }
        public static var macroWater: SwiftUI.Color { SwiftUI.Color("MacroWater", bundle: .module) }
        public static var statusSuccess: SwiftUI.Color { SwiftUI.Color("StatusSuccess", bundle: .module) }
        public static var statusSuccessFg: SwiftUI.Color { SwiftUI.Color("StatusSuccessFg", bundle: .module) }
        public static var statusSuccessSoft: SwiftUI.Color { SwiftUI.Color("StatusSuccessSoft", bundle: .module) }
        public static var statusWarning: SwiftUI.Color { SwiftUI.Color("StatusWarning", bundle: .module) }
        public static var statusWarningFg: SwiftUI.Color { SwiftUI.Color("StatusWarningFg", bundle: .module) }
        public static var statusWarningSoft: SwiftUI.Color { SwiftUI.Color("StatusWarningSoft", bundle: .module) }
        public static var statusDanger: SwiftUI.Color { SwiftUI.Color("StatusDanger", bundle: .module) }
        public static var statusDangerFg: SwiftUI.Color { SwiftUI.Color("StatusDangerFg", bundle: .module) }
        public static var statusDangerSoft: SwiftUI.Color { SwiftUI.Color("StatusDangerSoft", bundle: .module) }
        public static var statusInfo: SwiftUI.Color { SwiftUI.Color("StatusInfo", bundle: .module) }
        public static var statusInfoFg: SwiftUI.Color { SwiftUI.Color("StatusInfoFg", bundle: .module) }
        public static var statusInfoSoft: SwiftUI.Color { SwiftUI.Color("StatusInfoSoft", bundle: .module) }
        public static var focus: SwiftUI.Color { SwiftUI.Color("Focus", bundle: .module) }
    }
}

extension DS.ColorRole {
    public var color: SwiftUI.Color { SwiftUI.Color(rawValue, bundle: .module) }
}

extension DS.TextStyleRole {
    public var textStyle: SwiftUI.Font.TextStyle {
        switch self {
        case .largeTitle: .largeTitle
        case .title: .title
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .body: .body
        case .callout: .callout
        case .subheadline: .subheadline
        case .footnote: .footnote
        case .caption: .caption
        case .caption2: .caption2
        }
    }
}

extension DS.TextStyle {
    public var fontWeight: SwiftUI.Font.Weight {
        switch weight {
        case ..<150: .ultraLight
        case ..<250: .thin
        case ..<350: .light
        case ..<450: .regular
        case ..<550: .medium
        case ..<650: .semibold
        case ..<750: .bold
        case ..<850: .heavy
        default: .black
        }
    }

    /// Шрифт бренда, масштабируемый с Dynamic Type относительно `relativeTo`.
    public var font: SwiftUI.Font {
        var font = SwiftUI.Font.custom(family, size: size, relativeTo: relativeTo.textStyle).weight(fontWeight)
        if monospacedDigits { font = font.monospacedDigit() }
        if italic { font = font.italic() }
        return font
    }
}
#endif
