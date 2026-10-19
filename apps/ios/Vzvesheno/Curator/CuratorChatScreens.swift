import API
import Client
import Curator
import DesignSystem
import Navigation
import PhotosUI
import QuickLook
import SwiftUI
import UIKit

/// «Чаты» (`ios-curator-chat`): список переписок куратора.
struct ConversationListScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if let chats = model.curator?.chats {
                ConversationListContent(conversations: chats.sorted, loaded: chats.loaded, error: chats.error,
                                        calendar: model.curator?.calendar ?? DayCalendar(), now: Date(),
                                        onOpen: { open($0) }, onRetry: { Task { await chats.load() } },
                                        avatar: { CuratorProfileMenu() })
                .refreshable { await chats.load() }
                .task { if !chats.loaded { await chats.load() } }
            } else {
                LoadingView()
            }
        }
        .background(DS.Color.bgCanvas)
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("screen.chats")
    }

    private func open(_ conversation: CuratorConversation) {
        model.paths[.chats, default: []].append(.clientConversation(clientID: String(conversation.clientID)))
    }
}

/// Список переписок без модели.
struct ConversationListContent<Avatar: View>: View {
    let conversations: [CuratorConversation]
    let loaded: Bool
    let error: String?
    let calendar: DayCalendar
    let now: Date
    var onOpen: (CuratorConversation) -> Void = { _ in }
    var onRetry: () -> Void = {}
    @ViewBuilder var avatar: Avatar

