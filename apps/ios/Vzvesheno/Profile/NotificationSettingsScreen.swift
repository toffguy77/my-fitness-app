import API
import Client
import DesignSystem
import SwiftUI
import UIKit

/// «Уведомления»: матрица доставки по типам с колонкой «Пуш» (iPhone),
/// тихое время, текст сообщений на экране блокировки, категории статей.
/// Без системного разрешения колонка «Пуш» недоступна, рядом — «Разрешить»
/// или «Открыть настройки», если в разрешении уже отказали.
struct NotificationSettingsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var prefs: DeliveryPreferences?
    @State private var muted: Set<String> = []
    @State private var quiet = false
    @State private var result: String?
    @State private var error: String?

    var body: some View {
        let column = PushColumn(model.notificationPermission)
        SettingsForm(result: result, error: error) {
            if let button = column.buttonTitle {
                PermissionBanner(column: column, title: button) {
                    if column == .askPermission {
                        Task { await model.requestNotificationPermission() }
                    } else if let url = URL(string: UIApplication.openSettingsURLString) {
                        openURL(url)
                    }
                }
            }
            if let prefs {
                matrix(prefs, pushEnabled: column.isEnabled)
                quietHours
                Toggle("Показывать текст сообщений", isOn: binding(\.showMessageText))
                    .tint(DS.Color.primaryDefault)
                    .accessibilityIdentifier("notifications.showText")
                Toggle("Получать письма", isOn: Binding(get: { !(self.prefs?.emailUnsubscribed ?? false) },
                                                         set: { self.prefs?.emailUnsubscribed = !$0 }))
                    .tint(DS.Color.primaryDefault)
                    .accessibilityIdentifier("notifications.email")
                contentCategories
                Button("Сохранить") { Task { await save() } }
                    .buttonStyle(DSButtonStyle(.primary))
                    .accessibilityIdentifier("notifications.save")
            } else {
                DSSpinner("Загружаем настройки")
            }
        }
        .dsText(DS.Typography.body)
        .task { await load() }
    }

    private func matrix(_ prefs: DeliveryPreferences, pushEnabled: Bool) -> some View {
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            HStack {
                Text("Событие").frame(maxWidth: .infinity, alignment: .leading)
                Text("Пуш").frame(width: 64)
                Text("Почта").frame(width: 64)
            }
            .dsText(DS.Typography.overline)
            .foregroundStyle(DS.Color.fgMuted)
            .accessibilityHidden(true)
            ForEach(Array(prefs.clientTypes.enumerated()), id: \.element.type) { _, item in
                HStack {
                    Text(DeliveryPreferences.title(item.type))
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.fgDefault)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Toggle("Пуш: \(DeliveryPreferences.title(item.type))", isOn: typeBinding(item.type, \.push))
                        .labelsHidden()
                        .tint(DS.Color.primaryDefault)
                        .disabled(!pushEnabled)
                        .frame(width: 64)
                        .accessibilityIdentifier("notifications.push.\(item.type)")
                    if item.email != nil {
                        Toggle("Почта: \(DeliveryPreferences.title(item.type))",
                               isOn: Binding(get: { typeValue(item.type)?.email ?? false },
                                             set: { value in update(item.type) { $0.email = value } }))
                            .labelsHidden()
                            .tint(DS.Color.primaryDefault)
                            .frame(width: 64)
                            .accessibilityIdentifier("notifications.email.\(item.type)")
                    } else {
                        Color.clear.frame(width: 64, height: 1)
                    }
                }
            }
        }
    }

    private var quietHours: some View {
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            Toggle("Тихое время", isOn: $quiet)
                .tint(DS.Color.primaryDefault)
                .accessibilityIdentifier("notifications.quiet")
            if quiet {
                HStack {
                    Picker("С", selection: Binding(get: { prefs?.quietHoursStart ?? 22 }, set: { prefs?.quietHoursStart = $0 })) {
                        ForEach(0..<24, id: \.self) { Text(String(format: "с %02d:00", $0)).tag($0) }
                    }
                    Picker("До", selection: Binding(get: { prefs?.quietHoursEnd ?? 7 }, set: { prefs?.quietHoursEnd = $0 })) {
                        ForEach(0..<24, id: \.self) { Text(String(format: "до %02d:00", $0)).tag($0) }
                    }
                }
                .tint(DS.Color.primaryDefault)
                Text("В тихое время пуши на iPhone приходят без звука и не включают экран.")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
            }
        }
    }

    private var contentCategories: some View {
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            Text("Статьи по темам").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
            ForEach(ArticleCategory.allCases) { category in
                Toggle(category.title, isOn: Binding(get: { !muted.contains(category.rawValue) },
                                                     set: { on in if on { muted.remove(category.rawValue) } else {
                                                         muted.insert(category.rawValue)
                                                     } }))
                    .tint(DS.Color.primaryDefault)
            }
        }
    }

    private func binding(_ key: WritableKeyPath<DeliveryPreferences, Bool>) -> Binding<Bool> {
        Binding(get: { prefs?[keyPath: key] ?? false }, set: { prefs?[keyPath: key] = $0 })
    }

    private func typeValue(_ type: String) -> DeliveryPreferences.TypeChannels? {
        prefs?.types.first { $0.type == type }
    }

    private func typeBinding(_ type: String, _ key: WritableKeyPath<DeliveryPreferences.TypeChannels, Bool>) -> Binding<Bool> {
        Binding(get: { typeValue(type)?[keyPath: key] ?? false }, set: { value in update(type) { $0[keyPath: key] = value } })
    }

    private func update(_ type: String, _ change: (inout DeliveryPreferences.TypeChannels) -> Void) {
        guard let index = prefs?.types.firstIndex(where: { $0.type == type }) else { return }
        change(&prefs!.types[index])
    }

    struct ContentPreferences: Codable, Sendable {
        var mutedCategories: [String]
        var muted: Bool
    }

    private func load() async {
        await model.refreshPushState()
        do {
            let loaded: DeliveryPreferences = try await model.api.send(.get("/api/v1/notifications/delivery-preferences"))
            prefs = loaded
            quiet = loaded.quietHoursStart != nil
            if let content: ContentPreferences = try? await model.api.send(.get("/api/v1/notifications/preferences")) {
                muted = Set(content.mutedCategories)
            }
        } catch {
            self.error = model.messages.message(for: error)
        }
    }

    private func save() async {
        guard var prefs else { return }
        if !quiet {
            prefs.quietHoursStart = nil
            prefs.quietHoursEnd = nil
        } else {
            prefs.quietHoursStart = prefs.quietHoursStart ?? 22
            prefs.quietHoursEnd = prefs.quietHoursEnd ?? 7
        }
        do {
            _ = try await model.api.send(try .put("/api/v1/notifications/delivery-preferences", body: prefs), as: EmptyResponse.self)
            _ = try await model.api.send(try .put("/api/v1/notifications/preferences",
                                                  body: ContentPreferences(mutedCategories: muted.sorted(), muted: false)),
                                         as: EmptyResponse.self)
            result = "Сохранено"
            error = nil
        } catch {
            result = nil
            self.error = model.messages.message(for: error)
        }
    }
}

private struct PermissionBanner: View {
    let column: PushColumn
    let title: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            Text(column == .openSettings
                 ? "Уведомления для «Взвешено» выключены в настройках iPhone — пуши не приходят."
                 : "Разрешите уведомления, чтобы пуши приходили на iPhone.")
                .dsText(DS.Typography.callout)
                .foregroundStyle(DS.Color.statusWarningFg)
                .fixedSize(horizontal: false, vertical: true)
            Button(title, action: action)
                .buttonStyle(DSButtonStyle(.secondary, size: .small))
                .accessibilityIdentifier("notifications.permission")
        }
        .padding(DS.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: DS.Radius.m).fill(DS.Color.statusWarningSoft))
    }
}
