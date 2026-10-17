import Client
import DesignSystem
import SwiftUI

/// Карточка «Сегодня»: бумага, линия 1 pt, отступ 16 (у плиток — 14).
struct TodayCard<Content: View>: View {
    var padding: CGFloat = DS.Space.s4
    @ViewBuilder let content: Content

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        content
            .padding(padding)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(shape.fill(DS.Color.bgSurface))
            .overlay(shape.strokeBorder(DS.Color.lineDefault, lineWidth: 1))
    }
}

/// Тонкая полоса 6 pt.
struct TodayBar: View {
    let fraction: Double
    let color: Color

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(DS.Color.track)
                Capsule().fill(color).frame(width: proxy.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

/// Подпись источника: «♡ из Здоровья · 07:42».
struct SourceCaption: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: DS.Space.s1) {
            Image(systemName: "heart").font(.system(.caption2)).accessibilityHidden(true)
            Text(text).font(.custom(DS.FontFamily.sans, size: 11, relativeTo: .caption2))
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(DS.Color.fgSubtle)
    }
}

// MARK: Питание

struct NutritionTodayCard: View {
    let summary: NutritionSummary
    let onFillProfile: () -> Void
    let onLogWeight: () -> Void

    var body: some View {
        TodayCard {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                HStack {
                    Text("Питание").dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    if let source = summary.sourceLabel {
                        Text(source).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                            .accessibilityIdentifier("nutrition.source")
                    }
                }
                if summary.norm != nil {
                    withNorm
                } else {
                    withoutNorm
                }
            }
        }
        .accessibilityIdentifier("today.nutrition")
    }

    private var withNorm: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            HStack(alignment: .center, spacing: DS.Space.s4) {
                HalfArc(fraction: summary.fraction)
                    .frame(width: 132, height: 76)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text(summary.headline)
                        .font(.custom(DS.FontFamily.sans, size: 40, relativeTo: .largeTitle).weight(.semibold))
                        .tracking(-0.8)
                        .monospacedDigit()
                        .foregroundStyle(DS.Color.fgDefault)
                        .lineLimit(1)
                        .minimumScaleFactor(0.4)
                        .accessibilityIdentifier("nutrition.remaining")
                    Text(summary.caption)
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("nutrition.caption")
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(summary.accessibilityLabel)
            .accessibilityIdentifier("nutrition.summary")
            if let macros = summary.macros {
                HStack(alignment: .top, spacing: DS.Space.s3) {
                    ForEach(macros, id: \.macro) { macro in
                        VStack(alignment: .leading, spacing: DS.Space.s1) {
                            Text(macro.macro.title).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                            Text("\(macro.headline) г")
                                .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .headline).weight(.semibold))
                                .foregroundStyle(textColor(macro.macro))
                            TodayBar(fraction: macro.fraction, color: fillColor(macro.macro))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(macro.accessibilityLabel)
                    }
                }
            }
        }
    }

    private var withoutNorm: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            Text("Норма не посчитана")
                .dsText(DS.Typography.headline)
                .foregroundStyle(DS.Color.fgDefault)
                .accessibilityIdentifier("nutrition.noNorm")
            Text("Съедено \(summary.headline) ккал. Чтобы посчитать норму, не хватает: \(summary.missingItems.joined(separator: ", ")).")
                .dsText(DS.Typography.callout)
                .foregroundStyle(DS.Color.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: DS.Space.s2) {
                Button("Заполнить профиль", action: onFillProfile)
                    .buttonStyle(DSButtonStyle(.primary, size: .medium))
                Button("Записать вес", action: onLogWeight)
                    .buttonStyle(DSButtonStyle(.secondary, size: .medium))
            }
        }
    }

    private func textColor(_ macro: MacroLeft.Macro) -> Color {
        switch macro {
        case .protein: return DS.Color.macroProteinFg
        case .fat: return DS.Color.macroFatFg
        case .carbs: return DS.Color.macroCarbsFg
        }
    }

    private func fillColor(_ macro: MacroLeft.Macro) -> Color {
        switch macro {
        case .protein: return DS.Color.macroProtein
        case .fat: return DS.Color.macroFat
        case .carbs: return DS.Color.macroCarbs
        }
    }
}

/// Полукруг съеденного: дальше 100 % не заполняется и не перекрашивается.
struct HalfArc: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            // Как на макете: дуга радиусом 56 в рамке 132 × 76, концы на 6 pt выше низа.
            let line: CGFloat = 12
            let radius = min(proxy.size.width / 2 - 10, proxy.size.height - 20)
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height - 6)
            ZStack {
                arc(center: center, radius: radius, progress: 1)
                    .stroke(DS.Color.track, style: StrokeStyle(lineWidth: line, lineCap: .round))
                if fraction > 0 {
                    arc(center: center, radius: radius, progress: min(fraction, 1))
                        .stroke(DS.Color.primaryDefault, style: StrokeStyle(lineWidth: line, lineCap: .round))
                }
            }
        }
    }

    private func arc(center: CGPoint, radius: CGFloat, progress: Double) -> Path {
        var path = Path()
        path.addArc(center: center, radius: radius, startAngle: .degrees(180), endAngle: .degrees(180 + 180 * progress),
                    clockwise: false)
        return path
    }
}

// MARK: Куратор

