import SwiftUI
import PhotosUI

/// Распознавание блюда по фото. Модель называет блюдо и состав с КБЖУ на
/// 100 г, а вес порции вводит человек: оценка модели по фото ошибается в разы,
/// поэтому, как и на сайте, поля веса пустые, а оценка — только подсказка.
struct PhotoRecognitionView: View {
    @Environment(SessionStore.self) private var session

    let meal: MealType
    let date: Date
    let onAdded: () -> Void

    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var image: UIImage?
    @State private var recognizing = false
    @State private var recognition: Recognition?
    @State private var weights: [String: Double] = [:]
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        Form {
            Section {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                HStack {
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Снять", systemImage: "camera") { showCamera = true }
                            .buttonStyle(.bordered)
                    }
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label("Из галереи", systemImage: "photo")
                    }
                    .buttonStyle(.bordered)
                }
                if recognizing {
                    HStack { ProgressView(); Text("Распознаём…").foregroundStyle(.secondary) }
                }
            } footer: {
                Text("Сфотографируйте тарелку сверху — так модель лучше видит состав.")
            }

            if let recognition {
                let parts = items(recognition)
                Section {
                    ForEach(parts) { part in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(part.name)
                                Spacer()
                                Text(confidence(part.confidence))
                                    .font(.caption)
                                    .foregroundStyle(part.confidence >= 0.7 ? Color.secondary : Color.orange)
                            }
                            HStack {
                                TextField("Вес, г", value: binding(for: part), format: .number.precision(.fractionLength(0)))
                                    .keyboardType(.numberPad)
                                    .textFieldStyle(.roundedBorder)
                                if let estimate = part.estimated_weight, estimate > 0 {
                                    Button("≈ \(estimate.formatted(.number.precision(.fractionLength(0)))) г") {
                                        weights[part.name] = estimate
                                    }
                                    .font(.footnote)
                                    .buttonStyle(.borderless)
                                }
                            }
                        }
                    }
                } header: {
                    Text(recognition.foods.first?.name ?? "Блюдо")
                } footer: {
                    if let left = recognition.remaining_recognitions {
                        Text("Осталось распознаваний сегодня: \(left).")
                    }
                }

                Section("Итого") {
                    let total = totals(parts)
                    LabeledContent("Вес", value: "\(total.grams.formatted(.number.precision(.fractionLength(0)))) г")
                    LabeledContent("Калории", value: "\(total.macros.calories.formatted(.number.precision(.fractionLength(0)))) ккал")
                    Text("Б \(total.macros.protein.formatted(.number.precision(.fractionLength(1)))) · Ж \(total.macros.fat.formatted(.number.precision(.fractionLength(1)))) · У \(total.macros.carbs.formatted(.number.precision(.fractionLength(1))))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button {
                        Task { await save(parts) }
                    } label: {
                        HStack { Spacer(); if saving { ProgressView() } else { Text("Записать в \(meal.title.lowercased())").fontWeight(.semibold) }; Spacer() }
                    }
                    .disabled(saving || !weightsValid(parts))
                }
            }

            if let errorText {
                Section { Text(errorText).foregroundStyle(.red) }
            }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let picked = UIImage(data: data) {
                    await recognize(picked)
                }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { picked in
                showCamera = false
                if let picked { Task { await recognize(picked) } }
            }
            .ignoresSafeArea()
        }
    }

    /// Состав, а если модель его не дала — само блюдо одной строкой.
    private func items(_ recognition: Recognition) -> [RecognizedFood] {
        if let composition = recognition.composition, !composition.isEmpty { return composition }
        return recognition.foods
    }

    private func binding(for part: RecognizedFood) -> Binding<Double?> {
        Binding(get: { weights[part.name] }, set: { weights[part.name] = $0 })
    }

    private func confidence(_ value: Double) -> String {
        switch value {
        case 0.9...: return "уверенно"
        case 0.7...: return "вероятно"
        default: return "проверьте"
        }
    }

    private func weightsValid(_ parts: [RecognizedFood]) -> Bool {
        parts.allSatisfy { part in
            guard let w = weights[part.name] else { return false }
            return w > 0 && w <= 5000
        }
    }

    private func totals(_ parts: [RecognizedFood]) -> (grams: Double, macros: Macros) {
        var grams = 0.0
        var m = Macros.zero
        for part in parts {
            let w = weights[part.name] ?? 0
            let k = w / 100
            grams += w
            m.calories += part.nutrition.calories * k
            m.protein += part.nutrition.protein * k
            m.fat += part.nutrition.fat * k
            m.carbs += part.nutrition.carbs * k
        }
        return (grams, m)
    }

    private func recognize(_ picked: UIImage) async {
        image = picked
        recognition = nil
        weights = [:]
        errorText = nil
        guard let jpeg = picked.jpegForUpload() else {
            errorText = "Не получилось подготовить фото."
            return
        }
        recognizing = true
        defer { recognizing = false }
        do {
            recognition = try await session.api.send(Endpoint<Recognition>.upload(
                "/api/v1/food-tracker/recognize", field: "photo", filename: "plate.jpg",
                mimeType: "image/jpeg", data: jpeg))
        } catch APIError.server(status: 429, _, _) {
            errorText = "Лимит распознаваний на сегодня исчерпан. Найдите блюдо в поиске."
        } catch APIError.server(status: 422, _, _) {
            errorText = "Не получилось разобрать блюдо. Переснимите сверху при хорошем свете или найдите в поиске."
        } catch APIError.server(status: 503, _, _) {
            errorText = "Распознавание сейчас недоступно."
        } catch {
            errorText = error.userMessage
        }
    }

    private func save(_ parts: [RecognizedFood]) async {
        saving = true
        errorText = nil
        defer { saving = false }
        let total = totals(parts)
        let name = recognition?.foods.first?.name ?? parts.first?.name ?? "Блюдо"
        do {
            // `ai-` и все пять переопределений: по ним сервер заводит продукт
            // в «моих» и привязывает запись к нему.
            var request = CreateEntryRequest(
                foodId: "ai-\(Int(Date().timeIntervalSince1970 * 1000))", mealType: meal, portionType: "grams",
                portionAmount: total.grams, time: APIDates.time(Date()), date: APIDates.day(date))
            request.foodName = name
            request.calories = total.macros.calories
            request.protein = total.macros.protein
            request.fat = total.macros.fat
            request.carbs = total.macros.carbs
            let entry = try await session.api.send(Endpoint<FoodEntry>.post("/api/v1/food-tracker/entries", body: request))
            await HealthService.shared.saveNutrition(entryID: entry.id, day: date, time: entry.time,
                                                     macros: entry.nutrition, name: entry.foodName)
            onAdded()
        } catch {
            errorText = error.userMessage
        }
    }
}

extension UIImage {
    /// JPEG не шире 1280 px — как готовит фото сайт. Заодно HEIC с iPhone
    /// превращается в формат, который сервер принимает.
    func jpegForUpload(maxSide: CGFloat = 1280, quality: CGFloat = 0.8) -> Data? {
        let longest = max(size.width, size.height)
        let scale = longest > maxSide ? maxSide / longest : 1
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}

/// Системная камера.
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

        init(onPick: @escaping (UIImage?) -> Void) {
            self.onPick = onPick
        }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onPick(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onPick(nil)
        }
    }
}
