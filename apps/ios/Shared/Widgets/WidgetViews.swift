import AppIntents
import DesignSystem
import Surfaces
import SwiftUI
import WidgetKit

// Виды виджетов (`ios-widgets`, макет Widgets.png). Файл собирается и в
// расширение, и в приложение: в приложении их снимают снапшот-тесты
// (`VzveshenoTests/WidgetSnapshotTests`). Строки готовит `Surfaces`, здесь —
// только раскладка на токенах.

/// Как система рисует виджет: в цвете или одним тоном (экран «Домой» в
/// режиме «Оттенок», экран блокировки). Отдельным значением, а не чтением
/// окружения в каждом виде: снапшот-тест задаёт его сам.
enum WidgetTint: Sendable {
    case full
    case accented

    init(_ mode: WidgetRenderingMode) {
        self = mode == .fullColor ? .full : .accented
    }
}

/// Полукруг съеденного: дорожка и заполнение слева направо.
struct WidgetArc: View {
    let fraction: Double
    let tint: WidgetTint
    var lineWidth: CGFloat = 10

    var body: some View {
        ZStack {
            WidgetHalfArc(progress: 1)
                .stroke(tint == .full ? DS.Color.track : DS.Color.fgDefault.opacity(0.25),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            if fraction > 0 {
                WidgetHalfArc(progress: fraction)
                    .stroke(tint == .full ? DS.Color.primaryDefault : DS.Color.fgDefault,
                            style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .widgetAccentable()
            }
        }
        .padding(lineWidth / 2)
        .accessibilityHidden(true)
    }
}

private struct WidgetHalfArc: Shape {
    var progress: Double

    func path(in rect: CGRect) -> Path {
        let radius = min(rect.width / 2, rect.height)
        let center = CGPoint(x: rect.midX, y: rect.minY + radius)
        var path = Path()
        path.addArc(center: center, radius: radius, startAngle: .degrees(180),
                    endAngle: .degrees(180 + 180 * min(max(progress, 0), 1)), clockwise: false)
        return path
    }
}

/// Текст вместо данных: «Войдите во Взвешено», «Доступно клиентам»,
/// «Нет данных за сегодня».
struct WidgetMessageView: View {
    let message: String
    let tint: WidgetTint

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s1) {
            Text("Взвешено")
                .dsText(DS.Typography.caption)
                .foregroundStyle(DS.Color.fgMuted)
            Spacer(minLength: 0)
            Text(message)
                .dsText(DS.Typography.headline)
                .foregroundStyle(DS.Color.fgDefault)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Маленький виджет клиента: «Осталось», дуга, «1 923», «ккал из 2 472».
struct ClientSmallWidgetView: View {
    let state: ClientWidgetState
    let tint: WidgetTint

    var body: some View {
        if case let .day(day) = state {
            VStack(alignment: .leading, spacing: 0) {
                Text(day.title)
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.fgMuted)
                WidgetArc(fraction: day.fraction, tint: tint)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, DS.Space.s1)
                    .padding(.top, DS.Space.s2)
                Spacer(minLength: 0)
                Text(day.headline)
                    .dsText(DS.Typography.numL)
                    .foregroundStyle(day.isOver && tint == .full ? DS.Color.statusDangerFg : DS.Color.fgDefault)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(day.caption)
                    .dsText(DS.Typography.micro)
                    .foregroundStyle(DS.Color.fgMuted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(day.accessibilityLabel)
        } else {
            WidgetMessageView(message: state.message ?? "", tint: tint)
        }
    }
}

/// Средний виджет клиента: остаток, Б/Ж/У, вода и кнопки «+ стакан», «+ еда».
struct ClientMediumWidgetView: View {
    let state: ClientWidgetState
    let tint: WidgetTint
    /// Ссылка «+ еда» — лист «Записать еду» на поиске. В тестах `nil`.
    var foodURL: URL?

    var body: some View {
        if case let .day(day) = state {
            HStack(alignment: .center, spacing: DS.Space.s3) {
                summary(day)
                Spacer(minLength: 0)
                VStack(spacing: DS.Space.s2) {
                    if day.water != nil {
                        Button(intent: AddWaterIntent()) {
                            buttonLabel("+ стакан", foreground: DS.Color.statusInfoFg, background: DS.Color.statusInfoSoft)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Добавить стакан воды")
                    }
                    food
                }
                .frame(width: 104)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            WidgetMessageView(message: state.message ?? "", tint: tint)
        }
    }

    @ViewBuilder private var food: some View {
        let label = buttonLabel("+ еда", foreground: DS.Color.primaryDefault, background: DS.Color.primarySoft)
            .accessibilityLabel("Записать еду")
        if let foodURL {
            Link(destination: foodURL) { label }
        } else {
            label
        }
    }

    private func summary(_ day: ClientDay) -> some View {
        VStack(alignment: .leading, spacing: DS.Space.s1) {
            Text(day.mediumTitle)
                .dsText(DS.Typography.callout)
                .foregroundStyle(DS.Color.fgMuted)
            HStack(alignment: .firstTextBaseline, spacing: DS.Space.s1) {
                Text(day.headline)
                    .dsText(DS.Typography.numXl)
                    .foregroundStyle(day.isOver && tint == .full ? DS.Color.statusDangerFg : DS.Color.fgDefault)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text("ккал")
                    .dsText(DS.Typography.body)
                    .foregroundStyle(DS.Color.fgMuted)
            }
            if let macros = day.macros {
                macrosLine(macros)
            }
            if let water = day.water {
                WaterDots(glasses: water.glasses, goal: water.goal, tint: tint)
                    .padding(.top, DS.Space.s1)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Вода: \(water.glasses) из \(water.goal)")
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func macrosLine(_ macros: [MacroText]) -> some View {
        var text = Text(verbatim: "")
        for (index, macro) in macros.enumerated() {
            let separator = index > 0 ? Text(verbatim: " · ").foregroundStyle(DS.Color.fgMuted) : Text(verbatim: "")
            let value = Text(verbatim: macro.text).foregroundStyle(tint == .full ? macro.kind.color : DS.Color.fgDefault)
            text = Text("\(text)\(separator)\(value)")
        }
        return Text("\(text)\(Text(verbatim: " г").foregroundStyle(DS.Color.fgDefault))")
            .dsText(DS.Typography.callout)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    private func buttonLabel(_ title: String, foreground: Color, background: Color) -> some View {
        Text(title)
            .dsText(DS.Typography.headline)
            .foregroundStyle(tint == .full ? foreground : DS.Color.fgDefault)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(tint == .full ? background : DS.Color.fgDefault.opacity(0.15),
                        in: RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous))
    }
}

/// Вода точками: выпитые — цветом воды, остальные — дорожкой. «N из M» —
/// подписью справа (спека), точки — как на макете.
struct WaterDots: View {
    let glasses: Int
    let goal: Int
    let tint: WidgetTint

    var body: some View {
        HStack(spacing: DS.Space.s2) {
            HStack(spacing: 4) {
                ForEach(0..<max(min(goal, 12), 1), id: \.self) { index in
                    Capsule()
                        .fill(index < glasses ? filled : empty)
                        .frame(width: 13, height: 6)
                }
            }
            Text("\(glasses) из \(goal)")
                .dsText(DS.Typography.micro)
                .foregroundStyle(DS.Color.fgMuted)
        }
    }

    private var filled: Color { tint == .full ? DS.Color.macroWater : DS.Color.fgDefault }
    private var empty: Color { tint == .full ? DS.Color.track : DS.Color.fgDefault.opacity(0.25) }
}

extension MacroText.Kind {
    var color: Color {
        switch self {
        case .protein: return DS.Color.macroProteinFg
        case .fat: return DS.Color.macroFatFg
        case .carbs: return DS.Color.macroCarbsFg
        }
    }
}

/// Экран блокировки, круглый: дуга и остаток.
struct ClientCircularWidgetView: View {
    let state: ClientWidgetState

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if case let .day(day) = state {
                VStack(spacing: 0) {
                    WidgetArc(fraction: day.fraction, tint: .accented, lineWidth: 5)
                        .frame(width: 44, height: 26)
                    Text(day.compact)
                        .dsText(DS.Typography.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                .padding(.top, DS.Space.s1)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(day.accessibilityLabel)
            } else {
                Image(systemName: "fork.knife")
                    .font(.title3)
                    .accessibilityLabel(state.message ?? "")
            }
        }
    }
}

/// Экран блокировки, прямоугольный: «1 923 ккал», макросы и вода.
struct ClientRectangularWidgetView: View {
    let state: ClientWidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if case let .day(day) = state {
                Text(day.inline)
                    .dsText(DS.Typography.headline)
                    .widgetAccentable()
                if !day.rectangularDetail.isEmpty {
                    Text(day.rectangularDetail)
                        .dsText(DS.Typography.caption)
                        .lineLimit(2)
                }
            } else {
                Text("Взвешено")
                    .dsText(DS.Typography.headline)
                    .widgetAccentable()
                Text(state.message ?? "")
                    .dsText(DS.Typography.caption)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Экран блокировки, строчный: «1 923 ккал».
struct ClientInlineWidgetView: View {
    let state: ClientWidgetState

    var body: some View {
        if case let .day(day) = state {
            Text(day.inline)
        } else {
            Text(state.message ?? "")
        }
    }
}

/// Маленький виджет куратора: «Требуют внимания» и непрочитанные.
struct CuratorSmallWidgetView: View {
    let state: CuratorWidgetState
    let tint: WidgetTint

    var body: some View {
        if case let .counts(attention, _) = state {
            VStack(alignment: .leading, spacing: 0) {
                Text("Требуют внимания")
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.fgMuted)
                Text(SurfaceText.grouped(attention))
                    .dsText(DS.Typography.numXl)
                    .foregroundStyle(attention > 0 && tint == .full ? DS.Color.statusDangerFg : DS.Color.fgDefault)
                    .widgetAccentable()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 0)
                Text(state.unreadText ?? "")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgDefault)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel([state.attentionText, state.unreadText].compactMap { $0 }.joined(separator: ", "))
        } else {
            WidgetMessageView(message: state.message ?? "", tint: tint)
        }
    }
}

/// Карточка ответа «Сколько калорий осталось».
struct RemainingCaloriesSnippet: View {
    let state: ClientWidgetState

    var body: some View {
        ClientMediumWidgetView(state: state, tint: .full)
            .padding(DS.Space.s4)
            .frame(height: 158)
    }
}
