import Client
import DesignSystem
import Navigation
import PhotosUI
import SwiftUI
import UIKit

/// «Сегодня» клиента: модель из `AppModel`, листы ручного ввода, фото и отчёт.
struct TodayScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    let offline: Bool

    @State private var editor: TodayEditor?
    @State private var pendingWorkoutTask: TaskRow?
    @State private var reportResult: WeeklyReportResult?
    @State private var showCamera = false
    @State private var showLibrary = false
    @State private var libraryItem: PhotosPickerItem?
    @State private var photoError: String?

    var body: some View {
        ScrollView {
            if let today = model.today {
                TodayContent(state: today.state, avatarInitial: model.avatarInitial, offline: offline,
                             healthHint: model.healthAccessHint, actions: actions(today))
                    .padding(.top, DS.Space.s2)
            }
        }
        .background(DS.Color.bgCanvas)
        .refreshable { await model.today?.load() }
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("screen.today")
        .sheet(item: $editor) { editor in
            TodayEditorSheet(editor: editor) { result in
                Task { await save(result) }
            }
            .presentationDetents([.medium])
        }
        .alert("Недельный отчёт", isPresented: Binding(get: { reportResult != nil }, set: { if !$0 { reportResult = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(reportText)
        }
        .alert("Фото недели", isPresented: Binding(get: { photoError != nil }, set: { if !$0 { photoError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(photoError ?? "")
        }
        .alert("Не сохранилось", isPresented: Binding(get: { model.today?.notice != nil },
                                                     set: { if !$0 { model.today?.notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.today?.notice ?? "")
        }
        .photosPicker(isPresented: $showLibrary, selection: $libraryItem, matching: .images)
        .onChange(of: libraryItem) { _, item in
            guard let item else { return }
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                libraryItem = nil
                await upload(data.flatMap(UIImage.init(data:)))
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                Task { await upload(image) }
            }
            .ignoresSafeArea()
        }
    }

    private func actions(_ today: TodayModel) -> TodayActions {
        TodayActions(
            selectDay: { day in Task { await today.select(day) } },
            openNotifications: { push(.notifications) },
            openChat: { push(.curatorChat) },
            openProfile: { push(.profile) },
            addGlass: { Task { await today.addGlass() } },
            editSteps: { editor = .steps(current: today.snapshot?.day.steps) },
            editWeight: { editor = .weight(current: today.snapshot?.day.weight) },
            editWorkout: { editor = .workout(task: nil) },
            toggleTask: { row in
                if row.needsWorkout {
                    editor = .workout(task: row.id)
                } else {
                    Task { await today.completeTask(row.id) }
                }
            },
            takeWeekPhoto: {
                if UIImagePickerController.isSourceTypeAvailable(.camera) { showCamera = true } else { showLibrary = true }
            },
            pickWeekPhoto: { showLibrary = true },
            sendWeeklyReport: { Task { reportResult = await today.submitWeeklyReport() } },
            fillProfile: { push(.profile) },
            openHealthSettings: {
                if let url = URL(string: "x-apple-health://") { openURL(url) }
            }
        )
    }

    private func push(_ destination: Destination) {
        model.paths[.today, default: []].append(destination)
    }

    private func save(_ result: TodayEditor.Result) async {
        guard let today = model.today else { return }
        switch result {
        case let .steps(value): await today.saveSteps(value)
        case let .weight(value): await today.saveWeight(value)
        case let .workout(kind, minutes, task):
            if let task {
                await today.completeTask(task, workout: (kind: kind, minutes: minutes))
            } else {
                await today.saveWorkout(kind: kind, minutes: minutes)
            }
        }
    }

    private func upload(_ image: UIImage?) async {
        guard let image, let jpeg = PhotoPreparation.jpeg(from: image) else {
            photoError = "Не получилось прочитать снимок. Попробуйте другой."
            return
        }
        do {
            try await model.today?.uploadWeekPhoto(jpeg: jpeg)
        } catch {
            photoError = model.messages.message(for: error)
        }
    }

    private var reportText: String {
        switch reportResult {
        case .sent: return "Отчёт отправлен куратору."
        case let .incomplete(problems): return "Чтобы отправить отчёт, не хватает:\n" + problems.map { "• \($0)" }.joined(separator: "\n")
        case let .failed(error): return model.messages.message(for: error)
        case nil: return ""
        }
    }
}

/// Лист ручного ввода: шаги, вес или тренировка.
enum TodayEditor: Identifiable {
    case steps(current: Int?)
    case weight(current: Double?)
    /// `task` — задача-тренировка: после сохранения она выполнена.
    case workout(task: String?)

    var id: String {
        switch self {
        case .steps: return "steps"
        case .weight: return "weight"
        case let .workout(task): return "workout-\(task ?? "")"
        }
    }

    enum Result {
        case steps(Int)
        case weight(Double)
        case workout(kind: String, minutes: Int, task: String?)
    }
}

struct TodayEditorSheet: View {
    let editor: TodayEditor
    let onSave: (TodayEditor.Result) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var kind: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: DS.Space.s4) {
                switch editor {
                case .steps:
                    DSField(title: "Шаги за день", text: $text, placeholder: "от 0 до 100 000", keyboard: .numberPad)
                        .accessibilityIdentifier("editor.value")
                case .weight:
                    DSField(title: "Вес, кг", text: $text, placeholder: "от 0,1 до 500", keyboard: .decimalPad)
                        .accessibilityIdentifier("editor.value")
                case .workout:
                    Picker("Вид тренировки", selection: $kind) {
                        Text("Выберите").tag(String?.none)
                        ForEach(WorkoutKind.all) { Text($0.title).tag(Optional($0.code)) }
                    }
                    .tint(DS.Color.primaryDefault)
                    .accessibilityIdentifier("editor.kind")
                    DSField(title: "Длительность, мин", text: $text, placeholder: "от 1 до 600", keyboard: .numberPad)
                        .accessibilityIdentifier("editor.value")
                }
                Button("Сохранить") {
                    if let result { onSave(result); dismiss() }
                }
                .buttonStyle(DSButtonStyle(.primary))
                .disabled(result == nil)
                .accessibilityIdentifier("editor.save")
                Spacer()
            }
            .padding(DS.Space.screenX)
            .background(DS.Color.bgCanvas)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
            }
        }
        .onAppear(perform: prefill)
    }

    private var title: String {
        switch editor {
        case .steps: return "Шаги"
        case .weight: return "Вес"
        case .workout: return "Тренировка"
        }
    }

    private func prefill() {
        switch editor {
        case let .steps(current): text = current.map(String.init) ?? ""
        case let .weight(current): text = current.map(NumberText.oneDecimal) ?? ""
        case .workout: break
        }
    }

    private var result: TodayEditor.Result? {
        switch editor {
        case .steps: return ManualInput.steps(text).map(TodayEditor.Result.steps)
        case .weight: return ManualInput.weight(text).map(TodayEditor.Result.weight)
        case let .workout(task):
            return ManualInput.workout(kind: kind, minutes: text).map { .workout(kind: $0.kind, minutes: $0.minutes, task: task) }
        }
    }
}

/// Камера системы (`UIImagePickerController`).
struct CameraPicker: UIViewControllerRepresentable {
    let onPick: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    @MainActor
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPick: (UIImage?) -> Void

        init(onPick: @escaping (UIImage?) -> Void) { self.onPick = onPick }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onPick(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onPick(nil) }
    }
}
