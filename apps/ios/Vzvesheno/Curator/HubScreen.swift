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
                @Bindable var bound = hub
                HubContent(phase: hub.phase, analytics: hub.analytics, groups: hub.visibleGroups, others: hub.visibleOthers,
                           benchmark: hub.benchmark?.own ?? [], query: $bound.query,
                           actions: HubActions(open: { open($0) }, write: { write($0) }, retry: { Task { await hub.load() } })) {
                    CuratorProfileMenu()
                }
                .refreshable { await hub.load() }
                .safeAreaInset(edge: .top, spacing: 0) {
                    FreshnessBanner(offline: hub.offline, updatedLabel: hub.updatedLabel).padding(.horizontal, DS.Space.screenX)
                }
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
        // Не List и не ленивая стопка: аудит Dynamic Type не видит роста текста
        // в ячейках списка (как и в переписке клиента), а клиентов у куратора — десятки.
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s3) {
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
                if !groups.isEmpty {
                    SectionTitle(text: "Требуют внимания")
                    CardGroup {
                        ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                            AttentionRow(group: group) { actions.open(group.link) }
                                .cardRow(position: .of(index, groups.count))
                                .swipeAction("Написать", identifier: "hub.write.\(group.clientID)") { actions.write(group.clientID) }
                        }
                    }
                }
                if !others.isEmpty {
                    SectionTitle(text: "Остальные")
                    CardGroup {
                        ForEach(Array(others.enumerated()), id: \.element.id) { index, client in
                            OtherClientRow(client: client) { actions.open(.curatorClient(id: String(client.id), tab: nil)) }
                                .cardRow(position: .of(index, others.count))
                                .swipeAction("Написать", identifier: "hub.write.\(client.id)") { actions.write(client.id) }
                        }
                    }
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.bottom, DS.Space.s6)
        }
        .background(DS.Color.bgCanvas)
        .accessibilityIdentifier("hub.list")
    }

}

private struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .dsText(DS.Typography.title3)
            .foregroundStyle(DS.Color.fgDefault)
            .padding(.top, DS.Space.s1)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Поле поиска по имени — без обращения к серверу.
struct SearchField: View {
    @Binding var text: String
    var prompt = "Поиск"

    var body: some View {
        HStack(spacing: DS.Space.s2) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16))
                .foregroundStyle(DS.Color.fgSubtle)
                .accessibilityHidden(true)
            TextField(prompt, text: $text, prompt: Text(prompt).foregroundStyle(DS.Color.fgMuted))
                .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body))
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
        .padding(.horizontal, DS.Space.s3)
        .frame(minHeight: 38)
        .background(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous).fill(DS.Color.bgSubtle))
    }
}

/// Четыре показателя `GET /curator/analytics`.
private struct SummaryGrid: View {
    let analytics: CuratorAnalytics

    var body: some View {
        Grid(horizontalSpacing: 10, verticalSpacing: 10) {
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
        CuratorCard(padding: EdgeInsets(top: 10, leading: DS.Space.s3, bottom: 10, trailing: DS.Space.s3)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                Text(value)
                    .dsText(DS.Typography.numL)
                    .foregroundStyle(DS.Color.fgDefault)
                    .padding(.vertical, 1)
                Text(caption)
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(alert ? DS.Color.statusDangerFg : DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("hub.summary.\(id)")
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
            HStack(spacing: DS.Space.s2) {
                InitialsAvatar(name: group.name, size: 38)
                VStack(alignment: .leading, spacing: DS.Space.s1) {
                    Text(group.name).font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .headline).weight(.semibold))
                        .foregroundStyle(DS.Color.fgDefault)
                    // Строкой; при крупном шрифте текст плашки переносится внутри неё.
                    HStack(alignment: .top, spacing: DS.Space.s1) { badges }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .medium))
                    .foregroundStyle(DS.Color.fgSubtle).accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(group.name): \(group.badges.flatMap(\.details).joined(separator: "; "))")
        .accessibilityIdentifier("attention.\(group.clientID)")
    }

    /// Срочная причина получает ширину первой: переносится, если уж
    /// придётся, менее срочная плашка, а не «Алерт КБЖУ · 132%».
    private var badges: some View {
        ForEach(Array(group.badges.enumerated()), id: \.element.id) { index, badge in
            CuratorBadge(text: badge.text, tone: badge.tone)
                .layoutPriority(Double(group.badges.count - index))
        }
    }
}

/// Строка «Остальные»: имя и процент КБЖУ полосой.
private struct OtherClientRow: View {
    let client: CuratorClient
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: DS.Space.s3) {
                InitialsAvatar(name: client.displayName, size: 38)
                VStack(alignment: .leading, spacing: DS.Space.s1) {
                    Text(client.displayName).font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .headline).weight(.semibold))
                        .foregroundStyle(DS.Color.fgDefault)
                    if let percent = client.kbzhuPercent {
                        TodayBar(fraction: Double(percent) / 100, color: percent > 110 ? DS.Color.statusDanger : DS.Color.statusSuccess)
                            .frame(height: 5)
                    }
                }
                if let percent = client.kbzhuPercent {
                    Text("\(percent)%").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted).monospacedDigit()
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

/// Группа строк одной карточкой: бумага, линия, скругление.
struct CardGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        VStack(spacing: 0) { content }
            .background(shape.fill(DS.Color.bgSurface))
            .clipShape(shape)
            .overlay(shape.strokeBorder(DS.Color.lineDefault, lineWidth: 1))
    }
}

extension View {
    /// Строка-карточка внутри группы.
    func cardRow(position: RowPosition) -> some View {
        padding(.vertical, 10)
            .padding(.horizontal, DS.Space.s3)
            .background(DS.Color.bgSurface)
            .overlay(alignment: .top) {
                if position == .middle || position == .last {
                    Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
                }
            }
    }

    /// Действие свайпом влево («Написать»); для VoiceOver — то же действие в списке действий.
    func swipeAction(_ title: String, identifier: String, perform: @escaping () -> Void) -> some View {
        modifier(SwipeActionModifier(title: title, identifier: identifier, perform: perform))
    }
}

/// Свайп строки влево открывает кнопку действия справа (как `swipeActions`
/// у `List`, которого на этих экранах нет).
private struct SwipeActionModifier: ViewModifier {
    let title: String
    let identifier: String
    let perform: () -> Void
    @State private var offset: CGFloat = 0
    private let width: CGFloat = 112

    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .background(alignment: .trailing) {
                if offset < 0 {
                    Button {
                        withAnimation(.snappy) { offset = 0 }
                        perform()
                    } label: {
                        Text(title)
                            .dsText(DS.Typography.headline)
                            .foregroundStyle(DS.Color.primaryFg)
                            .frame(width: -offset)
                            .frame(maxHeight: .infinity)
                            .background(DS.Color.primaryDefault)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier(identifier)
                }
            }
            .clipped()
            .simultaneousGesture(
                DragGesture(minimumDistance: 16)
                    .onChanged { value in
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        offset = min(0, max(-width, value.translation.width))
                    }
                    .onEnded { _ in
                        withAnimation(.snappy) { offset = offset < -width / 2 ? -width : 0 }
                    }
            )
            .accessibilityAction(named: title, perform)
    }
}
