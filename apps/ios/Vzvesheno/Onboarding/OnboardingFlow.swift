import Client
import DesignSystem
import SwiftUI

/// Онбординг клиента (`ios-onboarding`): «Настройки», «Тело и цели» и
/// необязательное «Подключить Здоровье». Всё можно пропустить; текущий вес —
/// замер за сегодня, а не цель.
struct OnboardingFlow: View {
    @Environment(AppModel.self) private var model
    @State private var step = OnboardingStep.settings
    @State private var draft = OnboardingDraft()
    @State private var working = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .settings:
                    OnboardingSettingsStep(draft: $draft,
                                           onNext: { draft.settingsSkipped = false; step = .body },
                                           onSkip: { draft.settingsSkipped = true; step = .body })
                case .body:
                    OnboardingBodyStep(draft: $draft,
                                       onNext: { step = .health },
                                       onSkip: { draft.skipBody(); step = .health })
                case .health:
                    ScrollView {
                        VStack(alignment: .leading, spacing: DS.Space.s4) {
                            HealthExplainer(failed: false, working: working,
                                            continueTitle: "onboarding.health.connect", notNowTitle: "onboarding.health.later",
                                            onContinue: { Task { await finish(connectHealth: true) } },
                                            onNotNow: { Task { await finish(connectHealth: false) } })
                            ErrorText(text: errorText)
                        }
                        .padding(.horizontal, DS.Space.screenX)
                        .padding(.vertical, DS.Space.s4)
                    }
                    .background(DS.Color.bgCanvas)
                    .accessibilityIdentifier("screen.onboarding.health")
                }
            }
            .navigationTitle(step.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Шаг \(step.rawValue + 1) из \(OnboardingStep.allCases.count)")
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgMuted)
                }
            }
        }
    }

    private func finish(connectHealth: Bool) async {
        working = true
        errorText = nil
        defer { working = false }
        if connectHealth {
            _ = await model.connectHealth()
        }
        do {
            try await model.completeOnboarding(draft)
        } catch {
            errorText = model.messages.message(for: error)
        }
    }
}

/// Шаг «Настройки»: язык, единицы, часовой пояс — с устройства.
struct OnboardingSettingsStep: View {
    @Binding var draft: OnboardingDraft
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepScaffold(title: "Настройки", subtitle: "Мы взяли их из настроек iPhone. Поменять можно и позже, в профиле.",
                     identifier: "screen.onboarding.settings") {
            DSCard {
                VStack(alignment: .leading, spacing: DS.Space.s3) {
                    Picker("Язык", selection: $draft.language) {
                        Text("Русский").tag("ru")
                        Text("English").tag("en")
                    }
                    Divider().overlay(DS.Color.lineDefault)
                    Picker("Единицы", selection: $draft.units) {
                        Text("Килограммы и сантиметры").tag("metric")
                        Text("Фунты и дюймы").tag("imperial")
                    }
                    Divider().overlay(DS.Color.lineDefault)
                    LabeledContent("Часовой пояс", value: draft.timezone)
                }
                .dsText(DS.Typography.body)
                .tint(DS.Color.primaryDefault)
            }
            OnboardingButtons(onNext: onNext, onSkip: onSkip)
        }
    }
}

/// Шаг «Тело и цели»: всё необязательно.
struct OnboardingBodyStep: View {
    @Binding var draft: OnboardingDraft
    let onNext: () -> Void
    let onSkip: () -> Void
    @State private var weightText = ""
    @State private var heightText = ""
    @State private var hasBirthDate = false
    @State private var birthDate = Calendar(identifier: .gregorian).date(byAdding: .year, value: -30, to: Date()) ?? Date()

    var body: some View {
        StepScaffold(title: "Тело и цели",
                     subtitle: "По ним сервер посчитает норму калорий и БЖУ. Любое поле можно оставить пустым.",
                     identifier: "screen.onboarding.body") {
            DSCard {
                VStack(alignment: .leading, spacing: DS.Space.s3) {
                    Toggle("Дата рождения", isOn: $hasBirthDate)
                    if hasBirthDate {
                        DatePicker("Дата рождения", selection: $birthDate, in: ...Date(), displayedComponents: .date)
                            .labelsHidden()
                    }
                    Divider().overlay(DS.Color.lineDefault)
                    Picker("Пол", selection: $draft.sex) {
                        Text("Не указан").tag(BiologicalSex?.none)
                        ForEach(BiologicalSex.allCases, id: \.self) { Text($0.title).tag(Optional($0)) }
                    }
                    Divider().overlay(DS.Color.lineDefault)
                    DSField(title: "Текущий вес, кг", text: $weightText, placeholder: "например, 78,4", keyboard: .decimalPad)
                        .accessibilityIdentifier("onboarding.weight")
                    DSField(title: "Рост, см", text: $heightText, placeholder: "например, 170", keyboard: .numberPad)
                    Picker("Активность", selection: $draft.activity) {
                        Text("Не указана").tag(ActivityLevel?.none)
                        ForEach(ActivityLevel.allCases, id: \.self) { Text($0.title).tag(Optional($0)) }
                    }
                    Divider().overlay(DS.Color.lineDefault)
                    Picker("Цель", selection: $draft.goal) {
                        Text("Не указана").tag(FitnessGoal?.none)
                        ForEach(FitnessGoal.allCases, id: \.self) { Text($0.title).tag(Optional($0)) }
                    }
                }
                .dsText(DS.Typography.body)
                .tint(DS.Color.primaryDefault)
            }
            if !weightText.isEmpty && ManualInput.weight(weightText) == nil {
                ErrorText(text: "Вес — от 0,1 до 500 кг, один знак после запятой.")
            }
            if !heightText.isEmpty && BodyInput.height(heightText) == nil {
                ErrorText(text: "Рост — от 50 до 300 см.")
            }
            OnboardingButtons(onNext: {
                draft.currentWeight = ManualInput.weight(weightText)
                draft.height = BodyInput.height(heightText)
                draft.birthDate = hasBirthDate ? DayCalendar().key(birthDate) : nil
                onNext()
            }, onSkip: onSkip, nextDisabled: (!weightText.isEmpty && ManualInput.weight(weightText) == nil)
                || (!heightText.isEmpty && BodyInput.height(heightText) == nil))
        }
    }
}

private struct OnboardingButtons: View {
    let onNext: () -> Void
    let onSkip: () -> Void
    var nextDisabled = false

    var body: some View {
        VStack(spacing: DS.Space.s2) {
            Button("Далее", action: onNext)
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(nextDisabled)
                .accessibilityIdentifier("onboarding.next")
            Button("Пропустить", action: onSkip)
                .buttonStyle(DSButtonStyle(.ghost))
                .accessibilityIdentifier("onboarding.skip")
        }
        .padding(.top, DS.Space.s2)
    }
}
