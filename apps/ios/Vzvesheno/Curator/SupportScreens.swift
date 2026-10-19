import Client
import Curator
import DesignSystem
import Navigation
import SwiftUI

/// «Обращения» (`ios-curator-support`): эскалированные первыми, как отдал сервер.
struct SupportQueueScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if let support = model.curator?.support {
                SupportQueueContent(conversations: support.conversations, loaded: support.loaded, error: support.error, now: Date(),
                                    onOpen: { model.paths[.support, default: []].append(.supportConversation(id: $0.id)) },
                                    onRetry: { Task { await support.load() } }, avatar: { EmptyView() })
                .refreshable { await support.load() }
                .task { if !support.loaded { await support.load() } }
            } else {
                LoadingView()
            }
        }
        .background(DS.Color.bgCanvas)
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("screen.support")
    }
}

/// Очередь обращений без модели.
struct SupportQueueContent<Avatar: View>: View {
    let conversations: [SupportConversation]
    let loaded: Bool
    var error: String?
    let now: Date
    var onOpen: (SupportConversation) -> Void = { _ in }
    var onRetry: () -> Void = {}
    @ViewBuilder var avatar: Avatar

    var body: some View {
        List {
            CuratorTitle(title: "Обращения") { avatar }.plainRow()
            if let error {
                LoadFailedView(text: error, retry: onRetry).plainRow()
            } else if loaded, conversations.isEmpty {
                Text("Обращений нет").dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted).plainRow()
            } else if !loaded {
                DSSpinner("Загружаем обращения").frame(maxWidth: .infinity).plainRow()
            }
            ForEach(Array(conversations.enumerated()), id: \.element.id) { index, conversation in
                Button { onOpen(conversation) } label: { SupportRow(conversation: conversation, now: now) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("support.\(conversation.id)")
                    .cardRow(position: .of(index, conversations.count))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
        .background(DS.Color.bgCanvas)
    }
}

private struct SupportRow: View {
    let conversation: SupportConversation
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s1) {
            HStack(alignment: .firstTextBaseline) {
                Text(conversation.title).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                Spacer(minLength: DS.Space.s2)
                CuratorBadge(text: conversation.statusTitle, tone: tone)
            }
            Text(conversation.subtitle(now: now)).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
            if let reason = conversation.escalationReason, !reason.isEmpty {
                Text("Причина: \(reason)").dsText(DS.Typography.callout).foregroundStyle(DS.Color.statusDangerFg)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var tone: BadgeTone {
        switch conversation.status {
        case "escalated": return .danger
        case "closed": return .neutral
        default: return .info
        }
    }
}

/// Тред обращения: заявка, причина, сообщения, ответ в канал, «Закрыть».
struct SupportThreadScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let conversationID: String
    @State private var thread: SupportThreadModel?
    @State private var text = ""

    var body: some View {
        Group {
            if let thread, let loaded = thread.thread {
                SupportThreadContent(thread: loaded, now: Date(), text: $text, sending: thread.sending, retrying: thread.retrying,
                                     actions: SupportThreadActions(
                                        reply: {
                                            let message = text
                                            Task { if await thread.reply(message) { text = "" } }
                                        },
                                        close: {
                                            Task {
                                                guard await thread.close() else { return }
                                                await model.curator?.support.load()
                                                dismiss()
                                            }
                                        },
                                        retry: { id in Task { await thread.retry(id) } }))
            } else if let error = thread?.error {
                LoadFailedView(text: error) { Task { await thread?.load() } }
                    .frame(maxHeight: .infinity)
            } else {
                LoadingView()
            }
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen.supportThread")
        .task {
            guard thread == nil else { return }
            let loaded = SupportThreadModel(api: model.api, conversationID: conversationID)
            thread = loaded
            await loaded.load()
        }
        .alert(thread?.notice ?? "", isPresented: Binding(get: { thread?.notice != nil }, set: { if !$0 { thread?.notice = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }
}

struct SupportThreadActions {
    var reply: () -> Void = {}
    var close: () -> Void = {}
    var retry: (String) -> Void = { _ in }
}

/// Тред без модели (макет CuratorSupport.png).
struct SupportThreadContent: View {
    let thread: SupportThread
    let now: Date
    @Binding var text: String
    var sending = false
    var retrying: Set<String> = []
    var actions = SupportThreadActions()

    private var conversation: SupportConversation { thread.conversation }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: DS.Space.s3) {
                    if let lead = thread.lead {
                        VStack(alignment: .leading, spacing: DS.Space.s1) {
                            Text("Связано с заявкой").dsText(DS.Typography.headline).foregroundStyle(DS.Color.statusInfoFg)
                            Text(lead.line).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(DS.Space.s4)
                        .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.statusInfoSoft))
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("support.lead")
                    }
                    if let reason = conversation.escalationReason, !reason.isEmpty {
                        Text("Причина эскалации: \(reason)")
                            .dsText(DS.Typography.callout)
                            .foregroundStyle(DS.Color.statusDangerFg)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(DS.Space.s4)
                            .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.statusDangerSoft))
                    }
                    ForEach(thread.messages) { message in
                        SupportBubble(message: message, retrying: retrying.contains(message.id), isWeb: conversation.isWeb) {
                            actions.retry(message.id)
                        }
                    }
                }
                .padding(.horizontal, DS.Space.s4)
                .padding(.vertical, DS.Space.s4)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            if conversation.status != "closed" {
                ReplyField(text: $text, placeholder: conversation.replyPlaceholder, sending: sending, onSend: actions.reply)
            }
        }
        .background(DS.Color.bgCanvas)
    }

    private var header: some View {
        VStack(spacing: 0) {
            HStack(spacing: DS.Space.s3) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(conversation.title).dsText(DS.Typography.title2).foregroundStyle(DS.Color.fgDefault)
                        .accessibilityAddTraits(.isHeader)
                    Text(conversation.subtitle(now: now)).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        .accessibilityIdentifier("support.subtitle")
                }
                Spacer(minLength: 0)
                if conversation.status != "closed" {
                    Button("Закрыть", action: actions.close)
                        .dsText(DS.Typography.headline)
                        .foregroundStyle(DS.Color.fgDefault)
                        .padding(.horizontal, DS.Space.s4)
                        .frame(minHeight: DS.Size.touch)
                        .background(Capsule().fill(DS.Color.bgSubtle))
                        .accessibilityIdentifier("support.close")
                }
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s2)
            Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
        }
    }
}