struct CuratorRow: View {
    let summary: CuratorSummary
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: DS.Space.s3) {
                Text(verbatim: summary.initial ?? "К")
                    .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .headline).weight(.semibold))
                    .foregroundStyle(DS.Color.coachFg)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(DS.Color.coachFgMuted.opacity(0.35)))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .subheadline).weight(.semibold))
                        .foregroundStyle(DS.Color.coachFg)
                        .lineLimit(1)
                    Text(subtitle)
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.coachFgMuted)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if case let .curator(_, _, unread) = summary.state, unread > 0 {
                    Text(verbatim: "\(unread)")
                        .font(.custom(DS.FontFamily.sans, size: 12, relativeTo: .caption).weight(.semibold))
                        .foregroundStyle(DS.Color.primaryFg)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(DS.Color.primaryDefault))
                }
            }
            .padding(.horizontal, DS.Space.s4)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.coachBg))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today.curator")
    }

    private var title: String {
        switch summary.state {
        case let .curator(name, _, _): return "\(name) · ваш куратор"
        case .noAccess: return "Работа с куратором"
        case .unassigned: return "Куратор скоро появится"
        }
    }

    /// Без доступа — описание услуги, без цены, заявки и ссылок (App Review 3.1.1(a)).
    private var subtitle: String {
        switch summary.state {
        case let .curator(_, message, _): return message ?? "Напишите куратору"
        case let .noAccess(expired):
            return expired ? "Доступ закончился — переписка доступна для чтения" : "Персональные рекомендации в переписке 1:1"
        case .unassigned: return "Мы подбираем вам куратора"
        }
    }
}

// MARK: Плитки дня

struct StepsTile: View {
    let card: StepsCard
    let onEdit: () -> Void

    var body: some View {
        Button(action: onEdit) {
            TodayCard(padding: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Шаги").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    Text(card.value).dsText(DS.Typography.numL).foregroundStyle(DS.Color.fgDefault)
                    TodayBar(fraction: card.fraction, color: DS.Color.statusSuccessFg)
                    if let source = SourceLabel.text(card.source) {
                        SourceCaption(text: "\(source) · цель \(NumberText.grouped(card.goal))")
                    } else {
                        Text("цель \(NumberText.grouped(card.goal))")
                            .font(.custom(DS.FontFamily.sans, size: 11, relativeTo: .caption2))
                            .foregroundStyle(DS.Color.fgSubtle)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Шаги: \(card.value), \(card.caption)")
        .accessibilityHint("Ввести вручную")
        .accessibilityIdentifier("today.steps")
    }
}

struct WaterTile: View {
    let card: WaterCard
    let onAdd: () -> Void

    var body: some View {
        TodayCard(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Вода").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    Spacer()
                    Button(action: onAdd) {
                        Image(systemName: "plus")
                            .font(.system(.callout, weight: .medium))
                            .foregroundStyle(DS.Color.primaryDefault)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(DS.Color.primarySoft))
                            .frame(width: DS.Size.touch, height: DS.Size.touch)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(-6)
                    .sensoryFeedback(.impact(weight: .light), trigger: card.glasses)
                    .accessibilityLabel("Добавить стакан")
                    .accessibilityIdentifier("water.add")
                }
                HStack(alignment: .firstTextBaseline, spacing: DS.Space.s1) {
                    Text(card.value).dsText(DS.Typography.numL).foregroundStyle(DS.Color.fgDefault)
                        .accessibilityIdentifier("water.count")
                    Text(card.caption).dsText(DS.Typography.caption).fontWeight(.semibold).foregroundStyle(DS.Color.fgMuted)
                }
                HStack(spacing: 3) {
                    ForEach(0..<max(card.goal, 1), id: \.self) { index in
                        Capsule().fill(index < card.glasses ? DS.Color.macroWater : DS.Color.track).frame(height: 6)
                    }
                }
                .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(card.accessibilityLabel)
        .accessibilityIdentifier("today.water")
    }
}

struct WeightTile: View {
    let card: WeightCard
    let onEdit: () -> Void

    var body: some View {
        Button(action: onEdit) {
            TodayCard(padding: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Вес").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    HStack(alignment: .firstTextBaseline, spacing: DS.Space.s1) {
                        Text(card.value ?? "—").dsText(DS.Typography.numL).foregroundStyle(DS.Color.fgDefault)
                        if card.value != nil {
                            Text("кг").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        }
                    }
                    if let change = card.changeText {
                        Text(change).dsText(DS.Typography.caption).foregroundStyle(DS.Color.statusSuccessFg)
                    } else if card.value == nil {
                        Text("Записать вес").dsText(DS.Typography.caption).foregroundStyle(DS.Color.primaryDefault)
                    }
                    if let caption = card.caption { SourceCaption(text: caption) }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Ввести вручную")
        .accessibilityIdentifier("today.weight")
    }
}

struct WorkoutTile: View {
    let card: WorkoutCard
    let onEdit: () -> Void

    var body: some View {
        Button(action: onEdit) {
            TodayCard(padding: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Тренировка").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    HStack(alignment: .firstTextBaseline, spacing: DS.Space.s1) {
                        Text(card.value).dsText(DS.Typography.numL).foregroundStyle(DS.Color.fgDefault)
                        if card.minutes != nil {
                            Text("мин").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        }
                    }
                    Text(card.hasWorkout ? card.detail : "Записать тренировку")
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(card.hasWorkout ? DS.Color.fgMuted : DS.Color.primaryDefault)
                        .fixedSize(horizontal: false, vertical: true)
                    if let source = SourceLabel.text(card.source) { SourceCaption(text: source) }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Ввести вручную")
        .accessibilityIdentifier("today.workout")
    }
}