    var body: some View {
        List {
            CuratorTitle(title: "Чаты") { avatar }.plainRow()
            if let error {
                LoadFailedView(text: error, retry: onRetry).plainRow()
            } else if loaded, conversations.isEmpty {
                Text("Переписок пока нет").dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted).plainRow()
            } else if !loaded {
                DSSpinner("Загружаем переписки").frame(maxWidth: .infinity).plainRow()
            }
            ForEach(Array(conversations.enumerated()), id: \.element.id) { index, conversation in
                Button { onOpen(conversation) } label: {
                    ConversationRow(conversation: conversation, time: conversation.lastMessage.map {
                        CuratorText.relative($0.createdAt, now: now, calendar: calendar)
                    })
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("conversation.\(conversation.clientID)")
                .cardRow(position: .of(index, conversations.count))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
        .background(DS.Color.bgCanvas)
    }
}

private struct ConversationRow: View {
    let conversation: CuratorConversation
    let time: String?

    var body: some View {
        HStack(spacing: DS.Space.s3) {
            InitialsAvatar(name: conversation.displayName, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline) {
                    Text(conversation.displayName).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
                    Spacer(minLength: DS.Space.s2)
                    if let time {
                        Text(time).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    }
                }
                HStack {
                    Text(conversation.preview)
                        .dsText(DS.Typography.callout)
                        .foregroundStyle(conversation.unreadCount > 0 ? DS.Color.fgDefault : DS.Color.fgMuted)
                        .lineLimit(1)
                    Spacer(minLength: DS.Space.s2)
                    if conversation.unreadCount > 0 {
                        Text("\(conversation.unreadCount)")
                            .font(.custom(DS.FontFamily.sans, size: 13, relativeTo: .footnote).weight(.semibold))
                            .foregroundStyle(DS.Color.primaryFg)
                            .padding(.horizontal, 7)
                            .frame(minWidth: 22, minHeight: 22)
                            .background(Capsule().fill(DS.Color.primaryDefault))
                            .accessibilityLabel("непрочитанных: \(conversation.unreadCount)")
                    }
                }
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Переписка куратора с клиентом: по id переписки (пуш) или по клиенту.
struct CuratorConversationScreen: View {
    @Environment(AppModel.self) private var model
    let reference: ConversationReference
    @State private var conversation: CuratorConversationModel?
    @State private var text = ""
    @State private var foodPhoto: ChatMessage?
    @State private var libraryItem: PhotosPickerItem?
    @State private var showLibrary = false
    @State private var preview: URL?

    var body: some View {
        Group {
            if let conversation {
                content(conversation)
            } else {
                LoadingView()
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let clientID = conversation?.clientID {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { openCard(clientID) } label: { Image(systemName: "person") }
                        .accessibilityLabel("Карточка клиента")
                        .accessibilityIdentifier("conversation.card")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen.curatorConversation")
        .task {
            guard conversation == nil, let curator = model.curator else { return }
            let loaded = CuratorConversationModel(api: model.api, reference: reference, curatorID: curator.curatorID,
                                                  calendar: curator.calendar)
            if case let .client(id) = reference { loaded.client = curator.hub?.client(id) }
            loaded.onRead = { [weak model] in Task { await model?.curator?.chats?.load() } }
            loaded.isVisible = true
            conversation = loaded
            curator.openConversation = loaded
            await loaded.load()
            if loaded.client == nil, let id = loaded.clientID { loaded.client = curator.hub?.client(id) }
            curator.visibleConversationID = loaded.conversation?.id
        }
        .onDisappear {
            conversation?.isVisible = false
            if model.curator?.visibleConversationID == conversation?.conversation?.id { model.curator?.visibleConversationID = nil }
        }
        .sheet(item: $foodPhoto) { photo in
            if let conversation {
                FoodEntrySheet(conversation: conversation, photo: photo) { foodPhoto = nil }
            }
        }
        .photosPicker(isPresented: $showLibrary, selection: $libraryItem, matching: .images)
        .onChange(of: libraryItem) { _, item in
            guard let item else { return }
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                libraryItem = nil
                guard let image = data.flatMap(UIImage.init(data:)), let jpeg = PhotoPreparation.jpeg(from: image) else { return }
                await conversation?.send(AttachmentDraft(data: jpeg, fileName: "photo.jpg", mimeType: "image/jpeg"))
            }
        }
        .quickLookPreview($preview)
        .alert(conversation?.notice ?? "", isPresented: Binding(get: { conversation?.notice != nil },
                                                               set: { if !$0 { conversation?.notice = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }

    @ViewBuilder
    private func content(_ conversation: CuratorConversationModel) -> some View {
        switch conversation.phase {
        case .loading:
            LoadingView()
        case .notFound:
            ConversationNotFoundView { if let id = conversation.clientID { openCard(id) } }
        case let .failed(message):
            LoadFailedView(text: message) { Task { await conversation.load() } }
                .frame(maxHeight: .infinity)
                .background(DS.Color.bgCanvas)
        case .chat:
            CuratorConversationContent(
                name: conversation.title, subtitle: conversation.subtitle, items: conversation.timeline,
                curatorID: conversation.curatorID, calendar: conversation.calendar, typing: conversation.typing,
                hasEarlier: conversation.hasEarlier, text: $text, sending: conversation.sending,
                actions: CuratorConversationActions(
                    send: {
                        let message = text
                        Task { if await conversation.send(message) { text = "" } }
                    },
                    attach: { showLibrary = true },
                    loadEarlier: { Task { await conversation.loadEarlier() } },
                    enterFood: { foodPhoto = $0 },
                    open: { message in
                        Task { preview = await AttachmentFiles.local(message, files: model.files, accountID: conversation.curatorID) }
                    }))
        }
    }

    private func openCard(_ clientID: Int64) {
        let tab = model.selectedTab ?? .chats
        model.paths[tab, default: []].append(.client(id: String(clientID), tab: nil))
    }
}

/// «Переписка с клиентом не найдена» — вместо вечной загрузки.
struct ConversationNotFoundView: View {
    let openCard: () -> Void

    var body: some View {
        VStack(spacing: DS.Space.s4) {
            Image(systemName: "bubble.left.and.exclamationmark.bubble.right").font(.system(size: 40))
                .foregroundStyle(DS.Color.fgSubtle).accessibilityHidden(true)
            Text(CuratorConversationModel.notFoundText)
                .dsText(DS.Typography.title3)
                .foregroundStyle(DS.Color.fgDefault)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("conversation.notFound")
            Button("Открыть карточку клиента", action: openCard)
                .buttonStyle(DSButtonStyle(.secondary, size: .medium))
                .accessibilityIdentifier("conversation.openCard")
        }
        .padding(DS.Space.screenX)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DS.Color.bgCanvas)
    }
}

struct CuratorConversationActions {
    var send: () -> Void = {}
    var attach: () -> Void = {}
    var loadEarlier: () -> Void = {}
    var enterFood: (ChatMessage) -> Void = { _ in }
    var open: (ChatMessage) -> Void = { _ in }
}

/// Переписка куратора без модели (макет CuratorChat.png): шапка с КБЖУ
/// клиента за сегодня, пузыри, «Ввести КБЖУ» под фото клиента, поле ответа.
struct CuratorConversationContent: View {
    let name: String
    let subtitle: String
    let items: [ChatTimelineItem]
    let curatorID: Int64
    let calendar: DayCalendar
    var typing = false
    var hasEarlier = false
    @Binding var text: String
    var sending = false
    var actions = CuratorConversationActions()

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: DS.Space.s3) {
                        if hasEarlier {
                            Color.clear.frame(height: 1)
                                .onScrollVisibilityChange(threshold: 0.01) { visible in if visible { actions.loadEarlier() } }
                                .accessibilityHidden(true)
                        }
                        ForEach(items) { item in
                            switch item {
                            case let .day(_, title): DayPill(title: title)
                            case let .message(message): bubble(message)
                            }
                        }
                        if typing { TypingBubble(label: "Клиент печатает") }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(.horizontal, DS.Space.s4)
                    .padding(.vertical, DS.Space.s4)
                }
                .scrollDismissesKeyboard(.interactively)
                .defaultScrollAnchor(.bottom)
                .onChange(of: items.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
                .accessibilityIdentifier("chat.messages")
            }
            Composer(text: $text, uploading: sending, onSend: actions.send, onAttach: actions.attach, onType: {})
        }
        .background(DS.Color.bgCanvas)
    }

    private var header: some View {
        VStack(spacing: 0) {
            HStack(spacing: DS.Space.s3) {
                InitialsAvatar(name: name, size: 40)
                VStack(alignment: .leading, spacing: 0) {
                    Text(name).dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                        .accessibilityIdentifier("conversation.name")
                    Text(typing ? "печатает…" : subtitle).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        .accessibilityIdentifier("conversation.subtitle")
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s2)
            Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
        }
    }

    @ViewBuilder
    private func bubble(_ message: ChatMessage) -> some View {
        let mine = message.senderID == curatorID
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            MessageBubble(message: message, mine: mine, calendar: calendar, otherName: "Клиент", onOpen: { actions.open(message) })
            if message.kind == .image, !mine {
                Button { actions.enterFood(message) } label: {
                    Label("Ввести КБЖУ", systemImage: "plus")
                        .dsText(DS.Typography.headline)
                        .foregroundStyle(DS.Color.primaryDefault)
                        .padding(.horizontal, DS.Space.s4)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(DS.Color.primarySoft))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("food.enter.\(message.id)")
            }
        }
    }
}

/// «Ввести КБЖУ» (макет CuratorKbju.png): приём — по времени фото в поясе
/// клиента; ошибка оставляет лист открытым с введённым.
struct FoodEntrySheet: View {
    let conversation: CuratorConversationModel
    let photo: ChatMessage
    let dismiss: () -> Void
    @State private var draft: FoodEntryDraft
    @State private var saving = false
    @State private var error: String?

    init(conversation: CuratorConversationModel, photo: ChatMessage, dismiss: @escaping () -> Void) {
        self.conversation = conversation
        self.photo = photo
        self.dismiss = dismiss
        _draft = State(initialValue: FoodEntryDraft(photoTime: photo.createdAt, calendar: conversation.clientCalendar))
    }

    var body: some View {
        FoodEntryContent(clientName: conversation.title, photoURL: photo.fileURL, draft: $draft, saving: saving, error: error,
                         onCancel: dismiss, onSave: save)
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationBackground(DS.Color.bgCanvas)
    }

    private func save() {
        saving = true
        error = nil
        Task {
            do {
                try await conversation.submitFoodEntry(draft, photo: photo)
                saving = false
                dismiss()
            } catch {
                saving = false
                self.error = ErrorMessages().message(for: error)
            }
        }
    }
}

/// Лист КБЖУ без модели.
struct FoodEntryContent: View {
    let clientName: String
    let photoURL: URL?
    @Binding var draft: FoodEntryDraft
    var saving = false
    var error: String?
    var onCancel: () -> Void = {}
    var onSave: () -> Void = {}

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                HStack {
                    Button("Отмена", action: onCancel)
                        .dsText(DS.Typography.headline).foregroundStyle(DS.Color.primaryDefault)
                        .accessibilityIdentifier("food.cancel")
                    Spacer()
                    Text("Запись для \(FoodEntryContent.genitive(clientName))")
                        .dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer()
                    Button("Готово", action: onSave)
                        .dsText(DS.Typography.headline)
                        .foregroundStyle(draft.isValid && !saving ? DS.Color.primaryDefault : DS.Color.fgMuted)
                        .disabled(!draft.isValid || saving)
                        .accessibilityIdentifier("food.done")
                }
                .padding(.top, DS.Space.s5)
                HStack(alignment: .top, spacing: DS.Space.s4) {
                    AttachmentImage(url: photoURL)
                        .frame(width: 64, height: 64)
                        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous))
                        .accessibilityHidden(true)
                    Text("Запись попадёт в дневник клиента с пометкой «Добавлено куратором», в чате появится карточка.")
                        .dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                SegmentBar(items: MealType.allCases, selection: $draft.meal, title: \.title, identifier: \.rawValue)
                group {
                    row("Блюдо") {
                        TextField("Например, омлет", text: $draft.name)
                            .multilineTextAlignment(.trailing)
                            .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .body).weight(.medium))
                            .accessibilityIdentifier("food.name")
                    }
                    divider
                    numberRow("Вес, г", $draft.weight, id: "food.weight")
                }
                group {
                    numberRow("Калории", $draft.calories, id: "food.calories")
                    divider
                    numberRow("Белки, г", $draft.protein, color: DS.Color.macroProteinFg, id: "food.protein")
                    divider
                    numberRow("Жиры, г", $draft.fat, color: DS.Color.macroFatFg, id: "food.fat")
                    divider
                    numberRow("Углеводы, г", $draft.carbs, color: DS.Color.macroCarbsFg, id: "food.carbs")
                }
                if let error {
                    Text(error).dsText(DS.Typography.callout).foregroundStyle(DS.Color.statusDangerFg)
                        .accessibilityIdentifier("food.error")
                }
                Button(action: onSave) {
                    if saving { ProgressView().tint(DS.Color.primaryFg) } else { Text("Записать в дневник") }
                }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(!draft.isValid || saving)
                .accessibilityIdentifier("food.submit")
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.bottom, DS.Space.s6)
        }
        .background(DS.Color.bgCanvas)
        .accessibilityIdentifier("sheet.foodEntry")
    }

    /// Имя в родительном падеже: «Марии», «Анны», «Ольги», «Дениса», «Сергея».
    /// Имя на «ь» (Игорь, Любовь) по одному слову не просклонять — «клиента».
    static func genitive(_ name: String) -> String {
        guard let first = name.split(separator: " ").first.map(String.init), let last = first.last else { return "клиента" }
        let stem = String(first.dropLast())
        switch last {
        case "я":
            return stem + "и"
        case "а":
            return stem + ("гкхжчшщ".contains(stem.last ?? " ") ? "и" : "ы")
        case "й":
            return stem + "я"
        case "ь", ".":
            return "клиента"
        default:
            return last.isLetter ? first + "а" : "клиента"
        }
    }

    private var divider: some View { Rectangle().fill(DS.Color.lineDefault).frame(height: 1) }

    private func group<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        CuratorCard(padding: 0) { VStack(spacing: 0) { content() } }
    }

    private func row<Field: View>(_ title: String, color: Color = DS.Color.fgDefault, @ViewBuilder field: () -> Field) -> some View {
        HStack {
            Text(title).dsText(DS.Typography.body).foregroundStyle(color)
            Spacer(minLength: DS.Space.s3)
            field()
        }
        .padding(.horizontal, DS.Space.s4)
        .frame(minHeight: 48)
    }

    private func numberRow(_ title: String, _ value: Binding<String>, color: Color = DS.Color.fgDefault, id: String) -> some View {
        row(title, color: color) {
            TextField("0", text: value)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .body).weight(.semibold))
                .monospacedDigit()
                .accessibilityLabel(title)
                .accessibilityIdentifier(id)
        }
    }
}
