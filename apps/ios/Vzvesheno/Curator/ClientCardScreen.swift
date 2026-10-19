import Client
import Curator
import DesignSystem
import Navigation
import SwiftUI

/// Карточка клиента (`ios-curator-client-card`): ссылка, пуш, «Клиенты».
struct ClientCardScreen: View {
    @Environment(AppModel.self) private var model
    let clientID: Int64
    let initialTab: ClientCardTab
    @State private var card: ClientCardModel?
    @State private var sheet: CardSheet?
    @State private var editingWeight = false
    @State private var weightText = ""
    @State private var deletingPlan: ClientPlan?

    var body: some View {
        Group {
            if let card {
                content(card)
            } else {
                LoadingView()
            }
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { write() } label: { Label("Написать", systemImage: "bubble.left") }
                    .labelStyle(.titleAndIcon)
                    .buttonStyle(DSButtonStyle(.secondary, size: .small))
                    .accessibilityIdentifier("card.write")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen.clientCard")
        .task {
            guard card == nil else { return }
            let loaded = ClientCardModel(api: model.api, clientID: clientID, tab: initialTab,
                                         calendar: model.curator?.calendar ?? DayCalendar(timeZone: model.profileTimeZone))
            card = loaded
            await loaded.load()
        }
        .sheet(item: $sheet) { sheet in
            if let card {
                CardSheetView(sheet: sheet, card: card) { self.sheet = nil }
                    .presentationDetents([.large])
                    .presentationBackground(DS.Color.bgCanvas)
            }
        }
        .alert("Цель веса, кг", isPresented: $editingWeight) {
            TextField("64", text: $weightText)
                .keyboardType(.decimalPad)
                .accessibilityIdentifier("card.weightGoal.field")
            Button("Сохранить") {
                guard let value = DecimalInput.parse(weightText) else { return }
                Task { await card?.setTargetWeight(value) }
            }
            Button("Убрать", role: .destructive) { Task { await card?.setTargetWeight(nil) } }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("От 20 до 500 кг, шаг 0,1")
        }
        .alert("Удалить активный план?", isPresented: Binding(get: { deletingPlan != nil }, set: { if !$0 { deletingPlan = nil } })) {
            Button("Удалить", role: .destructive) {
                guard let plan = deletingPlan else { return }
                Task { card?.notice = await card?.deletePlan(plan.id) }
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Клиент останется без целей КБЖУ, пока вы не зададите новый план.")
        }
        .alert(card?.notice ?? "", isPresented: Binding(get: { card?.notice != nil }, set: { if !$0 { card?.notice = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    @ViewBuilder
    private func content(_ card: ClientCardModel) -> some View {
        switch card.phase {
        case .loading:
            LoadingView()
        case let .failed(message):
            LoadFailedView(text: message) { Task { await card.load() } }
                .frame(maxHeight: .infinity)
        case .loaded:
            if let detail = card.detail {
                @Bindable var card = card
                ClientCardContent(
                    detail: detail, streak: model.curator?.hub?.client(clientID)?.streakDays ?? detail.client.streakDays,
                    tab: Binding(get: { card.tab }, set: { tab in
                        card.tab = tab
                        Task { await card.loadTab() }
                    }),
                    today: card.today, notices: card.notices, plans: card.plans, tasks: card.visibleTasks,
                    taskFilter: $card.taskFilter, reports: card.reports, waterCaption: card.waterCaption,
                    actions: ClientCardActions(
                        editWeightGoal: {
                            weightText = detail.client.targetWeight.map(DecimalInput.text) ?? ""
                            editingWeight = true
                        },
                        setWaterGoal: { goal in Task { await card.setWaterGoal(goal) } },
                        newPlan: { sheet = .plan(nil) },
                        editPlan: { sheet = .plan($0) },
                        deletePlan: { deletingPlan = $0 },
                        newTask: { sheet = .task(nil) },
                        editTask: { sheet = .task($0) },
                        feedback: { sheet = .feedback($0) }))
                .refreshable { await card.load() }
            }
        }
    }

    private func write() {
        let tab = model.selectedTab ?? .clients
        model.paths[tab, default: []].append(.clientConversation(clientID: String(clientID)))
    }
}

/// Лист формы поверх карточки.
enum CardSheet: Identifiable {
    case plan(ClientPlan?)
    case task(ClientTask?)
    case feedback(WeeklyReport)

    var id: String {
        switch self {
        case let .plan(plan): return "plan-\(plan?.id ?? "new")"
        case let .task(task): return "task-\(task?.id ?? "new")"
        case let .feedback(report): return "feedback-\(report.id)"
        }
    }
}

struct ClientCardActions {
    var editWeightGoal: () -> Void = {}
    var setWaterGoal: (Int?) -> Void = { _ in }
    var newPlan: () -> Void = {}
    var editPlan: (ClientPlan) -> Void = { _ in }
    var deletePlan: (ClientPlan) -> Void = { _ in }
    var newTask: () -> Void = {}
    var editTask: (ClientTask) -> Void = { _ in }
    var feedback: (WeeklyReport) -> Void = { _ in }
}

/// Карточка клиента без модели (макет CuratorClient.png).
struct ClientCardContent: View {
    let detail: ClientDetail
    let streak: Int
    @Binding var tab: ClientCardTab
    let today: String
    var notices: [ClientNotice] = []
    var plans: [ClientPlan] = []
    var tasks: [ClientTask] = []
    @Binding var taskFilter: TaskFilter
    var reports: [WeeklyReport] = []
    var waterCaption: String?
    var calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)
    var actions = ClientCardActions()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                ClientHeader(client: detail.client, streak: streak, today: today)
                SegmentBar(items: ClientCardTab.allCases, selection: $tab, title: \.title, identifier: \.rawValue)
                switch tab {
                case .overview:
                    ClientOverview(detail: detail, today: today, notices: notices, waterCaption: waterCaption,
                                   calendar: calendar, actions: actions)
                case .plan:
                    ClientPlanTab(plans: plans, actions: actions)
                case .tasks:
                    ClientTasksTab(tasks: tasks, filter: $taskFilter, actions: actions)
                case .reports:
                    ClientReportsTab(reports: reports, actions: actions)
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.bottom, DS.Space.s8)
        }
        .background(DS.Color.bgCanvas)
    }
}

/// Имя, возраст, пол, цель и серия.
private struct ClientHeader: View {
    let client: CuratorClient
    let streak: Int
    let today: String

    var body: some View {
        HStack(spacing: DS.Space.s4) {
            InitialsAvatar(name: client.displayName, size: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text(client.displayName)
                    .dsText(DS.Typography.title1)
                    .foregroundStyle(DS.Color.fgDefault)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("card.name")
                if !meta.isEmpty {
                    Text(meta).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
    }

    /// «32 года · Ж · снижение веса · серия 12 дн.».
    private var meta: String {
        var parts: [String] = []
        if let birth = client.birthDate, let age = Self.age(birth: DayKey.of(birth), today: today) { parts.append(CuratorText.years(age)) }
        switch client.biologicalSex {
        case "female": parts.append("Ж")
        case "male": parts.append("М")
        default: break
        }
        switch client.fitnessGoal {
        case "loss": parts.append("снижение веса")
        case "maintain": parts.append("удержание веса")
        case "gain": parts.append("набор массы")
        default: break
        }
        if streak > 0 { parts.append("серия \(streak) дн.") }
        return parts.joined(separator: " · ")
    }

    static func age(birth: String, today: String) -> Int? {
        let born = birth.split(separator: "-").compactMap { Int($0) }
        let now = today.split(separator: "-").compactMap { Int($0) }
        guard born.count == 3, now.count == 3 else { return nil }
        var age = now[0] - born[0]
        if (now[1], now[2]) < (born[1], born[2]) { age -= 1 }
        return age >= 0 ? age : nil
    }
}
