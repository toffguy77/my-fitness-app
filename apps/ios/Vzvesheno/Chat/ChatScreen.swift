import Client
import Outbox
import DesignSystem
import PhotosUI
import QuickLook
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Переписка с куратором (`ios-client-chat`): значок в шапке «Сегодня»,
/// карточка куратора, пуш. Таббара и панели «Записать еду» здесь нет — низ
/// занимает поле сообщения.
struct ChatScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var text = ""
    @State private var choosingAttachment = false
    @State private var showCamera = false
    @State private var showLibrary = false
    @State private var showFiles = false
    @State private var libraryItem: PhotosPickerItem?
    @State private var preview: URL?

    var body: some View {
        Group {
            if let chat = model.chat {
                content(chat)
            } else {
                LoadingView()
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        // Контейнер: иначе идентификатор экрана достаётся кнопкам и тексту внутри.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen.chat")
        .task {
            model.chat?.isVisible = true
            await model.chat?.load()
        }
        .onDisappear { model.chat?.isVisible = false }
        .confirmationDialog("Вложение", isPresented: $choosingAttachment) {
            Button("Камера") {
                if UIImagePickerController.isSourceTypeAvailable(.camera) { showCamera = true } else { showLibrary = true }
            }
            Button("Фото") { showLibrary = true }
            Button("Файл") { pickFile() }
            Button("Отмена", role: .cancel) {}
        }
        .photosPicker(isPresented: $showLibrary, selection: $libraryItem, matching: .images)
        .onChange(of: libraryItem) { _, item in
            guard let item else { return }
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                libraryItem = nil
                await sendImage(data.flatMap(UIImage.init(data:)))
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                Task { await sendImage(image) }
            }
            .ignoresSafeArea()
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .jpeg, .png]) { result in
            guard case let .success(url) = result else { return }
            Task { await sendFile(url) }
        }
        .quickLookPreview($preview)
        .alert("Переписка", isPresented: Binding(get: { model.chat?.notice != nil }, set: { if !$0 { model.chat?.notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.chat?.notice ?? "")
        }
    }

    @ViewBuilder
    private func content(_ chat: ChatModel) -> some View {
        switch chat.phase {
        case .loading:
            LoadingView()
        case .noAccess:
            CuratorAccessContent(kind: .noAccess, onSupport: { openSupport() })
        case .noCurator:
            CuratorAccessContent(kind: .noCurator, onSupport: { openSupport() })
        case let .failed(message):
            VStack(spacing: DS.Space.s4) {
                if chat.offline { OfflineEmptyView(text: "Сохранённой переписки пока нет. Она загрузится, когда появится сеть.") }
                if !chat.offline {
                    Text(message).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgMuted).multilineTextAlignment(.center)
                }
                Button("Повторить") { Task { await chat.load() } }.buttonStyle(DSButtonStyle(.secondary))
            }
            .padding(DS.Space.screenX)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(DS.Color.bgCanvas)
        case .chat:
            VStack(spacing: 0) {
                FreshnessBanner(offline: chat.offline, updatedLabel: chat.updatedLabel)
                    .padding(.horizontal, DS.Space.screenX)
                ChatContent(curatorName: chat.curatorName, typing: chat.curatorTyping, items: chat.timeline, pending: chat.pending,
                            userID: chat.userID, calendar: chat.calendar, canSend: chat.canSend, expiredNotice: chat.expiredNotice,
                            hasEarlier: chat.hasEarlier, text: $text, uploading: chat.uploading, actions: ChatActions(
                                send: {
                                    let message = text
                                    text = ""
                                    Task { await chat.send(message) }
                                },
                                attach: { choosingAttachment = true },
                                loadEarlier: { Task { await chat.loadEarlier() } },
                                open: { message in
                                    Task { preview = await AttachmentFiles.local(message, files: model.files, accountID: chat.userID) }
                                },
                                typed: { chat.userTyped() },
                                dismissFailed: { chat.dismissFailed($0) }))
            }
        }
    }

    private func openSupport() {
        let raw = model.config?.supportURL ?? "mailto:support@burcev.team"
        if let url = URL(string: raw) { openURL(url) }
    }

    /// «Файл»: в сценарии UI-теста — готовый файл нужного размера
    /// (`-uiTestPickFile 14mb`): системного выбора файлов тест не видит.
    private func pickFile() {
        #if DEBUG
        if let size = UITestScenario.argument("-uiTestPickFile").flatMap({ Int($0.dropLast(2)) }) {
            let draft = AttachmentDraft(data: Data(count: size * 1024 * 1024), fileName: "анализы.pdf", mimeType: "application/pdf")
            Task { await model.chat?.send(draft) }
            return
        }
        #endif
        showFiles = true
    }

    /// Снимок готовится как в распознавании еды: JPEG 0,8, до 1280 px, без EXIF.
    private func sendImage(_ image: UIImage?) async {
        guard let image, let jpeg = PhotoPreparation.jpeg(from: image) else { return }
        await model.chat?.send(AttachmentDraft(data: jpeg, fileName: "photo.jpg", mimeType: "image/jpeg"))
    }

    private func sendFile(_ url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        // Размер — до чтения: 14 МБ в память ради отказа читать незачем.
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if size > AttachmentDraft.maxBytes {
            model.chat?.notice = AttachmentDraft.tooLargeMessage
            return
        }
        guard let data = try? Data(contentsOf: url) else { return }
        let type = UTType(filenameExtension: url.pathExtension)
        if type?.conforms(to: .image) == true, let image = UIImage(data: data) {
            await sendImage(image)
            return
        }
        await model.chat?.send(AttachmentDraft(data: data, fileName: url.lastPathComponent,
                                               mimeType: type?.preferredMIMEType ?? "application/pdf"))
    }
}

/// Вложение для QuickLook: только с проверенного адреса (`TrustedMedia` —
/// в `ChatMessage.fileURL`), в каталоге аккаунта
/// `attachments/<аккаунт>/<сообщение>/<имя>`; выход каталог стирает. Имя от
/// сервера очищено и служит только заголовком просмотра.
enum AttachmentFiles {
    static func local(_ message: ChatMessage, files: AccountFiles, accountID: Int64) async -> URL? {
        guard let remote = message.fileURL else { return nil }
        let name = message.kind == .image ? "Фото.jpg" : message.fileName
        guard let target = files.attachment(accountID: accountID, messageID: message.id, displayName: name) else { return nil }
        if FileManager.default.fileExists(atPath: target.path) { return target }
        guard let (data, response) = try? await URLSession.shared.data(from: remote),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        try? FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard (try? ProtectedFiles.write(data, to: target)) != nil else { return nil }
        return target
    }
}
