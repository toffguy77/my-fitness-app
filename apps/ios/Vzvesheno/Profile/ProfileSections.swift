import Client
import DesignSystem
import PhotosUI
import SwiftUI
import UIKit

/// Экран раздела по `Destination.settings(section:)`.
struct SettingsSectionView: View {
    let section: SettingsSection

    var body: some View {
        Group {
            switch section {
            case .nameAndPhoto: NameAndPhotoScreen()
            case .bodyGoals: BodyGoalsScreen()
            case .locale: LocaleScreen()
            case .notifications: NotificationSettingsScreen()
            case .telegram: TelegramScreen()
            case .password: PasswordScreen()
            case .signInMethods: SignInMethodsScreen()
            case .export: ExportScreen()
            case .deleteAccount: DeleteAccountScreen()
            }
        }
        .navigationTitle(section.title)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen.settings.\(section.rawValue)")
    }
}

/// Общая раскладка раздела: прокрутка, отступы, строка итога сохранения.
struct SettingsForm<Content: View>: View {
    var result: String?
    var error: String?
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                content
                if let result {
                    Label(result, systemImage: "checkmark.circle")
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.statusSuccessFg)
                        .accessibilityIdentifier("settings.result")
                }
                if let error {
                    Text(error)
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.statusDangerFg)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("settings.error")
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s4)
        }
        .background(DS.Color.bgCanvas)
        .scrollDismissesKeyboard(.interactively)
    }
}

// MARK: Имя и фото

struct NameAndPhotoScreen: View {
    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var avatarURL: URL?
    @State private var item: PhotosPickerItem?
    @State private var result: String?
    @State private var error: String?
    @State private var working = false

    var body: some View {
        SettingsForm(result: result, error: error) {
            HStack(spacing: DS.Space.s4) {
                CachedImage(url: avatarURL, scope: .account) {
                    Text(verbatim: model.avatarInitial)
                        .font(.custom(DS.FontFamily.serif, size: 28, relativeTo: .title).weight(.semibold))
                        .foregroundStyle(DS.Color.fgDefault)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(DS.Color.bgSubtle)
                }
                .frame(width: 80, height: 80)
                .clipShape(Circle())
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: DS.Space.s2) {
                    PhotosPicker("Сменить фото", selection: $item, matching: .images)
                        .accessibilityIdentifier("name.photo")
                    if avatarURL != nil {
                        Button("Удалить фото", role: .destructive) { Task { await deletePhoto() } }
                            .accessibilityIdentifier("name.deletePhoto")
                    }
                }
                .dsText(DS.Typography.callout)
            }
            DSField(title: "Имя", text: $name, placeholder: "Как к вам обращаться", contentType: .name)
                .accessibilityIdentifier("name.field")
            Button("Сохранить") { Task { await save() } }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(working)
                .accessibilityIdentifier("name.save")
        }
        .task {
            if let profile = try? await ProfileService(api: model.api).profile() {
                name = profile.name ?? ""
                avatarURL = profile.avatarURL.flatMap(TrustedMedia.url)
            }
        }
        .onChange(of: item) { _, item in
            guard let item else { return }
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                self.item = nil
                await upload(data.flatMap(UIImage.init(data:)))
            }
        }
    }

    private func save() async {
        working = true
        defer { working = false }
        do {
            try await ProfileService(api: model.api).saveName(name.trimmingCharacters(in: .whitespaces))
            await model.refreshProfile()
            result = "Сохранено"
            error = nil
        } catch {
            self.error = model.messages.message(for: error)
        }
    }

    /// Аватар до 5 МБ: снимок готовится как фото еды — JPEG 0,8, до 1280 px.
    private func upload(_ image: UIImage?) async {
        guard let image, let jpeg = PhotoPreparation.jpeg(from: image) else { return }
        do {
            avatarURL = try await ProfileService(api: model.api).uploadAvatar(jpeg: jpeg).flatMap(TrustedMedia.url)
            result = "Фото обновлено"
        } catch {
            self.error = model.messages.message(for: error)
        }
    }

    private func deletePhoto() async {
        do {
            try await ProfileService(api: model.api).deleteAvatar()
            avatarURL = nil
            result = "Фото удалено"
        } catch {
            self.error = model.messages.message(for: error)
        }
    }
}

// MARK: Тело и цели

/// Те же поля и границы, что в вебе; сохранение пересчитывает норму.
struct BodyGoalsScreen: View {
    @Environment(AppModel.self) private var model
    @State private var draft = BodyGoalsDraft(settings: UserProfile.Settings())
    @State private var birthDate = Date(timeIntervalSince1970: 631_152_000)
    @State private var hasBirthDate = false
    @State private var result: String?
    @State private var error: String?
    @State private var working = false

