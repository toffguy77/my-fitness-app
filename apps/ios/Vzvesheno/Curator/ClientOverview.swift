import Client
import Curator
import DesignSystem
import SwiftUI

/// «Обзор»: день против плана, вес и вода с целями, дневник по дням,
/// шаги и тренировки, фото недели, оповещения клиента.
struct ClientOverview: View {
    let detail: ClientDetail
    let today: String
    let notices: [ClientNotice]
    let waterCaption: String?
    let calendar: DayCalendar
    let actions: ClientCardActions
    @State private var showEarlier = false

    private var day: ClientDay? { detail.days.first { $0.date == today } ?? detail.days.first }

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            if let day {
                DayCard(day: day, plan: day.plan ?? detail.weeklyPlan)
            }
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    WeightGoalTile(detail: detail, onEdit: actions.editWeightGoal)
                    WaterGoalTile(goal: detail.waterGoal, drunk: day?.water?.glasses ?? 0, hiddenCaption: waterCaption,
                                  onChange: actions.setWaterGoal)
                }
            }
            DiaryCard(days: detail.days, today: today, plan: detail.weeklyPlan, calendar: calendar, showEarlier: $showEarlier)
            if !detail.photos.isEmpty {
                PhotosCard(photos: detail.photos)
            }
            ActivityCard(days: detail.days, today: today, calendar: calendar)
            if !notices.isEmpty {
                NoticesCard(notices: Array(notices.prefix(5)))
            }
        }
    }
}

private func grams(_ value: Double) -> String { NumberText.grouped(NumberText.jsRound(value)) }

private func sourceText(_ source: String?) -> String? { source == "healthkit" ? "из Здоровья" : nil }

/// «Сегодня»: 2 960 из 2 240 ккал, +720 сверх нормы, Б/Ж/У полосами.
private struct DayCard: View {
    let day: ClientDay
    let plan: Macros?

