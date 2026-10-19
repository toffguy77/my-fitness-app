import Client
import Curator
import DesignSystem
import Navigation
import SwiftUI

/// «Клиенты» (`ios-curator-hub`): сводка, «Требуют внимания», «Остальные».
struct HubScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if let hub = model.curator?.hub {
                @Bindable var hub = hub
                HubContent(phase: hub.phase, analytics: hub.analytics, groups: hub.visibleGroups, others: hub.visibleOthers,
                           benchmark: hub.benchmark?.own ?? [], query: $hub.query,
                           actions: HubActions(open: { open($0) }, write: { write($0) }, retry: { Task { await hub.load() } })) {
                    CuratorProfileMenu()
                }
                .refreshable { await hub.load() }
            } else {
                LoadingView()
            }
        }
        .background(DS.Color.bgCanvas)
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("screen.hub")
    }

    /// Экран внутри вкладки «Клиенты» — поверх списка, без перескока на другую вкладку.
    private func open(_ link: ScreenLink) {
        let target = Router.target(for: link, shell: .curator)
        model.paths[.clients, default: []].append(contentsOf: target.path)
    }

    private func write(_ clientID: Int64) {
        model.paths[.clients, default: []].append(.clientConversation(clientID: String(clientID)))
    }
}

struct HubActions {
    var open: (ScreenLink) -> Void = { _ in }
    var write: (Int64) -> Void = { _ in }
    var retry: () -> Void = {}
}

/// «Клиенты» без модели (макет CuratorClients.png).
struct HubContent<Avatar: View>: View {
    let phase: HubModel.Phase
    let analytics: CuratorAnalytics?
    let groups: [AttentionGroup]
    let others: [CuratorClient]
    var benchmark: [CuratorBenchmark.Week] = []
    @Binding var query: String
    var actions = HubActions()
    @ViewBuilder var avatar: Avatar

    var body: some View {
        List {
            Group {
                CuratorTitle(title: "Клиенты") { avatar }
                SearchField(text: $query)
                if let analytics {
                    SummaryGrid(analytics: analytics)
                }
                if !benchmark.isEmpty {
                    BenchmarkCard(weeks: benchmark)
                }
                switch phase {
                case .loading where analytics == nil:
                    DSSpinner("Загружаем клиентов").frame(maxWidth: .infinity).padding(.top, DS.Space.s6)
                case .failed:
                    LoadFailedView(retry: actions.retry)
                default:
                    EmptyView()
                }
            }
            .plainRow()
            if !groups.isEmpty {
                SectionTitle(text: "Требуют внимания").plainRow()
                ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                    AttentionRow(group: group) { actions.open(group.link) }
                        .cardRow(position: .of(index, groups.count))
                        .swipeActions(edge: .trailing) { writeButton(group.clientID) }
                }
            }
            if !others.isEmpty {
                SectionTitle(text: "Остальные").plainRow()
                ForEach(Array(others.enumerated()), id: \.element.id) { index, client in
                    OtherClientRow(client: client) { actions.open(.curatorClient(id: String(client.id), tab: nil)) }
                        .cardRow(position: .of(index, others.count))
                        .swipeActions(edge: .trailing) { writeButton(client.id) }
                }
            }
            Color.clear.frame(height: DS.Space.s6).plainRow()
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
        .background(DS.Color.bgCanvas)
        .accessibilityIdentifier("hub.list")
    }

    private func writeButton(_ clientID: Int64) -> some View {
        Button { actions.write(clientID) } label: { Label("Написать", systemImage: "bubble.left") }
            .tint(DS.Color.primaryDefault)
            .accessibilityIdentifier("hub.write.\(clientID)")
    }
}

private struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .dsText(DS.Typography.title2)
            .foregroundStyle(DS.Color.fgDefault)
            .padding(.top, DS.Space.s4)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Поле поиска по имени — без обращения к серверу.
struct SearchField: View {
    @Binding var text: String
    var prompt = "Поиск"

    var body: some View {
        HStack(spacing: DS.Space.s3) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(DS.Color.fgMuted)
                .accessibilityHidden(true)
            TextField(prompt, text: $text)
                .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .body))
                .foregroundStyle(DS.Color.fgDefault)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
                .accessibilityIdentifier("hub.search")
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(DS.Color.fgSubtle) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Очистить поиск")
            }
        }
        .padding(.horizontal, DS.Space.s4)
        .frame(minHeight: DS.Size.control - 10)
        .background(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous).fill(DS.Color.bgSubtle))
    }
}

/// Четыре показателя `GET /curator/analytics`.
private struct SummaryGrid: View {
    let analytics: CuratorAnalytics

    var body: some View {
        Grid(horizontalSpacing: DS.Space.s3, verticalSpacing: DS.Space.s3) {
            GridRow {
                tile("Активные", value: "\(analytics.totalClients)",
                     caption: "требуют внимания: \(analytics.attentionClients)", alert: analytics.attentionClients > 0, id: "active")
                tile("КБЖУ в среднем", value: "\(NumberText.jsRound(analytics.avgKBZHUPercent))%", caption: "за сегодня", id: "kbzhu")
            }
            GridRow {
                tile("Непрочитанные", value: "\(analytics.totalUnread)", caption: "от \(Self.clients(analytics.clientsWaiting))",
                     id: "unread")
                tile("Задачи", value: "\(analytics.activeTasks)", caption: tasksCaption, id: "tasks")
            }
        }
    }

