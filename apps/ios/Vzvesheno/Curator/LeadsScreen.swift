import Curator
import DesignSystem
import MessageUI
import Navigation
import SwiftUI

/// Кнопка карточки заявки: мягкая (действие) или тёмная (главное).
struct CardButtonStyle: ButtonStyle {
    enum Kind { case soft, dark }
    let kind: Kind
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .dsText(DS.Typography.headline)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(kind == .soft ? DS.Color.primaryDefault : DS.Color.coachFg)
            .frame(maxWidth: .infinity, minHeight: DS.Size.touch)
            .background(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous)
                .fill(kind == .soft ? DS.Color.primarySoft : DS.Color.coachBg))
            .opacity(configuration.isPressed || !isEnabled ? 0.7 : 1)
    }
}

/// «Заявки» (`ios-curator-leads`): очередь в порядке сервера.
struct LeadsScreen: View {
    @Environment(AppModel.self) private var model
    /// Ссылка `/curator/leads?lead=…` и пуш: одна заявка.
    var focus: String?
    @Environment(\.openURL) private var openURL
    @State private var mail: String?

    var body: some View {
        Group {
            if let leads = model.curator?.leads {
                @Bindable var bound = leads
                LeadsContent(leads: focus.map { id in leads.leads.filter { $0.id == id } } ?? leads.leads, waiting: leads.waiting,
                             loaded: leads.loaded, error: leads.error, includeHandled: $bound.includeHandled,
                             showsTitle: focus == nil,
                             actions: LeadActions(write: { write($0) }, conversation: { openConversation($0) },
                                                  handled: { id in Task { await leads.markHandled(id) } },
                                                  retry: { Task { await leads.load() } })) {
                    if model.curator?.shell == .admin { CuratorProfileMenu() }
                }
                .refreshable { await leads.load() }
                .task { if !leads.loaded { await leads.load() } }
                .onChange(of: leads.includeHandled) { _, _ in Task { await leads.load() } }
                .alert(leads.notice ?? "", isPresented: Binding(get: { leads.notice != nil }, set: { if !$0 { leads.notice = nil } })) {
                    Button("OK", role: .cancel) {}
                }
            } else {
                LoadingView()
            }
        }
        .background(DS.Color.bgCanvas)
        .toolbar(focus == nil ? .hidden : .visible, for: .navigationBar)
        .navigationTitle(focus == nil ? "" : "Заявка")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen.leads")
        .sheet(item: Binding(get: { mail.map(MailDraft.init) }, set: { if $0 == nil { mail = nil } })) { draft in
            MailComposer(recipient: draft.recipient) { mail = nil }
                .ignoresSafeArea()
        }
    }

    /// Системный редактор письма; без настроенной почты — `mailto:`.
    private func write(_ lead: Lead) {
        guard lead.contactAllowed else { return }
        if MFMailComposeViewController.canSendMail() {
            mail = lead.email
        } else if let url = URL(string: "mailto:\(lead.email)") {
            openURL(url)
        }
    }

    /// «Переписка»: тред обращения во вкладке «Обращения».
    private func openConversation(_ id: String) {
        model.selectedTab = .support
        model.paths[.support] = [.supportConversation(id: id)]
    }
}

private struct MailDraft: Identifiable {
    let recipient: String
    var id: String { recipient }
}

/// `MFMailComposeViewController` с адресом заявки.
struct MailComposer: UIViewControllerRepresentable {
    let recipient: String
    let onFinish: () -> Void

    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let controller = MFMailComposeViewController()
        controller.setToRecipients([recipient])
        controller.mailComposeDelegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: MFMailComposeViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    @MainActor
    final class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let onFinish: () -> Void

        init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }

        nonisolated func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult,
                                               error: Error?) {
            MainActor.assumeIsolated { onFinish() }
        }
    }
}

struct LeadActions {
    var write: (Lead) -> Void = { _ in }
    var conversation: (String) -> Void = { _ in }
    var handled: (String) -> Void = { _ in }
    var retry: () -> Void = {}
}

