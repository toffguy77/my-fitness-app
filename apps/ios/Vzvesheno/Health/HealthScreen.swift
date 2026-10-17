import DesignSystem
import SwiftUI

/// «Профиль → Здоровье» (`healthkit-client`).
///
/// Не подключено — экран «Подключение Здоровья»: что читаем и что пишем, до
/// системного запроса. Запрос — только по «Продолжить»; «Не сейчас» закрывает
/// экран без запроса, и вернуться сюда можно в любой момент.
/// Подключено — состояние и «Отключить».
struct HealthScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var working = false
    @State private var failed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                if !model.healthAvailable {
                    Text("health.unavailable")
                        .dsText(DS.Typography.body)
                        .foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                } else if model.healthConnected {
                    connected
                } else {
                    explainer
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s4)
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle(Text(LocalizedStringKey(model.healthConnected ? "health.title" : "health.connect.title")))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen.health")
    }

    // MARK: Подключение

    private var explainer: some View {
        HealthExplainer(failed: failed, working: working,
                        continueTitle: "health.connect.continue", notNowTitle: "health.connect.notNow",
                        onContinue: { Task { await connect() } },
                        // Без запроса: системное окно появится только по «Продолжить».
                        onNotNow: { dismiss() })
    }

    private func connect() async {
        working = true
        failed = false
        let connected = await model.connectHealth()
        failed = !connected
        working = false
    }

    // MARK: Подключено

    private var connected: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            DSCard {
                VStack(alignment: .leading, spacing: DS.Space.s2) {
                    HStack(spacing: DS.Space.s2) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(DS.Color.statusSuccessFg)
                            .accessibilityHidden(true)
                        Text("health.connected.title")
                            .dsText(DS.Typography.headline)
                            .foregroundStyle(DS.Color.fgDefault)
                            .accessibilityIdentifier("health.connected")
                    }
                    Text("health.connected.body")
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Button {
                Task {
                    working = true
                    await model.disconnectHealth()
                    working = false
                }
            } label: {
                Text("health.disconnect").frame(maxWidth: .infinity)
            }
            .buttonStyle(DSButtonStyle(.secondary))
            .disabled(working)
            .accessibilityIdentifier("health.disconnect")
            Text("health.disconnect.note")
                .dsText(DS.Typography.caption)
                .foregroundStyle(DS.Color.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Подсказка на «Сегодня»: подключено, а ни шагов, ни веса трое суток.
struct HealthAccessHintCard: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        DSCard {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                HStack(alignment: .top, spacing: DS.Space.s2) {
                    Image(systemName: "heart.text.square")
                        .foregroundStyle(DS.Color.statusWarningFg)
                        .accessibilityHidden(true)
                    Text("health.hint.noData")
                        .dsText(DS.Typography.body)
                        .foregroundStyle(DS.Color.fgDefault)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button {
                    openHealthSettings()
                } label: {
                    Text("health.hint.openSettings")
                }
                .buttonStyle(DSButtonStyle(.secondary, size: .small))
                .accessibilityIdentifier("health.hint.openSettings")
            }
        }
        .accessibilityIdentifier("health.hint")
    }

    /// Доступ к данным Здоровья меняется не в настройках приложения, а в
    /// «Здоровье»: Профиль → Приложения → Взвешено. На iPhone «Здоровье»
    /// не удаляется, поэтому ссылка открывается всегда.
    private func openHealthSettings() {
        guard let health = URL(string: "x-apple-health://") else { return }
        openURL(health)
    }
}

/// «Подключение Здоровья» (макет HealthConnect.png): что читаем и что
/// пишем — до системного запроса. Тот же вид — третий шаг онбординга.
/// Выбор отдельных данных — в системном окне Здоровья, поэтому строки
/// здесь — перечень, а не переключатели.
struct HealthExplainer: View {
    let failed: Bool
    let working: Bool
    let continueTitle: LocalizedStringKey
    let notNowTitle: LocalizedStringKey
    let onContinue: () -> Void
    let onNotNow: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            Image(systemName: "heart")
                .font(.system(size: 28, weight: .medium))
                .foregroundStyle(DS.Color.primaryDefault)
                .frame(width: 64, height: 64)
                .background(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous).fill(DS.Color.bgSurface))
                .overlay(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous).strokeBorder(DS.Color.lineDefault))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                Text("health.connect.headline")
                    .dsText(DS.Typography.title1)
                    .foregroundStyle(DS.Color.fgDefault)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("health.connect.title")
                Text("health.connect.intro")
                    .dsText(DS.Typography.body)
                    .foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            section("health.connect.reads.title", rows: [
                ("health.connect.read.steps", "health.connect.read.steps.detail"),
                ("health.connect.read.weight", "health.connect.read.weight.detail"),
                ("health.connect.read.workouts", "health.connect.read.workouts.detail"),
            ])
            section("health.connect.writes.title", rows: [
                ("health.connect.write.food", nil),
                ("health.connect.write.water", nil),
            ])
            Text("health.connect.manualWins")
                .dsText(DS.Typography.caption)
                .foregroundStyle(DS.Color.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
            if failed {
                Text("health.connect.failed")
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.statusDangerFg)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("health.connect.failed")
            }
            VStack(spacing: DS.Space.s2) {
                Button(action: onContinue) {
                    Text(continueTitle).frame(maxWidth: .infinity)
                }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(working)
                .accessibilityIdentifier("health.continue")
                Button(action: onNotNow) {
                    Text(notNowTitle)
                        .dsText(DS.Typography.headline)
                        .foregroundStyle(DS.Color.primaryDefault)
                        .frame(maxWidth: .infinity, minHeight: DS.Size.touch)
                }
                .disabled(working)
                .accessibilityIdentifier("health.notNow")
            }
            .padding(.top, DS.Space.s2)
        }
    }

    private func section(_ title: LocalizedStringKey, rows: [(LocalizedStringKey, LocalizedStringKey?)]) -> some View {
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            Text(title)
                .dsText(DS.Typography.overline)
                .foregroundStyle(DS.Color.fgMuted)
                .padding(.leading, DS.Space.s4)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    if index > 0 { Divider().overlay(DS.Color.lineDefault) }
                    HStack(spacing: DS.Space.s3) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.0)
                                .dsText(DS.Typography.body)
                                .foregroundStyle(DS.Color.fgDefault)
                                .fixedSize(horizontal: false, vertical: true)
                            if let detail = row.1 {
                                Text(detail)
                                    .dsText(DS.Typography.caption)
                                    .foregroundStyle(DS.Color.fgMuted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Spacer(minLength: DS.Space.s2)
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(DS.Color.statusSuccess)
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, DS.Space.s4)
                    .padding(.vertical, DS.Space.s3)
                    .frame(minHeight: 56)
                    .accessibilityElement(children: .combine)
                }
            }
            .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
            .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
        }
    }
}