    var body: some View {
        CuratorCard {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                HStack {
                    Text("Сегодня").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                    Spacer()
                    if day.alerts.contains(where: { $0.level == "red" }) {
                        CuratorBadge(text: "Алерт КБЖУ", tone: .danger)
                            .accessibilityLabel("Алерт КБЖУ: \(day.alerts.map(\.message).joined(separator: "; "))")
                            .accessibilityIdentifier("card.alert")
                    }
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(grams(day.kbzhu.calories))
                        .dsText(DS.Typography.numL)
                        .foregroundStyle(DS.Color.fgDefault)
                    Text(kcalLine).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                macro("Б", day.kbzhu.protein, plan?.protein, fill: DS.Color.macroProtein, text: DS.Color.macroProteinFg)
                macro("Ж", day.kbzhu.fat, plan?.fat, fill: DS.Color.macroFat, text: DS.Color.macroFatFg)
                macro("У", day.kbzhu.carbs, plan?.carbs, fill: DS.Color.macroCarbs, text: DS.Color.macroCarbsFg)
                ForEach(day.alerts.filter { $0.level != "red" }, id: \.self) { alert in
                    Text(alert.message).dsText(DS.Typography.caption).foregroundStyle(DS.Color.statusWarningFg)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("card.day")
    }

    private var kcalLine: String {
        guard let plan, plan.calories > 0 else { return "ккал" }
        let diff = NumberText.jsRound(day.kbzhu.calories - plan.calories)
        let tail = diff > 0 ? " · +\(NumberText.grouped(diff)) сверх нормы" : diff < 0 ? " · осталось \(NumberText.grouped(-diff))" : ""
        return "из \(grams(plan.calories)) ккал\(tail)"
    }

    private func macro(_ letter: String, _ eaten: Double, _ goal: Double?, fill: Color, text: Color) -> some View {
        HStack(spacing: DS.Space.s2) {
            Text(letter).font(.custom(DS.FontFamily.sans, size: 12, relativeTo: .caption).weight(.semibold))
                .foregroundStyle(text).frame(width: 22, alignment: .leading)
            TodayBar(fraction: goal.map { $0 > 0 ? eaten / $0 : 0 } ?? 0, color: fill)
            Text(goal.map { "\(grams(eaten)) / \(grams($0)) г" } ?? "\(grams(eaten)) г")
                .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted).monospacedDigit()
                .frame(minWidth: 72, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

/// «Вес»: линия за 8 недель, текущий и цель (правится на месте), тренд и источник.
private struct WeightGoalTile: View {
    let detail: ClientDetail
    let onEdit: () -> Void

    private var points: [WeightPoint] { detail.weightHistory }

    var body: some View {
        Button(action: onEdit) {
            CuratorCard {
                VStack(alignment: .leading, spacing: DS.Space.s2) {
                    Text("Вес").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    WeightSparkline(values: points.map(\.weight), target: detail.client.targetWeight)
                        .frame(height: 40)
                    (Text(current).font(.custom(DS.FontFamily.sans, size: 14, relativeTo: .callout).weight(.bold))
                        + Text(" · цель ") + Text(target).foregroundStyle(DS.Color.primaryDefault))
                        .font(.custom(DS.FontFamily.sans, size: 14, relativeTo: .callout))
                        .foregroundStyle(DS.Color.fgDefault)
                        .accessibilityIdentifier("card.weightGoal")
                    if let trend {
                        Text(trend).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    }
                    if let source = sourceText(detail.client.lastWeightSource ?? points.last?.source) {
                        SourceCaption(text: source)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .buttonStyle(.plain)
        .accessibilityHint("Изменить цель веса")
    }

    private var current: String {
        (detail.client.lastWeight ?? points.last?.weight).map { "\(NumberText.oneDecimal($0)) кг" } ?? "—"
    }

    private var target: String { detail.client.targetWeight.map { "\(NumberText.oneDecimal($0)) кг" } ?? "не задана" }

    /// «за 8 нед.: −0,8 кг».
    private var trend: String? {
        guard let first = points.first?.weight, let last = points.last?.weight, points.count > 1 else { return nil }
        let change = last - first
        let sign = change > 0 ? "+" : ""
        return "тренд: \(sign)\(NumberText.oneDecimal(change)) кг"
    }
}

/// Линия веса и пунктир цели.
private struct WeightSparkline: View {
    let values: [Double]
    let target: Double?

    var body: some View {
        GeometryReader { proxy in
            let all = values + (target.map { [$0] } ?? [])
            let low = (all.min() ?? 0) - 0.5
            let high = (all.max() ?? 1) + 0.5
            let span = max(high - low, 0.1)
            let size = proxy.size
            ZStack {
                if let target {
                    Path { path in
                        let y = size.height * (1 - (target - low) / span)
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: size.width, y: y))
                    }
                    .stroke(DS.Color.fgSubtle, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                }
                if values.count > 1 {
                    Path { path in
                        for (index, value) in values.enumerated() {
                            let point = CGPoint(x: size.width * CGFloat(index) / CGFloat(values.count - 1),
                                                y: size.height * (1 - (value - low) / span))
                            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
                        }
                    }
                    .stroke(DS.Color.primaryDefault, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// «Вода, стаканов в день»: − цель +, «Убрать», выпито сегодня.
private struct WaterGoalTile: View {
    let goal: Int?
    let drunk: Int
    let hiddenCaption: String?
    let onChange: (Int?) -> Void

    var body: some View {
        CuratorCard {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                Text("Вода, стаканов в день").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if let goal {
                    HStack {
                        stepButton("minus", label: "Меньше") { onChange(max(1, goal - 1)) }.disabled(goal <= 1)
                        Text("\(goal)").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                            .frame(maxWidth: .infinity)
                            .accessibilityIdentifier("card.waterGoal")
                        stepButton("plus", label: "Больше") { onChange(min(30, goal + 1)) }.disabled(goal >= 30)
                    }
                    .frame(minHeight: 36)
                    .background(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous).fill(DS.Color.bgSubtle))
                    Text("сегодня выпито \(drunk)").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    Button("Убрать") { onChange(nil) }
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.primaryDefault)
                        .accessibilityIdentifier("card.waterGoal.remove")
                } else {
                    if let hiddenCaption {
                        Text(hiddenCaption).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("card.waterHidden")
                    }
                    Button("Задать цель") { onChange(8) }
                        .buttonStyle(DSButtonStyle(.secondary, size: .small))
                        .accessibilityIdentifier("card.waterGoal.set")
                }
            }
            .frame(maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func stepButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(.body).weight(.semibold)).foregroundStyle(DS.Color.fgDefault)
                .frame(width: 40, height: 36)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// «Дневник»: три последних дня раскрыты, остальные — под «Ранее (N дн.)».
private struct DiaryCard: View {
    let days: [ClientDay]
    let today: String
    let plan: Macros?
    let calendar: DayCalendar
    @Binding var showEarlier: Bool

    var body: some View {
        CuratorCard {
            VStack(alignment: .leading, spacing: 0) {
                Text("Дневник").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault).padding(.bottom, DS.Space.s1)
                ForEach(days.prefix(3)) { day in DiaryDayRow(day: day, title: title(day.date), plan: day.plan ?? plan) }
                if days.count > 3 {
                    Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
                    Button {
                        showEarlier.toggle()
                    } label: {
                        HStack {
                            Text("Ранее (\(days.count - 3) дн.)").dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
                            Spacer()
                            Image(systemName: showEarlier ? "chevron.up" : "chevron.down").foregroundStyle(DS.Color.fgMuted)
                        }
                        .padding(.vertical, DS.Space.s3)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("card.diary.earlier")
                    if showEarlier {
                        ForEach(days.dropFirst(3)) { day in DiaryDayRow(day: day, title: title(day.date), plan: day.plan ?? plan) }
                    }
                }
            }
        }
    }

    /// «Сегодня», «Вчера», «ср, 15 окт.».
    private func title(_ key: String) -> String {
        if key == today { return "Сегодня" }
        if key == calendar.adding(days: -1, to: today) { return "Вчера" }
        let weekday = DayText.short(key, calendar: calendar).lowercased()
        let parts = DayText.dayMonth(key).split(separator: " ")
        let month = parts.count == 2 ? String(parts[1].prefix(3)) : ""
        return "\(weekday), \(parts.first ?? "") \(month)."
    }
}

/// День дневника: итог против плана и, по нажатию, записи.
private struct DiaryDayRow: View {
    let day: ClientDay
    let title: String
    let plan: Macros?
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
            Button { expanded.toggle() } label: {
                HStack {
                    Text(title).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                    Spacer()
                    Text(total).dsText(DS.Typography.callout).monospacedDigit()
                        .foregroundStyle(over ? DS.Color.statusDangerFg : DS.Color.fgDefault)
                }
                .padding(.vertical, DS.Space.s2)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(day.foodEntries.isEmpty ? "" : "Показать записи")
            .accessibilityIdentifier("card.diary.\(day.date)")
            if expanded {
                if day.foodEntries.isEmpty {
                    Text("Записей нет").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted).padding(.bottom, DS.Space.s2)
                }
                ForEach(day.foodEntries) { entry in
                    FoodEntryLine(entry: entry)
                }
            }
        }
    }

    private var total: String {
        let eaten = grams(day.kbzhu.calories)
        guard let plan, plan.calories > 0 else { return eaten }
        return "\(eaten) / \(grams(plan.calories))"
    }

    private var over: Bool {
        guard let plan, plan.calories > 0 else { return false }
        return day.kbzhu.calories > plan.calories * 1.2
    }
}

/// Запись дня: блюдо, вес, ккал; запись по фото — «Добавлено куратором».
private struct FoodEntryLine: View {
    let entry: ClientFoodEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(entry.foodName).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                Spacer()
                Text("\(grams(entry.calories)) ккал").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted).monospacedDigit()
            }
            Text(caption).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgSubtle)
            if entry.addedByCurator {
                Text("Добавлено куратором").dsText(DS.Typography.micro).foregroundStyle(DS.Color.statusInfoFg)
            }
        }
        .padding(.vertical, DS.Space.s1)
        .padding(.leading, DS.Space.s3)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(entry.addedByCurator ? "entry.byCurator" : "entry.\(entry.id)")
    }

    private var caption: String {
        let meal = MealType(rawValue: entry.mealType)?.title ?? entry.mealType
        return [meal, entry.time, entry.weight > 0 ? "\(grams(entry.weight)) г" : ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// Шаги и тренировки за неделю с источником.
private struct ActivityCard: View {
    let days: [ClientDay]
    let today: String
    let calendar: DayCalendar

    var body: some View {
        CuratorCard {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                Text("Активность").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                if let day = days.first {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Шаги сегодня").dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
                        Spacer()
                        Text(NumberText.grouped(day.steps)).dsText(DS.Typography.body).monospacedDigit().foregroundStyle(DS.Color.fgDefault)
                    }
                    if let source = sourceText(day.stepsSource) { SourceCaption(text: source) }
                }
                let workouts = days.filter { $0.workout?.completed == true }
                if workouts.isEmpty {
                    Text("Тренировок за неделю нет").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                } else {
                    ForEach(workouts) { day in
                        HStack(alignment: .firstTextBaseline) {
                            Text(DayText.dayMonth(day.date)).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                            Spacer()
                            Text(workoutText(day.workout)).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                        }
                        if let source = sourceText(day.workoutSource) { SourceCaption(text: source) }
                    }
                }
            }
        }
    }

    private func workoutText(_ workout: ClientDay.Workout?) -> String {
        guard let workout else { return "" }
        let kind = WorkoutKind.title(for: workout.type)
        return workout.duration > 0 ? "\(kind), \(workout.duration) мин" : kind
    }
}

/// «Фото недели» — только с наших адресов.
private struct PhotosCard: View {
    let photos: [WeekPhoto]

    var body: some View {
        CuratorCard {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                Text("Фото недели").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: DS.Space.s2) {
                        ForEach(photos) { photo in
                            AttachmentImage(url: photo.url)
                                .frame(width: 72, height: 96)
                                .clipShape(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous))
                                .accessibilityLabel("Фото недели с \(DayText.dayMonth(photo.weekStart))")
                        }
                    }
                }
            }
        }
    }
}

/// Оповещения, которые получил клиент.
private struct NoticesCard: View {
    let notices: [ClientNotice]

    var body: some View {
        CuratorCard {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                Text("Оповещения").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                ForEach(notices) { notice in
                    HStack(alignment: .firstTextBaseline) {
                        Text(notice.title).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                        Spacer()
                        Text(DayText.dayMonth(DayKey.of(notice.createdAt))).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    }
                }
            }
        }
    }
}
