import Client
import DesignSystem
import SwiftUI

/// Что экран переписки просит у владельца.
struct ChatActions {
    var send: () -> Void = {}
    var attach: () -> Void = {}
    var loadEarlier: () -> Void = {}
    var open: (ChatMessage) -> Void = { _ in }
    var typed: () -> Void = {}
    var dismissFailed: (UUID) -> Void = { _ in }
}

/// Переписка с куратором без модели (макет Chat.png): шапка с именем и
/// «печатает…», лента с разделителями дней, пузыри текста, фото, файла и
/// карточки «Записано в дневник», поле сообщения.
struct ChatContent: View {
    let curatorName: String
    let typing: Bool
    let items: [ChatTimelineItem]
    let pending: [PendingChatMessage]
    /// Кто вошёл: свои сообщения — справа.
    let userID: Int64
    let calendar: DayCalendar
    let canSend: Bool
    let expiredNotice: String?
    let hasEarlier: Bool
    @Binding var text: String
    var uploading = false
    var actions = ChatActions()

    var body: some View {
        VStack(spacing: 0) {
            ChatHeader(name: curatorName, typing: typing)
            ScrollViewReader { proxy in
                ScrollView {
                    // Не ленивый: аудит Dynamic Type не видел роста текста в
                    // ленивых ячейках; 50–100 сообщений — без потерь.
                    VStack(spacing: DS.Space.s3) {
                        if hasEarlier {
                            // Начало переписки на экране — следующие 50 (видимость в
                            // прокрутке, а не onAppear: стопка не ленивая).
                            Color.clear.frame(height: 1)
                                .onScrollVisibilityChange(threshold: 0.01) { visible in if visible { actions.loadEarlier() } }
                                .accessibilityHidden(true)
                        }
                        ForEach(items) { item in
                            switch item {
                            case let .day(_, title): DayPill(title: title)
                            case let .message(message):
                                MessageBubble(message: message, mine: message.senderID == userID, calendar: calendar,
                                              onOpen: { actions.open(message) })
                            }
                        }
                        ForEach(pending) { item in
                            PendingBubble(item: item, onDismiss: { actions.dismissFailed(item.id) })
                        }
                        if typing {
                            TypingBubble()
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(.horizontal, DS.Space.s4)
                    .padding(.vertical, DS.Space.s4)
                }
                .scrollDismissesKeyboard(.interactively)
                .defaultScrollAnchor(.bottom)
                .onChange(of: items.count + pending.count) { _, _ in
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                }
                .accessibilityIdentifier("chat.messages")
            }
            if let expiredNotice {
                Text(expiredNotice)
                    .dsText(DS.Typography.callout)
                    .foregroundStyle(DS.Color.fgMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(DS.Space.s4)
                    .background(DS.Color.bgSubtle)
                    .accessibilityIdentifier("chat.expired")
            } else if canSend {
                Composer(text: $text, uploading: uploading, onSend: actions.send, onAttach: actions.attach, onType: actions.typed)
            }
        }
        .background(DS.Color.bgCanvas)
    }
}

private struct ChatHeader: View {
    let name: String
    let typing: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: DS.Space.s3) {
                Text(verbatim: name.first.map { String($0).uppercased() } ?? "К")
                    .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .headline).weight(.semibold))
                    .foregroundStyle(DS.Color.coachFg)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(DS.Color.coachBg))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text(name)
                        .dsText(DS.Typography.title3)
                        .foregroundStyle(DS.Color.fgDefault)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("chat.curator")
                    Text(typing ? "куратор · печатает…" : "куратор")
                        .dsText(DS.Typography.caption)
                        .foregroundStyle(DS.Color.fgMuted)
                        .accessibilityIdentifier("chat.status")
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s2)
            Rectangle().fill(DS.Color.lineDefault).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

struct DayPill: View {
    let title: String

