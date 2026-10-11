import SwiftUI

struct ConversationsView: View {
    @Environment(SessionStore.self) private var session
    @State private var content: Loadable<[Conversation]> = .loading

    var body: some View {
        NavigationStack {
            Group {
                switch content {
                case .loading:
                    ProgressView()
                case let .failed(message):
                    ErrorRetryView(message: message) { Task { await load() } }
                case let .loaded(conversations) where conversations.isEmpty:
                    ContentUnavailableView(
                        "Переписок пока нет",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text("Переписка появится, когда за вами закрепят куратора."))
                case let .loaded(conversations):
                    List(conversations) { conversation in
                        NavigationLink(value: conversation) {
                            ConversationRow(conversation: conversation)
                        }
                    }
                }
            }
            .navigationTitle("Чат")
            .navigationDestination(for: Conversation.self) { conversation in
                ChatView(conversation: conversation)
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            content = .loaded(try await session.api.send(Endpoint<[Conversation]>.get("/api/v1/conversations")))
        } catch is CancellationError {
            return
        } catch {
            if content.value == nil { content = .failed(error.userMessage) }
        }
    }
}

extension Conversation: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

private struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(conversation.participant.name.isEmpty ? "Без имени" : conversation.participant.name)
                    .font(.headline)
                if let last = conversation.last_message {
                    Text(preview(last))
                        .lineLimit(1)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if conversation.unread_count > 0 {
                Text("\(conversation.unread_count)")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.accentColor, in: Capsule())
                    .foregroundStyle(.white)
            }
        }
    }
}

func preview(_ message: Message) -> String {
    switch message.type {
    case "text": return message.content ?? ""
    case "image": return "Фото"
    case "file": return "Файл"
    case "food_entry": return "Запись в дневнике"
    default: return message.content ?? "Сообщение"
    }
}

struct ChatView: View {
    @Environment(SessionStore.self) private var session

    let conversation: Conversation

    @State private var messages: [Message] = []
    @State private var loadError: String?
    @State private var draft = ""
    @State private var sending = false
    @State private var sendError: String?

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        if let loadError {
                            Text(loadError).foregroundStyle(.red).font(.footnote)
                        }
                        ForEach(messages) { message in
                            MessageBubble(message: message, isMine: message.sender_id == session.user?.id)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: messages.last?.id) { _, last in
                    if let last {
                        withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }
            Divider()
            composer
        }
        .navigationTitle(conversation.participant.name.isEmpty ? "Чат" : conversation.participant.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await poll() }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let sendError {
                Text(sendError).foregroundStyle(.red).font(.footnote)
            }
            HStack(alignment: .bottom) {
                TextField("Сообщение", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("chat.draft")
                Button {
                    Task { await send() }
                } label: {
                    if sending {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.up.circle.fill").font(.title2)
                    }
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Отправить")
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    /// Новые сообщения — опросом, пока экран открыт. Живое соединение (WebSocket
    /// по одноразовому билету) — следующим шагом; для переписки с куратором
    /// десяти секунд хватает.
    private func poll() async {
        while !Task.isCancelled {
            await load()
            try? await Task.sleep(for: .seconds(10))
        }
    }

    private func load() async {
        do {
            let page = try await session.api.send(Endpoint<[Message]>.get(
                "/api/v1/conversations/\(conversation.id)/messages",
                query: [URLQueryItem(name: "limit", value: "100")]))
            // Сервер отдаёт новые первыми, читать удобнее по порядку.
            messages = page.reversed()
            loadError = nil
            _ = try? await session.api.send(Endpoint<Empty>.post(
                "/api/v1/conversations/\(conversation.id)/read", body: [String: String]()))
        } catch is CancellationError {
            return
        } catch {
            loadError = error.userMessage
        }
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sending = true
        sendError = nil
        defer { sending = false }
        do {
            let message = try await session.api.send(Endpoint<Message>.post(
                "/api/v1/conversations/\(conversation.id)/messages",
                body: SendMessageRequest(type: "text", content: text)))
            messages.append(message)
            draft = ""
        } catch APIError.server(status: 403, code: "curator_access_required", _) {
            sendError = "Писать куратору можно при подключённом сопровождении."
        } catch {
            sendError = error.userMessage
        }
    }
}

private struct MessageBubble: View {
    let message: Message
    let isMine: Bool

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 40) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 2) {
                Text(preview(message))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(isMine ? Color.accentColor : Color(.secondarySystemBackground),
                                in: RoundedRectangle(cornerRadius: 16))
                    .foregroundStyle(isMine ? Color.white : Color.primary)
                if let date = message.createdAt {
                    Text(date.formatted(date: .omitted, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            if !isMine { Spacer(minLength: 40) }
        }
    }
}