    var body: some View {
        SettingsForm(result: result, error: error ?? draft.problems.values.sorted().first) {
            Toggle("Дата рождения", isOn: $hasBirthDate)
                .tint(DS.Color.primaryDefault)
                .dsText(DS.Typography.body)
            if hasBirthDate {
                DatePicker("Дата рождения", selection: $birthDate, in: ...Date(), displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .environment(\.locale, Locale(identifier: "ru_RU"))
                    .accessibilityIdentifier("body.birthDate")
            }
            picker("Пол", selection: $draft.sex, options: BodyGoalsDraft.sexes, id: "body.sex")
            DSField(title: "Рост, см", text: $draft.height, placeholder: "от 50 до 300", keyboard: .decimalPad)
                .accessibilityIdentifier("body.height")
            DSField(title: "Целевой вес, кг", text: $draft.targetWeight, placeholder: "от 20 до 500", keyboard: .decimalPad)
                .accessibilityIdentifier("body.targetWeight")
            picker("Активность", selection: $draft.activity, options: BodyGoalsDraft.activities, id: "body.activity")
            picker("Цель", selection: $draft.goal, options: BodyGoalsDraft.goals, id: "body.goal")
            Button("Сохранить") { Task { await save() } }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(!draft.isValid || working)
                .accessibilityIdentifier("body.save")
        }
        .task {
            if let profile = try? await ProfileService(api: model.api).profile() {
                draft = BodyGoalsDraft(settings: profile.settings)
                if let raw = profile.settings.birthDate, let date = DayCalendar(timeZone: .gmt).date(raw) {
                    birthDate = date
                    hasBirthDate = true
                }
            }
        }
    }

    private func picker(_ title: String, selection: Binding<String?>, options: [(String, String)], id: String) -> some View {
        HStack {
            Text(title).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
            Spacer()
            Picker(title, selection: selection) {
                Text("Не указано").tag(String?.none)
                ForEach(options, id: \.0) { Text($0.1).tag(Optional($0.0)) }
            }
            .tint(DS.Color.primaryDefault)
            .accessibilityIdentifier(id)
        }
    }

    private func save() async {
        working = true
        defer { working = false }
        var draft = draft
        draft.birthDate = hasBirthDate ? DayCalendar(timeZone: .gmt).key(birthDate) : nil
        do {
            result = try await ProfileService(api: model.api).saveBodyGoals(draft)
            error = nil
            await model.today?.load()
        } catch {
            result = nil
            self.error = model.messages.message(for: error)
        }
    }
}

// MARK: Язык, единицы, часовой пояс

/// Сохраняются сразу, как в вебе. Пояс устройства — первым в списке.
struct LocaleScreen: View {
    @Environment(AppModel.self) private var model
    @State private var language = "ru"
    @State private var units = "metric"
    @State private var timezone = "Europe/Moscow"
    @State private var loaded = false
    @State private var result: String?
    @State private var error: String?

    static let zones = ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk",
                        "Asia/Novosibirsk", "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok",
                        "Asia/Magadan", "Asia/Kamchatka"]

    var body: some View {
        SettingsForm(result: result, error: error) {
            row("Язык") {
                Picker("Язык", selection: $language) {
                    Text("Русский").tag("ru")
                    Text("English").tag("en")
                }
                .accessibilityIdentifier("locale.language")
            }
            row("Единицы") {
                Picker("Единицы", selection: $units) {
                    Text("Метрические").tag("metric")
                    Text("Имперские").tag("imperial")
                }
                .accessibilityIdentifier("locale.units")
            }
            row("Часовой пояс") {
                Picker("Часовой пояс", selection: $timezone) {
                    ForEach(zoneList, id: \.self) { Text(TimeZoneSuggestion.title($0)).tag($0) }
                }
                .accessibilityIdentifier("locale.timezone")
            }
        }
        .tint(DS.Color.primaryDefault)
        .task {
            if let profile = try? await ProfileService(api: model.api).profile() {
                language = profile.settings.language
                units = profile.settings.units
                timezone = profile.settings.timezone
            }
            loaded = true
        }
        .onChange(of: language) { _, value in save("language", value) }
        .onChange(of: units) { _, value in save("units", value) }
        .onChange(of: timezone) { _, value in save("timezone", value) }
    }

    private var zoneList: [String] {
        var list = Self.zones
        for extra in [TimeZone.current.identifier, timezone] where !list.contains(extra) { list.insert(extra, at: 0) }
        return list
    }

    private func row<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(title).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
            Spacer()
            content()
        }
    }

    private func save(_ key: String, _ value: String) {
        guard loaded else { return }
        Task {
            do {
                try await ProfileService(api: model.api).saveSettings([key: .string(value)])
                await model.refreshProfile()
                result = "Сохранено"
                error = nil
            } catch {
                self.error = model.messages.message(for: error)
            }
        }
    }
}
