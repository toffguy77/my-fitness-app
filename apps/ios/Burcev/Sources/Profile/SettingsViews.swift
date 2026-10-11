import SwiftUI

// MARK: - Аккаунт: имя и пароль

struct AccountView: View {
    @Environment(SessionStore.self) private var session
    let profile: ProfileResponse.Profile?
    let onChange: () -> Void

    @State private var name = ""
    @State private var current = ""
    @State private var newPassword = ""
    @State private var message: String?
    @State private var errorText: String?
    @State private var hasPassword: Bool?

    var body: some View {
        Form {
            Section("Имя") {
                TextField("Как к вам обращаться", text: $name)
                Button("Сохранить имя") { Task { await saveName() } }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || name == profile?.name)
            }
            Section {
                LabeledContent("Почта", value: profile?.email ?? session.user?.email ?? "—")
            }
            if hasPassword == true {
                Section {
                    SecureField("Текущий пароль", text: $current).textContentType(.password)
                    SecureField("Новый пароль", text: $newPassword).textContentType(.newPassword)
                    Button("Сменить пароль") { Task { await changePassword() } }
                        .disabled(current.isEmpty || newPassword.count < 8)
                } header: {
                    Text("Пароль")
                } footer: {
                    Text("Не короче 8 символов, с заглавной и строчной буквой, цифрой и знаком. Остальные устройства выйдут из аккаунта.")
                }
            } else if hasPassword == false {
                Section("Пароль") {
                    Text("Вы входите по ссылке из письма — пароля у аккаунта нет. Задать его можно через «Забыли пароль?» на экране входа.")
                        .foregroundStyle(.secondary)
                }
            }
            if let message { Section { Text(message).foregroundStyle(.green) } }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
        }
        .navigationTitle("Аккаунт")
        .onAppear { name = profile?.name ?? "" }
        .task {
            hasPassword = try? await session.api.send(Endpoint<MeResponse>.get("/api/v1/auth/me")).user.has_password
        }
    }

    private func saveName() async {
        do {
            _ = try await session.api.send(Endpoint<ProfileResponse>.put("/api/v1/users/profile",
                                                                         body: NameRequest(name: name.trimmingCharacters(in: .whitespaces))))
            message = "Имя сохранено."
            errorText = nil
            onChange()
        } catch {
            errorText = error.userMessage
        }
    }

    private func changePassword() async {
        do {
            try await session.changePassword(current: current, new: newPassword)
            message = "Пароль изменён."
            errorText = nil
            current = ""
            newPassword = ""
        } catch APIError.server(status: 401, _, _) {
            errorText = "Текущий пароль неверный."
        } catch {
            errorText = error.userMessage
        }
    }
}

// MARK: - Тело и цели

struct BodySettingsView: View {
    @Environment(SessionStore.self) private var session

    @State private var loaded = false
    @State private var sex = ""
    @State private var birth = Calendar.current.date(byAdding: .year, value: -30, to: Date())!
    @State private var hasBirth = false
    @State private var height: Double?
    @State private var activity = ""
    @State private var goal = ""
    @State private var targetWeight: Double?
    @State private var saving = false
    @State private var message: String?
    @State private var errorText: String?

    var body: some View {
        Form {
            Section {
                Picker("Пол", selection: $sex) {
                    Text("Не указан").tag("")
                    Text("Женский").tag("female")
                    Text("Мужской").tag("male")
                }
                Toggle("Указать дату рождения", isOn: $hasBirth)
                if hasBirth {
                    DatePicker("Дата рождения", selection: $birth, in: ...Date(), displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "ru_RU"))
                }
                HStack {
                    Text("Рост")
                    TextField("см", value: $height, format: .number).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    Text("см").foregroundStyle(.secondary)
                }
            } header: {
                Text("О себе")
            } footer: {
                Text("Пол, возраст и рост нужны для расчёта нормы КБЖУ.")
            }
            Section("Образ жизни и цель") {
                Picker("Активность", selection: $activity) {
                    Text("Не указана").tag("")
                    Text("Сидячая").tag("sedentary")
                    Text("Лёгкая").tag("light")
                    Text("Умеренная").tag("moderate")
                    Text("Высокая").tag("active")
                }
                Picker("Цель", selection: $goal) {
                    Text("Не указана").tag("")
                    Text("Снизить вес").tag("loss")
                    Text("Сохранить вес").tag("maintain")
                    Text("Набрать массу").tag("gain")
                }
                HStack {
                    Text("Желаемый вес")
                    TextField("кг", value: $targetWeight, format: .number.precision(.fractionLength(0...1)))
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    Text("кг").foregroundStyle(.secondary)
                }
            }
            if let message { Section { Text(message).foregroundStyle(.green) } }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack { Spacer(); if saving { ProgressView() } else { Text("Сохранить и пересчитать норму").fontWeight(.semibold) }; Spacer() }
                }
                .disabled(saving || !loaded)
            }
        }
        .navigationTitle("Тело и цели")
        .task { await load() }
    }

    private func load() async {
        guard let settings = try? await session.api.send(Endpoint<ProfileResponse>.get("/api/v1/users/profile")).profile.settings else {
            loaded = true
            return
        }
        sex = settings.biological_sex ?? ""
        if let raw = settings.birth_date, let date = APIDates.parseDay(raw) {
            birth = date
            hasBirth = true
        }
        height = settings.height
        activity = settings.activity_level ?? ""
        goal = settings.fitness_goal ?? ""
        targetWeight = settings.target_weight
        loaded = true
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let request = BodySettingsRequest(
            height: height,
            birth_date: hasBirth ? APIDates.day(birth) : nil,
            biological_sex: sex.isEmpty ? nil : sex,
            activity_level: activity.isEmpty ? nil : activity,
            fitness_goal: goal.isEmpty ? nil : goal,
            target_weight: targetWeight)
        do {
            _ = try await session.api.send(Endpoint<Empty>.put("/api/v1/users/settings", body: request))
            // Как на сайте: после сохранения тела — пересчёт нормы на сегодня.
            let targets = try? await session.api.send(Endpoint<DailyTargets>.post("/api/v1/nutrition-calc/recalculate", body: [String: String]()))
            if let macros = targets?.macros {
                message = "Сохранено. Норма: \(macros.calories.formatted(.number.precision(.fractionLength(0)))) ккал в день."
            } else {
                message = targets?.message ?? "Сохранено."
            }
            errorText = nil
        } catch {
            errorText = error.userMessage
        }
    }
}