    var body: some View {
        Text(title)
            .dsText(DS.Typography.caption)
            .foregroundStyle(DS.Color.fgMuted)
            .padding(.horizontal, DS.Space.s3)
            .padding(.vertical, DS.Space.s1)
            .background(Capsule().fill(DS.Color.bgSubtle))
            .frame(maxWidth: .infinity)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Пузырь сообщения: свой — справа, цвета действия; куратора — слева, на поверхности.
struct MessageBubble: View {
    let message: ChatMessage
    let mine: Bool
    let calendar: DayCalendar
    /// Кто собеседник для VoiceOver: «Куратор» у клиента, «Клиент» у куратора.
    var otherName = "Куратор"
    let onOpen: () -> Void

    var body: some View {
        HStack {
            if mine { Spacer(minLength: 56) }
            bubble
            if !mine { Spacer(minLength: 56) }
        }
        .accessibilityIdentifier("message.\(message.id)")
    }

    private var time: String { ChatTimeline.time(message.createdAt, calendar: calendar) }

    @ViewBuilder
    private var bubble: some View {
        switch message.kind {
        case .image:
            Button(action: onOpen) {
                AttachmentImage(url: message.fileURL)
                    .frame(width: 200, height: 116)
                    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous))
                    .overlay(alignment: .bottomTrailing) {
                        Text(time).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgDefault)
                            .padding(.horizontal, DS.Space.s2).padding(.vertical, 2)
                            .background(Capsule().fill(DS.Color.bgSurface.opacity(0.9)))
                            .padding(DS.Space.s2)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Фото, \(time)")
            .accessibilityHint("Открыть просмотр")
        case .file:
            Button(action: onOpen) {
                textBubble {
                    Label(message.fileName, systemImage: "doc")
                        .dsText(DS.Typography.body)
                        .foregroundStyle(mine ? DS.Color.primaryFg : DS.Color.fgDefault)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Файл \(message.fileName), \(time)")
            .accessibilityHint("Открыть просмотр")
        case .foodEntry:
            if let card = message.foodEntry {
                FoodEntryBubble(card: card)
            } else {
                textBubble { Text(message.content ?? "").dsText(DS.Typography.body) }
            }
        case .text:
            textBubble {
                Text(message.content ?? "")
                    .dsText(DS.Typography.body)
                    .foregroundStyle(mine ? DS.Color.primaryFg : DS.Color.fgDefault)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(mine ? "Вы" : otherName): \(message.content ?? ""), \(time)")
        }
    }

    private func textBubble<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        return VStack(alignment: .trailing, spacing: 2) {
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(time)
                .dsText(DS.Typography.caption)
                .foregroundStyle(mine ? DS.Color.primaryFg : DS.Color.fgMuted)
                .accessibilityHidden(true)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(shape.fill(mine ? DS.Color.primaryDefault : DS.Color.bgSurface))
        .overlay(shape.strokeBorder(mine ? Color.clear : DS.Color.lineDefault))
    }
}

/// «Записано в дневник · обед», «Куриная грудка, 150 г», «229 ккал · Б 46 · Ж 5 · У 0».
private struct FoodEntryBubble: View {
    let card: FoodEntryCard

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            Text(card.caption).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
            Text(card.title).dsText(DS.Typography.headline).foregroundStyle(DS.Color.fgDefault)
            HStack(spacing: 4) {
                Text("\(NumberText.grouped(NumberText.jsRound(card.calories))) ккал")
                    .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout).weight(.semibold))
                    .foregroundStyle(DS.Color.fgDefault)
                Text("· Б \(NumberText.jsRound(card.protein))").foregroundStyle(DS.Color.macroProteinFg)
                Text("· Ж \(NumberText.jsRound(card.fat))").foregroundStyle(DS.Color.macroFatFg)
                Text("· У \(NumberText.jsRound(card.carbs))").foregroundStyle(DS.Color.macroCarbsFg)
            }
            .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout))
            .monospacedDigit()
        }
        .padding(DS.Space.s4)
        .frame(maxWidth: 280, alignment: .leading)
        .background(shape.fill(DS.Color.bgSurface))
        .overlay(shape.strokeBorder(DS.Color.lineDefault))
        .accessibilityElement(children: .combine)
    }
}

private struct PendingBubble: View {
    let item: PendingChatMessage
    let onDismiss: () -> Void

