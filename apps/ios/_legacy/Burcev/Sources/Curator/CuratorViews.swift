import SwiftUI

struct ClientsView: View {
    @Environment(SessionStore.self) private var session
    @State private var content: Loadable<[ClientCard]> = .loading
    @State private var search = ""
    @State private var path: [Int64] = []
    @State private var analytics: CuratorAnalytics?
    @State private var attention: [AttentionItem] = []

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                switch content {
                case .loading:
                    ProgressView()
                case let .failed(message):
                    ErrorRetryView(message: message) { Task { await load() } }
                case let .loaded(clients) where clients.isEmpty:
                    ContentUnavailableView("Клиентов пока нет", systemImage: "person.2",
                                           description: Text("Клиенты появятся, когда их за вами закрепят."))
                case let .loaded(clients):
                    List {
                        if search.isEmpty {
                            CuratorHubSection(analytics: analytics, attention: attention) { path.append($0) }
                        }
                        Section("Все клиенты") {
                            ForEach(filtered(clients)) { client in
                                NavigationLink(value: client.id) {
                                    ClientRow(client: client)
                                }
                            }
                        }
                    }
                    .searchable(text: $search, prompt: "Имя или почта")
                }
            }
            .navigationTitle("Клиенты")
            .navigationDestination(for: Int64.self) { id in
                ClientDetailView(clientID: id)
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func filtered(_ clients: [ClientCard]) -> [ClientCard] {
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !query.isEmpty else { return clients }
        return clients.filter {
            $0.name.lowercased().contains(query) || ($0.email?.lowercased().contains(query) ?? false)
        }
    }

    private func load() async {
        do {
            async let hub = try? session.api.send(Endpoint<CuratorAnalytics>.get("/api/v1/curator/analytics"))
            async let attention = try? session.api.send(Endpoint<[AttentionItem]>.get("/api/v1/curator/attention"))
            let clients = try await session.api.send(Endpoint<[ClientCard]>.get("/api/v1/curator/clients"))
            self.analytics = await hub
            self.attention = await attention ?? []
            content = .loaded(clients)
            if Demo.screen == .client, path.isEmpty, let first = clients.first {
                path = [first.id]
            }
        } catch is CancellationError {
            return
        } catch {
            if content.value == nil { content = .failed(error.userMessage) }
        }
    }
}

private struct ClientRow: View {
    let client: ClientCard

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(client.name.isEmpty ? (client.email ?? "Без имени") : client.name)
                    .font(.headline)
                Spacer()
                if client.unread_count > 0 {
                    Label("\(client.unread_count)", systemImage: "bubble.left.fill")
                        .font(.caption)
                        .foregroundStyle(Color.accentColor)
                }
            }
            Text(kcalLine)
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(.secondary)
            ForEach(client.alerts, id: \.self) { alert in
                Label(alert.message, systemImage: "exclamationmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(color(alert.level))
            }
        }
        .padding(.vertical, 2)
    }

    private var kcalLine: String {
        let fact = client.today_kbzhu.calories.formatted(.number.precision(.fractionLength(0)))
        if let plan = client.plan, plan.calories > 0 {
            return "Сегодня \(fact) из \(plan.calories.formatted(.number.precision(.fractionLength(0)))) ккал"
        }
        return "Сегодня \(fact) ккал"
    }
}

func color(_ level: String) -> Color {
    switch level {
    case "red": return .red
    case "yellow": return .orange
    default: return .green
    }
}

struct ClientDetailView: View {
    @Environment(SessionStore.self) private var session
    let clientID: Int64

    enum Tab: String, CaseIterable, Identifiable {
        case overview = "Обзор", plan = "План", tasks = "Задачи", reports = "Отчёты"
        var id: String { rawValue }
    }

