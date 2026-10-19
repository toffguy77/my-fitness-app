import Client
import DesignSystem
import SwiftUI

/// Вкладка «Нутриенты»: категории, строка — потребление против нормы.
struct NutrientsContent: View {
    let answer: RecommendationsAnswer?
    let error: String?
    let onOpen: (NutrientRecommendation) -> Void
    let onConfigure: () -> Void
    let onAddCustom: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            if let error {
                Text(error).dsText(DS.Typography.callout).foregroundStyle(DS.Color.statusDangerFg)
            }
            if let answer {
                ForEach(answer.sections, id: \.key) { section in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(RecommendationsAnswer.categoryTitle(section.key))
                            .font(.custom(DS.FontFamily.serif, size: 17, relativeTo: .headline).weight(.medium))
                            .foregroundStyle(DS.Color.fgDefault)
                            .padding(.horizontal, DS.Space.s4)
                            .padding(.top, DS.Space.s3)
                            .padding(.bottom, DS.Space.s1)
                            .accessibilityAddTraits(.isHeader)
                        ForEach(section.items) { item in
                            Button { onOpen(item) } label: { NutrientRow(item: item) }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("nutrient.\(item.name)")
                        }
                    }
                    .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
                    .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
                }
                if answer.sections.isEmpty {
                    Text("Нормы по нутриентам пока не заведены, поэтому показывать нечего.")
                        .dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                }
            } else if error == nil {
                DSSpinner("Загружаем нутриенты")
            }
            HStack(spacing: DS.Space.s2) {
                Button("Настроить список", action: onConfigure).buttonStyle(DSButtonStyle(.secondary, size: .medium))
                    .accessibilityIdentifier("nutrients.configure")
                Button("Добавить рекомендацию", action: onAddCustom).buttonStyle(DSButtonStyle(.secondary, size: .medium))
                    .accessibilityIdentifier("nutrients.add")
            }
        }
    }
}

private struct NutrientRow: View {
    let item: NutrientRecommendation

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.name).font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout)).foregroundStyle(DS.Color.fgDefault)
                Spacer()
                Text(item.progressText).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
            }
            if item.currentIntake != nil && item.dailyTarget != nil {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(DS.Color.track)
                        Capsule().fill(DS.Color.primaryDefault).frame(width: proxy.size.width * item.fraction)
                    }
                }
                .frame(height: 4)
            }
        }
        .padding(.horizontal, DS.Space.s4)
        .padding(.vertical, 10)
        .overlay(alignment: .top) { Rectangle().fill(DS.Color.lineDefault).frame(height: 1) }
        .contentShape(Rectangle())
    }
}

/// Детали нутриента: норма, польза, «При недостатке», «Откуда в рационе»,
/// «посчитано по X из Y записей».
struct NutrientDetailContent: View {
    let item: NutrientRecommendation

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            Text(item.name).dsText(DS.Typography.title1).foregroundStyle(DS.Color.fgDefault)
                .accessibilityAddTraits(.isHeader)
            DSCard {
                VStack(alignment: .leading, spacing: DS.Space.s2) {
                    Text(item.normText).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                    Text(item.progressText).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted)
                    if item.dailyTarget != nil, item.currentIntake != nil {
                        DSProgressBar(value: item.fraction, max: 1, label: item.progressText)
                    }
                    if let coverage = item.coverageText {
                        Text(coverage).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgSubtle)
                            .accessibilityIdentifier("nutrient.coverage")
                    }
                    if let source = item.normSource, !source.isEmpty {
                        Text("Источник нормы: \(source)").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgSubtle)
                    }
                }
            }
            block("Польза", item.benefits)
            block("При недостатке", item.effects)
            VStack(alignment: .leading, spacing: DS.Space.s1) {
                Text("Откуда в рационе").dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                if item.sources.isEmpty {
                    Text("Продуктов с этим нутриентом за день не записано.")
                        .dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted)
                } else {
                    ForEach(item.sources, id: \.foodName) { source in
                        HStack {
                            Text(source.foodName)
                            Spacer()
                            Text("\(NumberText.oneDecimal(source.amount)) \(NutrientUnit.title(source.unit))")
                                .foregroundStyle(DS.Color.fgMuted)
                        }
                        .dsText(DS.Typography.body)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(DS.Color.fgDefault)
    }

    @ViewBuilder
    private func block(_ title: String, _ text: String?) -> some View {
        if let text, !text.isEmpty {
            VStack(alignment: .leading, spacing: DS.Space.s1) {
                Text(title).dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                Text(text).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Экран деталей: подгружает полную запись.
struct NutrientDetailScreen: View {
    let nutrients: NutrientsModel
    let item: NutrientRecommendation
    @State private var detail: NutrientRecommendation?

    var body: some View {
        ScrollView {
            NutrientDetailContent(item: detail ?? item)
                .padding(DS.Space.screenX)
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle("Нутриент")
        .navigationBarTitleDisplayMode(.inline)
        .task { detail = await nutrients.loadDetail(item.id) }
        .accessibilityIdentifier("screen.nutrient")
    }
}

/// «Настроить список»: какие нутриенты отслеживать (хотя бы один).
struct NutrientsConfigureSheet: View {
    let nutrients: NutrientsModel
    @Environment(\.dismiss) private var dismiss
    @State private var tracked: Set<String> = []
    @State private var failed = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(nutrients.answer?.sections ?? [], id: \.key) { section in
                    Section(RecommendationsAnswer.categoryTitle(section.key)) {
                        ForEach(section.items) { item in
                            Toggle(item.name, isOn: Binding(get: { tracked.contains(item.id) }, set: { on in
                                if on { tracked.insert(item.id) } else if tracked.count > 1 { tracked.remove(item.id) }
                            }))
                            .tint(DS.Color.primaryDefault)
                        }
                    }
                }
                if failed {
                    Text("Не удалось сохранить настройки. Прежний выбор сохранён.").foregroundStyle(DS.Color.statusDangerFg)
                }
            }
            .navigationTitle("Настроить список")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        Task {
                            if await nutrients.saveTracked(tracked) { dismiss() } else { failed = true }
                        }
                    }
                    .disabled(tracked.isEmpty)
                }
            }
        }
        .onAppear { tracked = Set((nutrients.answer?.all ?? []).filter(\.isTracked).map(\.id)) }
    }
}

/// «Добавить рекомендацию»: название 2–50 символов, норма, единица.
struct CustomRecommendationSheet: View {
    let nutrients: NutrientsModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var target = ""
    @State private var unit = NutrientUnit.mg
    @State private var failed = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                DSField(title: "Название", text: $name, placeholder: "от 2 до 50 символов")
                    .accessibilityIdentifier("custom.name")
                DSField(title: "Норма в день", text: $target, keyboard: .decimalPad)
                    .accessibilityIdentifier("custom.target")
                Picker("Единица", selection: $unit) {
                    ForEach(NutrientUnit.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                if failed {
                    Text("Не удалось добавить рекомендацию. Попробуйте снова.")
                        .dsText(DS.Typography.caption).foregroundStyle(DS.Color.statusDangerFg)
                }
                Button("Добавить") {
                    Task { if await nutrients.addCustom(name: name, target: target, unit: unit) { dismiss() } else { failed = true } }
                }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(CustomRecommendationForm.validate(name: name, target: target) == nil)
                .accessibilityIdentifier("custom.save")
                Spacer()
            }
            .padding(DS.Space.screenX)
            .background(DS.Color.bgCanvas)
            .navigationTitle("Своя рекомендация")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } } }
        }
    }
}