    var body: some View {
        HStack {
            Spacer(minLength: 56)
            VStack(alignment: .trailing, spacing: 2) {
                Text(item.text)
                    .dsText(DS.Typography.body)
                    .foregroundStyle(DS.Color.primaryFg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                switch item.status {
                case .waiting:
                    Label("ждёт отправки", systemImage: "clock")
                        .dsText(DS.Typography.micro)
                        .foregroundStyle(DS.Color.primaryFg)
                case let .failed(reason):
                    Button(reason, action: onDismiss)
                        .dsText(DS.Typography.micro)
                        .foregroundStyle(DS.Color.primaryFg)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.primaryHover))
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("message.pending")
    }
}

struct TypingBubble: View {
    var label = "Куратор печатает"

    var body: some View {
        HStack {
            HStack(spacing: 5) {
                ForEach(0..<3) { index in
                    Circle().fill(index == 0 ? DS.Color.fgMuted : DS.Color.fgSubtle).frame(width: 7, height: 7)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Capsule().fill(DS.Color.bgSurface))
            .overlay(Capsule().strokeBorder(DS.Color.lineDefault))
            Spacer()
        }
        .accessibilityElement()
        .accessibilityLabel(label)
    }
}

/// Поле сообщения: «+» (камера, Фото, Файлы) и отправка.
struct Composer: View {
    @Binding var text: String
    var placeholder = "Сообщение"
    let uploading: Bool
    let onSend: () -> Void
    let onAttach: () -> Void
    let onType: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: DS.Space.s3) {
            Button(action: onAttach) {
                Image(systemName: uploading ? "hourglass" : "plus")
                    .font(.system(.title2))
                    .foregroundStyle(DS.Color.fgDefault)
                    .frame(width: DS.Size.control, height: DS.Size.control)
                    .background(Circle().fill(DS.Color.bgSubtle))
            }
            .buttonStyle(.plain)
            .disabled(uploading)
            .accessibilityLabel("Вложение")
            .accessibilityHint("Камера, фото или файл")
            .accessibilityIdentifier("chat.attach")
            HStack(alignment: .bottom, spacing: DS.Space.s2) {
                TextField(placeholder, text: $text, axis: .vertical)
                    .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .body))
                    .foregroundStyle(DS.Color.fgDefault)
                    .lineLimit(1...5)
                    .padding(.vertical, 12)
                    .onChange(of: text) { _, _ in onType() }
                    .accessibilityIdentifier("chat.input")
                Button(action: onSend) {
                    Image(systemName: "arrow.up")
                        .font(.system(.body).weight(.semibold))
                        .foregroundStyle(DS.Color.primaryFg)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                                  ? DS.Color.fgDisabled : DS.Color.primaryDefault))
                }
                .buttonStyle(.plain)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .padding(.bottom, 6)
                .accessibilityLabel("Отправить")
                .accessibilityIdentifier("chat.send")
            }
            .padding(.leading, DS.Space.s4)
            .padding(.trailing, 6)
            .background(Capsule().fill(DS.Color.bgSurface))
            .overlay(Capsule().strokeBorder(DS.Color.lineDefault))
        }
        .padding(.horizontal, DS.Space.s4)
        .padding(.vertical, DS.Space.s2)
        .background(DS.Color.bgCanvas)
    }
}

/// Изображение вложения; пока грузится — заглушка поверхности.
struct AttachmentImage: View {
    let url: URL?

    var body: some View {
        // Фото переписки — в кэше аккаунта: без сети видно, выход стирает.
        CachedImage(url: url, scope: .account) {
            Rectangle().fill(DS.Color.bgSubtle)
        }
    }
}

/// «Работа с куратором» без доступа (App Review 3.1.1(a) и 3.1.3): без цены,
/// без заявки, без ссылок на сайт — описание и «Написать в поддержку».
struct CuratorAccessContent: View {
    enum Kind {
        /// Доступа нет.
        case noAccess
        /// Доступ есть, куратор не назначен.
        case noCurator
    }

    let kind: Kind
    let onSupport: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                Image(systemName: kind == .noAccess ? "person.2" : "hourglass")
                    .font(.system(size: 40))
                    .foregroundStyle(DS.Color.primaryDefault)
                    .accessibilityHidden(true)
                Text(title)
                    .dsText(DS.Typography.title1)
                    .foregroundStyle(DS.Color.fgDefault)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("curatorAccess.title")
                ForEach(paragraphs, id: \.self) { paragraph in
                    Text(paragraph)
                        .dsText(DS.Typography.body)
                        .foregroundStyle(DS.Color.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button("Написать в поддержку", action: onSupport)
                    .buttonStyle(DSButtonStyle(.secondary))
                    .padding(.top, DS.Space.s2)
                    .accessibilityIdentifier("curatorAccess.support")
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s6)
        }
        .background(DS.Color.bgCanvas)
        .accessibilityIdentifier("screen.curatorAccess")
    }

    private var title: String {
        kind == .noAccess ? "Работа с куратором" : "Куратор пока не назначен"
    }

    private var paragraphs: [String] {
        switch kind {
        case .noAccess:
            return ["Куратор — живой специалист, который ведёт вас лично: смотрит дневник питания, отвечает в переписке и "
                    + "помогает держать норму без срывов.",
                    "Здесь появится переписка с вашим куратором. Если у вас есть вопрос о работе с куратором — напишите в поддержку."]
        case .noCurator:
            return ["Мы подбираем вам куратора. Как только он будет назначен, переписка появится здесь.",
                    "Если ждёте дольше суток — напишите в поддержку."]
        }
    }
}
