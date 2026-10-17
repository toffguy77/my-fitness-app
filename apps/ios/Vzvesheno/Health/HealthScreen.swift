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
        .navigationTitle(Text("health.title"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen.health")
    }

    // MARK: Подключение

    private var explainer: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            Text("health.connect.title")
                .dsText(DS.Typography.title2)
                .foregroundStyle(DS.Color.fgDefault)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("health.connect.title")
            Text("health.connect.intro")
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
            DSCard {
                VStack(alignment: .leading, spacing: DS.Space.s3) {
                    item(icon: "arrow.down.circle", title: "health.connect.reads.title", detail: "health.connect.reads")
                    Divider().overlay(DS.Color.lineDefault)
                    item(icon: "arrow.up.circle", title: "health.connect.writes.title", detail: "health.connect.writes")
                }
            }
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
                Button {
                    Task { await connect() }
                } label: {
                    Text("health.connect.continue").frame(maxWidth: .infinity)
                }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(working)
                .accessibilityIdentifier("health.continue")
                Button {
                    // Без запроса: системное окно появится только по «Продолжить».
                    dismiss()
                } label: {
                    Text("health.connect.notNow").frame(maxWidth: .infinity)
                }
                .buttonStyle(DSButtonStyle(.ghost))
                .disabled(working)
                .accessibilityIdentifier("health.notNow")
            }
            .padding(.top, DS.Space.s2)
        }
    }

    private func item(icon: String, title: LocalizedStringKey, detail: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: DS.Space.s3) {
            Image(systemName: icon)
                .foregroundStyle(DS.Color.primaryDefault)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: DS.Space.s1) {
                Text(title)
                    .dsText(DS.Typography.headline)
                    .foregroundStyle(DS.Color.fgDefault)
                Text(detail)
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
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
