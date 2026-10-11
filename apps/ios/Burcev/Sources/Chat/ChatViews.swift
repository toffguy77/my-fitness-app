import SwiftUI
import PhotosUI

struct ConversationsView: View {
    @Environment(SessionStore.self) private var session
    @State private var content: Loadable<[Conversation]> = .loading
    @State private var path: [Conversation] = []
    /// Для клиента — есть ли оплаченное сопровождение. Без него переписки нет,
    /// как и на сайте: вместо неё предложение подключить куратора.
    @State private var access: ConversationAccess?

    private var isClient: Bool { session.user?.role == .client }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if isClient, let access, !access.allowed {
                    CuratorOfferView(expired: access.expired, source: "curator_offer_chat")
                } else {
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
        if isClient {
            access = try? await session.api.send(Endpoint<ConversationAccess>.get("/api/v1/conversations/access"))
            if access?.allowed == false { return }
        }
        do {
            let conversations = try await session.api.send(Endpoint<[Conversation]>.get("/api/v1/conversations"))
            content = .loaded(conversations)
            if Demo.screen == .chat, path.isEmpty, let first = conversations.first {
                path = [first]
            }
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
    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var loggingFood: Message?

    private var isCurator: Bool { session.user?.role == .coordinator }

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
                                .contextMenu {
                                    if isCurator, message.imageURL != nil, message.sender_id != session.user?.id {
                                        Button("Записать в дневник клиента", systemImage: "fork.knife") { loggingFood = message }
                                    }
                                    if let text = message.content, message.type == "text" {
                                        Button("Скопировать", systemImage: "doc.on.doc") { UIPasteboard.general.string = text }
                                    }
                                }
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
        .onChange(of: session.socket.lastMessage) { _, message in
            guard let message, message.conversation_id == conversation.id,
                  !messages.contains(where: { $0.id == message.id }) else { return }
            messages.append(message)
            Task { await markRead() }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    await sendPhoto(image)
                }
                pickerItem = nil
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                if let image { Task { await sendPhoto(image) } }
            }
            .ignoresSafeArea()
        }
        .sheet(item: $loggingFood) { message in
            CuratorFoodEntrySheet(conversationID: conversation.id, message: message) { logged in
                messages.append(logged)
            }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let sendError {
                Text(sendError).foregroundStyle(.red).font(.footnote)
            }
            HStack(alignment: .bottom) {
                Menu {
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Снять фото", systemImage: "camera") { showCamera = true }
                    }
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label("Выбрать фото", systemImage: "photo")
                    }
                } label: {
                    Image(systemName: "paperclip").font(.title3)
                }
                .disabled(sending)
                .accessibilityLabel("Прикрепить фото")
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

    /// Новые сообщения приходят по живому соединению; опрос раз в 30 секунд —
    /// запасной путь, если соединение не поднялось.
    private func poll() async {
        while !Task.isCancelled {
            await load()
            try? await Task.sleep(for: .seconds(30))
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
            await markRead()
        } catch is CancellationError {
            return
        } catch {
            loadError = error.userMessage
        }
    }

    private func markRead() async {
        _ = try? await session.api.send(Endpoint<Empty>.post(
            "/api/v1/conversations/\(conversation.id)/read", body: [String: String]()))
        await session.socket.refreshUnread()
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        await deliver(SendMessageRequest(type: "text", content: text)) { draft = "" }
    }

    /// Как на сайте: файл загружается отдельно, сообщение ссылается на него.
    private func sendPhoto(_ image: UIImage) async {
        guard let jpeg = image.jpegForUpload(maxSide: 2048) else { return }
        sending = true
        defer { sending = false }
        do {
            struct Uploaded: Decodable, Sendable { let file_url: String }
            let file = try await session.api.send(Endpoint<Uploaded>.upload(
                "/api/v1/conversations/\(conversation.id)/upload", field: "file", filename: "photo.jpg",
                mimeType: "image/jpeg", data: jpeg))
            await deliver(SendMessageRequest(type: "image", content: file.file_url)) {}
        } catch {
            sendError = describe(error)
        }
    }

    private func deliver(_ request: SendMessageRequest, onSuccess: () -> Void) async {
        sending = true
        sendError = nil
        defer { sending = false }
        do {
            let message = try await session.api.send(Endpoint<Message>.post(
                "/api/v1/conversations/\(conversation.id)/messages", body: request))
            if !messages.contains(where: { $0.id == message.id }) { messages.append(message) }
            onSuccess()
        } catch {
            sendError = describe(error)
        }
    }