/// Реплика треда: «Пользователь», «Бот», «Вы»; недоставленный ответ — с «Повторить».
private struct SupportBubble: View {
    let message: SupportMessage
    let retrying: Bool
    let isWeb: Bool
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: DS.Space.s1) {
            Text(message.isOutgoing ? "Вы" : message.authorTitle)
                .dsText(DS.Typography.overline)
                .foregroundStyle(DS.Color.fgMuted)
            HStack {
                if message.isOutgoing { Spacer(minLength: 56) }
                Text(message.text)
                    .dsText(DS.Typography.body)
                    .foregroundStyle(message.isOutgoing ? DS.Color.primaryFg : DS.Color.fgDefault)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(bubble)
                    .overlay {
                        if message.author == "user" {
                            RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault)
                        }
                    }
                if !message.isOutgoing { Spacer(minLength: 56) }
            }
            if message.undelivered {
                Button(action: onRetry) {
                    Text(retrying ? "Отправляем ещё раз…" : "Не доставлено в Telegram · Повторить")
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(DS.Color.statusDangerFg)
                }
                .buttonStyle(.plain)
                .disabled(retrying)
                .accessibilityIdentifier("support.retry.\(message.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("support.message.\(message.id)")
    }

    private var bubble: some View {
        RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
            .fill(message.isOutgoing ? DS.Color.primaryDefault : message.author == "bot" ? DS.Color.bgSubtle : DS.Color.bgSurface)
    }
}

/// Поле ответа с подписью канала.
private struct ReplyField: View {
    @Binding var text: String
    let placeholder: String
    let sending: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: DS.Space.s2) {
            TextField(placeholder, text: $text, axis: .vertical)
                .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .body))
                .foregroundStyle(DS.Color.fgDefault)
                .lineLimit(1...5)
                .padding(.vertical, 12)
                .accessibilityIdentifier("support.reply")
            Button(action: onSend) {
                Image(systemName: sending ? "hourglass" : "arrow.up")
                    .font(.system(.body).weight(.semibold))
                    .foregroundStyle(DS.Color.primaryFg)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(empty ? DS.Color.fgDisabled : DS.Color.primaryDefault))
            }
            .buttonStyle(.plain)
            .disabled(empty || sending)
            .padding(.bottom, 6)
            .accessibilityLabel("Отправить")
            .accessibilityIdentifier("support.send")
        }
        .padding(.leading, DS.Space.s4)
        .padding(.trailing, 6)
        .background(Capsule().fill(DS.Color.bgSurface))
        .overlay(Capsule().strokeBorder(DS.Color.lineDefault))
        .padding(.horizontal, DS.Space.s4)
        .padding(.vertical, DS.Space.s2)
        .background(DS.Color.bgCanvas)
    }

    private var empty: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}