// MARK: - Ограничения в питании

struct RestrictionsView: View {
    @Environment(SessionStore.self) private var session

    @State private var allergens: Set<String> = []
    @State private var excluded: [FoodRestrictions.Excluded] = []
    @State private var rejected: [FoodRestrictions.Named] = []
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        Form {
            Section {
                ForEach(Allergen.allCases) { allergen in
                    Toggle(allergen.title, isOn: Binding(
                        get: { allergens.contains(allergen.rawValue) },
                        set: { if $0 { allergens.insert(allergen.rawValue) } else { allergens.remove(allergen.rawValue) } }))
                }
            } header: {
                Text("Аллергены")
            } footer: {
                Text("Блюда с ними не попадут в меню.")
            }
            if !excluded.isEmpty {
                Section("Не люблю") {
                    ForEach(excluded) { food in Text(food.name) }
                        .onDelete { excluded.remove(atOffsets: $0) }
                }
            }
            if !rejected.isEmpty {
                Section("Скрытые рецепты") {
                    ForEach(rejected) { recipe in
                        HStack {
                            Text(recipe.name)
                            Spacer()
                            Button("Вернуть") { Task { await unreject(recipe) } }.buttonStyle(.borderless)
                        }
                    }
                }
            }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack { Spacer(); if saving { ProgressView() } else { Text("Сохранить").fontWeight(.semibold) }; Spacer() }
                }
            }
        }
        .navigationTitle("Ограничения")
        .task { await load() }
    }

    private func load() async {
        guard let r = try? await session.api.send(Endpoint<FoodRestrictions>.get("/api/v1/food-restrictions")) else { return }
        allergens = Set(r.allergens)
        excluded = r.excluded_foods ?? []
        rejected = r.rejected_recipes ?? []
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            _ = try await session.api.send(Endpoint<FoodRestrictions>.put(
                "/api/v1/food-restrictions",
                body: RestrictionsRequest(allergens: allergens.sorted(), excluded_food_ids: excluded.map(\.food_id))))
            errorText = nil
            await load()
        } catch {
            errorText = error.userMessage
        }
    }

    private func unreject(_ recipe: FoodRestrictions.Named) async {
        _ = try? await session.api.send(Endpoint<Empty>.delete("/api/v1/recipes/\(recipe.id)/reject"))
        await load()
    }
}

// MARK: - Доставка уведомлений

struct NotificationSettingsView: View {
    @Environment(SessionStore.self) private var session

    @State private var prefs: DeliveryPreferences?
    @State private var errorText: String?