    @State private var tab: Tab = .overview
    @State private var content: Loadable<ClientDetail> = .loading
    @State private var editingWeight = false
    @State private var editingWater = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("Раздел", selection: $tab) { ForEach(Tab.allCases) { Text($0.rawValue).tag($0) } }
                .pickerStyle(.segmented)
                .padding([.horizontal, .top])
            switch tab {
            case .overview: overview
            case .plan: ClientPlanView(clientID: clientID)
            case .tasks: ClientTasksView(clientID: clientID)
            case .reports: ClientReportsView(clientID: clientID)
            }
        }
        .navigationTitle(content.value.map { $0.name.isEmpty ? "Клиент" : $0.name } ?? "Клиент")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private var overview: some View {
        switch content {
        case .loading:
            ProgressView().frame(maxHeight: .infinity)
        case let .failed(message):
            ErrorRetryView(message: message) { Task { await load() } }
        case let .loaded(detail):
            List {
                Section {
                    if let email = detail.email {
                        LabeledContent("Почта", value: email)
                    }
                    if let weight = detail.last_weight {
                        LabeledContent("Вес", value: "\(weight.formatted(.number.precision(.fractionLength(1)))) кг")
                    }
                    Button { editingWeight = true } label: {
                        LabeledContent("Целевой вес", value: detail.target_weight.map { "\($0.formatted(.number.precision(.fractionLength(1)))) кг" } ?? "Задать")
                    }
                    .foregroundStyle(.primary)
                    Button { editingWater = true } label: {
                        LabeledContent("Норма воды", value: detail.water_goal.map { "\($0) стаканов" } ?? "Задать")
                    }
                    .foregroundStyle(.primary)
                }
                ForEach(detail.days) { day in
                    DaySection(day: day)
                }
            }
            .refreshable { await load() }
            .alert("Целевой вес, кг", isPresented: $editingWeight) {
                NumberPrompt(initial: detail.target_weight) { value in
                    Task { await put("target-weight", TargetWeightRequest(target_weight: value)) }
                }
            }
            .alert("Норма воды, стаканов", isPresented: $editingWater) {
                NumberPrompt(initial: detail.water_goal.map(Double.init)) { value in
                    Task { await put("water-goal", WaterGoalRequest(water_goal: value.map { Int($0) })) }
                }
            }
        }
    }

    private func load() async {
        do {
            content = .loaded(try await session.api.send(Endpoint<ClientDetail>.get(
                "/api/v1/curator/clients/\(clientID)", query: [URLQueryItem(name: "days", value: "7")])))
        } catch is CancellationError {
            return
        } catch {
            if content.value == nil { content = .failed(error.userMessage) }
        }
    }

    private func put<Body: Encodable>(_ path: String, _ body: Body) async {
        _ = try? await session.api.send(Endpoint<Empty>.put("/api/v1/curator/clients/\(clientID)/\(path)", body: body))
        await load()
    }
}

/// Поле числа в системном алерте: пусто — убрать значение.
private struct NumberPrompt: View {
    let initial: Double?
    let onSave: (Double?) -> Void
    @State private var text = ""

    var body: some View {
        TextField("Пусто — убрать", text: $text)
            .keyboardType(.decimalPad)
            .onAppear { text = initial.map { $0.formatted(.number.precision(.fractionLength(0...1))) } ?? "" }
        Button("Сохранить") {
            onSave(Double(text.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)))
        }
        Button("Отмена", role: .cancel) {}
    }
}

private struct DaySection: View {
    let day: ClientDay

    var body: some View {
        Section {
            MacroRow(title: "Калории", value: day.kbzhu.calories, target: day.plan?.calories, unit: "ккал")
            MacroRow(title: "Белки", value: day.kbzhu.protein, target: day.plan?.protein, unit: "г")
            MacroRow(title: "Жиры", value: day.kbzhu.fat, target: day.plan?.fat, unit: "г")
            MacroRow(title: "Углеводы", value: day.kbzhu.carbs, target: day.plan?.carbs, unit: "г")
            ForEach(day.alerts, id: \.self) { alert in
                Label(alert.message, systemImage: "exclamationmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(color(alert.level))
            }
            ForEach(day.food_entries) { entry in
                HStack {
                    Text(entry.time).monospacedDigit().foregroundStyle(.secondary)
                    Text(entry.food_name)
                    Spacer()
                    Text("\(entry.calories.formatted(.number.precision(.fractionLength(0)))) ккал")
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                .font(.footnote)
            }
            if day.steps > 0 {
                LabeledContent("Шаги", value: day.steps.formatted())
            }
        } header: {
            Text(title)
        }
    }

    private var title: String {
        let parts = day.date.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let date = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else {
            return String(day.date.prefix(10))
        }
        return date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ru_RU")))
    }
}