/// «Заявки» без модели (макет CuratorLeads.png).
struct LeadsContent<Avatar: View>: View {
    let leads: [Lead]
    let waiting: Int
    let loaded: Bool
    var error: String?
    @Binding var includeHandled: Bool
    var showsTitle = true
    var actions = LeadActions()
    @ViewBuilder var avatar: Avatar

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                if showsTitle {
                    CuratorTitle(title: "Заявки") {
                        HStack(spacing: DS.Space.s3) {
                            Text("ждут: \(waiting)").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                                .accessibilityIdentifier("leads.waiting")
                            avatar
                        }
                    }
                    Toggle("Показывать обработанные", isOn: $includeHandled)
                        .dsText(DS.Typography.body)
                        .foregroundStyle(DS.Color.fgDefault)
                        .tint(DS.Color.primaryDefault)
                        .accessibilityIdentifier("leads.includeHandled")
                }
                if let error {
                    LoadFailedView(text: error, retry: actions.retry)
                } else if loaded, leads.isEmpty {
                    Text("Заявок нет").dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted)
                } else if !loaded {
                    DSSpinner("Загружаем заявки").frame(maxWidth: .infinity)
                }
                ForEach(leads) { lead in
                    LeadCard(lead: lead, actions: actions)
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.bottom, DS.Space.s6)
        }
        .background(DS.Color.bgCanvas)
    }
}

private struct LeadCard: View {
    let lead: Lead
    let actions: LeadActions

    var body: some View {
        CuratorCard(padding: DS.Space.s5) {
            VStack(alignment: .leading, spacing: DS.Space.s2) {
                HStack(alignment: .firstTextBaseline) {
                    Text(lead.title).font(.custom(DS.FontFamily.sans, size: 18, relativeTo: .title3).weight(.semibold))
                        .foregroundStyle(DS.Color.fgDefault)
                    Spacer(minLength: DS.Space.s2)
                    if lead.handled {
                        CuratorBadge(text: "Обработана", tone: .info).accessibilityIdentifier("lead.handledBadge.\(lead.id)")
                    } else {
                        Text(lead.waitingLine).dsText(DS.Typography.callout)
                            .foregroundStyle(lead.ageDays >= 2 ? DS.Color.statusWarningFg : DS.Color.fgMuted)
                    }
                }
                Text("\(lead.email) · \(lead.stepLine)").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if lead.hasParameters {
                    Text(lead.parametersLine).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
                    Text(sourceLine).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("\(lead.parametersLine) · \(sourceLine)").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !lead.contactAllowed {
                    Text("Согласия на связь нет — писать нельзя")
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.statusWarningFg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, DS.Space.s3)
                        .padding(.vertical, DS.Space.s2)
                        .background(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous).fill(DS.Color.statusWarningSoft))
                        .accessibilityIdentifier("lead.noConsent.\(lead.id)")
                }
                buttons.padding(.top, DS.Space.s2)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("lead.\(lead.id)")
    }

    private var sourceLine: String { lead.reminderSent ? "\(lead.sourceLine) · напоминание отправлено" : lead.sourceLine }

    @ViewBuilder
    private var buttons: some View {
        HStack(spacing: DS.Space.s3) {
            if lead.contactAllowed {
                Button("Написать") { actions.write(lead) }
                    .buttonStyle(CardButtonStyle(kind: .soft))
                    .accessibilityIdentifier("lead.write.\(lead.id)")
            }
            if let conversation = lead.conversationID {
                Button("Переписка") { actions.conversation(conversation) }
                    .buttonStyle(CardButtonStyle(kind: .soft))
                    .accessibilityIdentifier("lead.conversation.\(lead.id)")
            }
            if !lead.handled {
                Button("Обработана") { actions.handled(lead.id) }
                    .buttonStyle(CardButtonStyle(kind: .dark))
                    .accessibilityIdentifier("lead.handled.\(lead.id)")
            }
        }
    }
}