    var body: some View {
        Form {
            if let prefs {
                Section {
                    Toggle("Письма на почту", isOn: Binding(
                        get: { prefs.emailUnsubscribed != true },
                        set: { on in update { $0.emailUnsubscribed = !on } }))
                }
                Section {
                    Toggle("Тихие часы", isOn: Binding(
                        get: { prefs.quietHoursStart != nil },
                        set: { on in update { $0.quietHoursStart = on ? 22 : nil; $0.quietHoursEnd = on ? 8 : nil } }))
                    if let start = prefs.quietHoursStart, let end = prefs.quietHoursEnd {
                        Picker("С", selection: Binding(get: { start }, set: { v in update { $0.quietHoursStart = v } })) {
                            ForEach(0..<24, id: \.self) { Text(String(format: "%02d:00", $0)).tag($0) }
                        }
                        Picker("До", selection: Binding(get: { end }, set: { v in update { $0.quietHoursEnd = v } })) {
                            ForEach(0..<24, id: \.self) { Text(String(format: "%02d:00", $0)).tag($0) }
                        }
                    }
                } footer: {
                    Text("В тихие часы push-уведомления ждут утра. Часовой пояс: \(prefs.timezone ?? "Europe/Moscow").")
                }
                Section("Что присылать") {
                    ForEach(prefs.types.indices, id: \.self) { i in
                        VStack(alignment: .leading) {
                            Text(prefs.types[i].title)
                            HStack {
                                Toggle("Почта", isOn: Binding(get: { prefs.types[i].email }, set: { v in update { $0.types[i].email = v } }))
                                Toggle("Push", isOn: Binding(get: { prefs.types[i].push }, set: { v in update { $0.types[i].push = v } }))
                            }
                            .toggleStyle(.button)
                            .font(.footnote)
                        }
                    }
                }
            } else {
                ProgressView()
            }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
        }
        .navigationTitle("Уведомления")
        .task {
            prefs = try? await session.api.send(Endpoint<DeliveryPreferences>.get("/api/v1/notifications/delivery-preferences"))
        }
    }

    /// Как на сайте: каждое переключение сохраняет весь набор.
    private func update(_ change: (inout DeliveryPreferences) -> Void) {
        guard var next = prefs else { return }
        change(&next)
        prefs = next
        Task {
            do {
                _ = try await session.api.send(Endpoint<Empty>.put("/api/v1/notifications/delivery-preferences", body: next))
                errorText = nil
            } catch {
                errorText = error.userMessage
            }
        }
    }
}

// MARK: - Telegram

struct TelegramView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openURL) private var openURL

    @State private var status: TelegramStatus?
    @State private var errorText: String?

    var body: some View {
        Form {
            Section {
                if let status {
                    if status.linked {
                        LabeledContent("Привязан", value: status.username.map { "@\($0)" } ?? "да")
                        Button("Отвязать", role: .destructive) { Task { await unlink() } }
                    } else {
                        Button("Привязать Telegram") { Task { await link() } }
                    }
                } else {
                    ProgressView()
                }
            } footer: {
                Text("Бот BURCEV будет присылать уведомления и ответы поддержки в Telegram.")
            }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
        }
        .navigationTitle("Telegram")
        .task { await load() }
    }

    private func load() async {
        status = try? await session.api.send(Endpoint<TelegramStatus>.get("/api/v1/users/me/telegram"))
    }

    private func link() async {
        do {
            let link = try await session.api.send(Endpoint<TelegramLink>.post("/api/v1/users/me/telegram", body: [String: String]()))
            if let url = URL(string: link.url) { openURL(url) }
            // Привязка завершается в Telegram — проверяем, пока человек вернётся.
            for _ in 0..<30 {
                try? await Task.sleep(for: .seconds(3))
                await load()
                if status?.linked == true { break }
            }
        } catch {
            errorText = error.userMessage
        }
    }

    private func unlink() async {
        _ = try? await session.api.send(Endpoint<TelegramStatus>.delete("/api/v1/users/me/telegram"))
        await load()
    }
}

// MARK: - Выгрузка данных

struct ExportView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openURL) private var openURL

    @State private var exports: [DataExport] = []
    @State private var errorText: String?

    var body: some View {
        Form {
            Section {
                Button("Запросить выгрузку") { Task { await request() } }
            } footer: {
                Text("Архив со всеми вашими данными: профиль, дневник, переписка, фото. Готовится в течение нескольких минут, придёт уведомление. Выгрузку можно запрашивать раз в сутки.")
            }
            if !exports.isEmpty {
                Section("Выгрузки") {
                    ForEach(exports) { export in
                        HStack {
                            Text(APIDates.timestamp(export.requested_at)?.formatted(date: .abbreviated, time: .shortened) ?? export.requested_at)
                            Spacer()
                            Text(statusTitle(export.status)).foregroundStyle(.secondary)
                        }
                    }
                    Button("Скачать на сайте") {
                        openURL(AppConfig.apiBaseURL.appendingPathComponent("settings/privacy"))
                    }
                }
            }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
        }
        .navigationTitle("Выгрузка данных")
        .task { await load() }
    }

    private func statusTitle(_ status: String) -> String {
        switch status {
        case "pending", "building": return "Готовится"
        case "ready": return "Готова"
        case "failed": return "Ошибка"
        default: return status
        }
    }

    private func load() async {
        exports = (try? await session.api.send(Endpoint<ExportsList>.get("/api/v1/users/me/export")))?.exports ?? []
    }

    private func request() async {
        do {
            _ = try await session.api.send(Endpoint<DataExport>.post("/api/v1/users/me/export", body: [String: String]()))
            errorText = nil
            await load()
        } catch APIError.server(status: 409, _, _) {
            errorText = "Выгрузка уже готовится."
        } catch APIError.server(status: 429, _, _) {
            errorText = "Выгрузку можно запрашивать раз в сутки."
        } catch {
            errorText = error.userMessage
        }
    }
}