    private var tasksCaption: String {
        var parts = ["просрочено: \(analytics.overdueTasks)"]
        if analytics.completedToday > 0 { parts.append("сегодня: \(analytics.completedToday)") }
        return parts.joined(separator: " · ")
    }

    /// «от 3 клиентов», «от 1 клиента».
    static func clients(_ count: Int) -> String {
        count % 10 == 1 && count % 100 != 11 ? "\(count) клиента" : "\(count) клиентов"
    }

    private func tile(_ title: String, value: String, caption: String, alert: Bool = false, id: String) -> some View {
        CuratorCard {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                Text(value)
                    .dsText(DS.Typography.numL)
                    .foregroundStyle(DS.Color.fgDefault)
                    .accessibilityIdentifier("hub.summary.\(id)")
                Text(caption)
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(alert ? DS.Color.statusDangerFg : DS.Color.fgMuted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Упрощённая динамика: средний % КБЖУ за последние 4 недели.
private struct BenchmarkCard: View {
    let weeks: [CuratorBenchmark.Week]

    var body: some View {
        CuratorCard {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
                Text("КБЖУ по неделям").dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                HStack(alignment: .bottom, spacing: DS.Space.s3) {
                    ForEach(weeks.suffix(4), id: \.weekStart) { week in
                        VStack(spacing: 2) {
                            Text("\(NumberText.jsRound(week.avgKBZHUPercent))%")
                                .dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                            Text(DayText.dayMonth(week.weekStart))
                                .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("hub.benchmark")
    }
}

/// Строка «Требуют внимания»: все причины клиента бейджами.
private struct AttentionRow: View {
    let group: AttentionGroup
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: DS.Space.s3) {
                InitialsAvatar(name: group.name)
                VStack(alignment: .leading, spacing: DS.Space.s1) {
                    Text(group.name).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                    FlowRow {
                        ForEach(group.badges) { badge in
                            CuratorBadge(text: badge.text, tone: badge.tone)
                        }
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(DS.Color.fgMuted).accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(group.name): \(group.badges.flatMap(\.details).joined(separator: "; "))")
        .accessibilityIdentifier("attention.\(group.clientID)")
    }
}

/// Строка «Остальные»: имя и процент КБЖУ полосой.
private struct OtherClientRow: View {
    let client: CuratorClient
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: DS.Space.s3) {
                InitialsAvatar(name: client.displayName)
                VStack(alignment: .leading, spacing: DS.Space.s2) {
                    HStack {
                        Text(client.displayName).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                        Spacer(minLength: DS.Space.s2)
                        if let percent = client.kbzhuPercent {
                            Text("\(percent)%").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted).monospacedDigit()
                        }
                    }
                    if let percent = client.kbzhuPercent {
                        TodayBar(fraction: Double(percent) / 100, color: percent > 110 ? DS.Color.statusDanger : DS.Color.statusSuccess)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("client.\(client.id)")
    }
}

/// Место строки в карточке-группе: скругление сверху, снизу или с обеих сторон.
enum RowPosition {
    case single, first, middle, last

    static func of(_ index: Int, _ count: Int) -> RowPosition {
        if count == 1 { return .single }
        if index == 0 { return .first }
        return index == count - 1 ? .last : .middle
    }
}

/// Фон строки-карточки: бумага, линия, скругление по месту, разделитель.
private struct RowCardBackground: View {
    let position: RowPosition

    var body: some View {
        let radius = DS.Radius.l
        let top: CGFloat = position == .first || position == .single ? radius : 0
        let bottom: CGFloat = position == .last || position == .single ? radius : 0
        let shape = UnevenRoundedRectangle(topLeadingRadius: top, bottomLeadingRadius: bottom, bottomTrailingRadius: bottom,
                                           topTrailingRadius: top, style: .continuous)
        ZStack(alignment: .bottom) {
            shape.fill(DS.Color.bgSurface)
            shape.strokeBorder(DS.Color.lineDefault, lineWidth: 1)
            if position == .first || position == .middle {
                Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
            }
        }
        .padding(.horizontal, DS.Space.screenX)
    }
}

extension View {
    /// Строка списка без подложки и разделителя — шапка, сводка, заголовки.
    func plainRow() -> some View {
        listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 6, leading: DS.Space.screenX, bottom: 6, trailing: DS.Space.screenX))
    }

    /// Строка-карточка внутри группы.
    func cardRow(position: RowPosition) -> some View {
        padding(.vertical, DS.Space.s4)
            .listRowBackground(RowCardBackground(position: position))
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 0, leading: DS.Space.screenX + DS.Space.s4, bottom: 0,
                                      trailing: DS.Space.screenX + DS.Space.s4))
    }
}