    private func describe(_ error: Error) -> String {
        if case APIError.server(status: 403, code: "curator_access_required", _) = error {
            return "Писать куратору можно при подключённом сопровождении."
        }
        return error.userMessage
    }
}

private struct MessageBubble: View {
    let message: Message
    let isMine: Bool

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 40) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 2) {
                if let url = message.imageURL {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        RoundedRectangle(cornerRadius: 16).fill(.quaternary).frame(width: 200, height: 160)
                    }
                    .frame(maxWidth: 240, maxHeight: 320)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                } else {
                    Text(preview(message))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(isMine ? Color.accentColor : Color(.secondarySystemBackground),
                                    in: RoundedRectangle(cornerRadius: 16))
                        .foregroundStyle(isMine ? Color.white : Color.primary)
                }
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

/// Куратор записывает блюдо с фото клиента в его дневник — как форма
/// «Записать в дневник» у фото на сайте.
struct CuratorFoodEntrySheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let conversationID: String
    let message: Message
    let onLogged: (Message) -> Void

    @State private var name = ""
    @State private var meal: MealType = .lunch
    @State private var weight: Double?
    @State private var calories: Double?
    @State private var protein: Double?
    @State private var fat: Double?
    @State private var carbs: Double?
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                if let url = message.imageURL {
                    AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }
                        .frame(maxHeight: 200)
                }
                Section {
                    TextField("Блюдо", text: $name)
                    Picker("Приём пищи", selection: $meal) {
                        ForEach(MealType.allCases) { Text($0.title).tag($0) }
                    }
                    field("Вес, г", $weight)
                }
                Section("На всю порцию") {
                    field("Калории", $calories)
                    field("Белки, г", $protein)
                    field("Жиры, г", $fat)
                    field("Углеводы, г", $carbs)
                }
                if let errorText { Text(errorText).foregroundStyle(.red) }
            }
            .navigationTitle("В дневник клиента")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Записать") { Task { await save() } }.disabled(!valid)
                }
            }
        }
    }

    /// Сервер требует все поля ненулевыми.
    private var valid: Bool {
        !name.isEmpty && [weight, calories, protein, fat, carbs].allSatisfy { ($0 ?? 0) > 0 }
    }

    private func field(_ title: String, _ value: Binding<Double?>) -> some View {
        TextField(title, value: value, format: .number.precision(.fractionLength(0...1))).keyboardType(.decimalPad)
    }

    private func save() async {
        struct Body: Encodable {
            let food_name: String, meal_type: String
            let weight: Double, calories: Double, protein: Double, fat: Double, carbs: Double
        }
        do {
            let logged = try await session.api.send(Endpoint<Message>.post(
                "/api/v1/conversations/\(conversationID)/messages/\(message.id)/food-entry",
                body: Body(food_name: name, meal_type: meal.rawValue, weight: weight ?? 0, calories: calories ?? 0,
                           protein: protein ?? 0, fat: fat ?? 0, carbs: carbs ?? 0)))
            onLogged(logged)
            dismiss()
        } catch {
            errorText = error.userMessage
        }
    }
}

/// Предложение подключить или продлить куратора — как CuratorOffer на сайте.
struct CuratorOfferView: View {
    @Environment(SessionStore.self) private var session
    let expired: Bool
    let source: String

    @State private var sent = false
    @State private var errorText: String?

    var body: some View {
        ContentUnavailableView {
            Label(expired ? "Сопровождение закончилось" : "Куратор не подключён",
                  systemImage: "person.crop.circle.badge.questionmark")
        } description: {
            Text(expired
                 ? "Переписка с куратором доступна при активном сопровождении. Оставьте заявку — с вами свяжутся и продлят."
                 : "Куратор видит ваш дневник, отвечает в чате и ведёт по плану. Оставьте заявку — с вами свяжутся.")
        } actions: {
            Button(sent ? "Заявка отправлена" : (expired ? "Продлить сопровождение" : "Хочу куратора")) {
                Task { await request() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(sent)
            if let errorText { Text(errorText).foregroundStyle(.red).font(.footnote) }
        }
    }

    private func request() async {
        do {
            _ = try await session.api.send(Endpoint<Empty>.post("/api/v1/leads/curator-request",
                                                                body: CuratorRequest(capture_source: source)))
            sent = true
            errorText = nil
        } catch {
            errorText = error.userMessage
        }
    }
}
