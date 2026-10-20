import API
import Client
import DesignSystem
import PhotosUI
import SwiftUI
import UIKit

/// «Нашли на тарелке» (макет PhotoResult.png): уверенность, вес вводит
/// человек («Подставить» берёт оценку), низкая уверенность — «Найти»,
/// добавляются только позиции с весом.
struct PhotoResultContent: View {
    let result: RecognitionResult
    let meal: MealType
    /// «Обед · 13:20» на снимке.
    let photoCaption: String
    var photo: UIImage?
    let onRetake: () -> Void
    let onStep: (Int, Int) -> Void
    let onApply: (Int) -> Void
    let onFind: (RecognitionItem) -> Void
    let onAdd: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: DS.Space.s3) {
                    HStack {
                        Button(action: onRetake) {
                            HStack(spacing: 2) {
                                Image(systemName: "chevron.left").font(.system(size: 17, weight: .medium))
                                Text("Снять заново")
                            }
                            .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body).weight(.medium))
                            .foregroundStyle(DS.Color.primaryDefault)
                            .frame(minHeight: DS.Size.touch)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("photo.retake")
                        Spacer()
                        if let remaining = result.remainingText {
                            Text(remaining).dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        }
                    }
                    photoView
                    Text("Нашли на тарелке")
                        .dsText(DS.Typography.title2)
                        .foregroundStyle(DS.Color.fgDefault)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(result.items) { item in
                        RecognitionRow(item: item, onStep: { onStep(item.id, $0) }, onApply: { onApply(item.id) },
                                       onFind: { onFind(item) })
                    }
                }
                .padding(.horizontal, DS.Space.screenX)
                .padding(.bottom, DS.Space.s4)
            }
            VStack(spacing: 10) {
                HStack {
                    Text("Итого, если подставить оценку").dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    Spacer()
                    Text("\(NumberText.grouped(result.estimatedTotal)) ккал")
                        .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .headline).weight(.semibold))
                        .foregroundStyle(DS.Color.fgDefault)
                }
                SheetPrimaryButton(title: result.addTitle(meal: meal), identifier: "photo.add", enabled: !result.addable.isEmpty,
                                   action: onAdd)
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.top, 14)
            .padding(.bottom, DS.Space.s4)
            .background(DS.Color.bgSurface)
            .overlay(alignment: .top) { Rectangle().fill(DS.Color.lineDefault).frame(height: 1) }
        }
    }

    private var photoView: some View {
        ZStack(alignment: .bottomLeading) {
            if let photo {
                Image(uiImage: photo).resizable().scaledToFill()
            } else {
                RadialGradient(colors: [DS.Color.bgSubtle, DS.Color.track, DS.Color.fgSubtle], center: .center,
                               startRadius: 10, endRadius: 220)
            }
            Text(photoCaption)
                .font(.custom(DS.FontFamily.sans, size: 12, relativeTo: .caption))
                .foregroundStyle(DS.Color.bgSurface)
                .padding(.horizontal, DS.Space.s2)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(DS.Color.coachBg.opacity(0.6)))
                .padding(.leading, DS.Space.s3)
                .padding(.bottom, 10)
        }
        .frame(height: 170)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous))
        .accessibilityElement()
        .accessibilityLabel("Фото тарелки")
    }
}

private struct RecognitionRow: View {
    let item: RecognitionItem
    let onStep: (Int) -> Void
    let onApply: () -> Void
    let onFind: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s2) {
            HStack {
                Text(item.food.name)
                    .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .callout).weight(.semibold))
                    .foregroundStyle(DS.Color.fgDefault)
                Spacer()
                ConfidenceBadge(confidence: item.confidence)
            }
            if item.suggestsSearch {
                HStack {
                    Text("Состав не уверен — лучше найти вручную")
                        .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                    Spacer()
                    Button("Найти", action: onFind)
                        .font(.custom(DS.FontFamily.sans, size: 14, relativeTo: .subheadline).weight(.medium))
                        .foregroundStyle(DS.Color.primaryDefault)
                        .frame(minHeight: DS.Size.touch)
                        .touchTarget()
                        .accessibilityIdentifier("photo.find.\(item.id)")
                }
            } else {
                HStack(spacing: 10) {
                    HStack(spacing: 0) {
                        stepButton("minus", "Меньше", -1)
                        Text(item.grams.map { "\(NumberText.grouped($0.jsRounded)) г" } ?? "— г")
                            .font(.custom(DS.FontFamily.sans, size: 16, relativeTo: .body)
                                .weight(item.grams == nil ? .regular : .semibold))
                            .foregroundStyle(item.grams == nil ? DS.Color.fgSubtle : DS.Color.fgDefault)
                            .frame(minWidth: 56)
                            .accessibilityIdentifier("photo.grams.\(item.id)")
                        stepButton("plus", "Больше", 1)
                    }
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(DS.Color.bgSubtle))
                    Text(item.nutritionLine ?? item.estimateText ?? "")
                        .dsText(DS.Typography.caption).foregroundStyle(DS.Color.fgMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if item.grams == nil, item.estimateText != nil {
                        Button(action: onApply) {
                            Text("Подставить")
                                .font(.custom(DS.FontFamily.sans, size: 13, relativeTo: .footnote).weight(.medium))
                                .lineLimit(1)
                                .fixedSize()
                                .foregroundStyle(DS.Color.primaryDefault)
                                .padding(.horizontal, 10)
                                .frame(minHeight: 32)
                                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(DS.Color.primarySoft))
                                .frame(minHeight: DS.Size.touch)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("photo.apply.\(item.id)")
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, DS.Space.s3)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(DS.Color.bgSurface))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(DS.Color.lineDefault))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("photo.item.\(item.id)")
    }

    private func stepButton(_ icon: String, _ label: String, _ direction: Int) -> some View {
        Button { onStep(direction) } label: {
            Image(systemName: icon).font(.system(size: 15, weight: .medium)).foregroundStyle(DS.Color.fgDefault)
                .frame(width: 36, height: DS.Size.touch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

private struct ConfidenceBadge: View {
    let confidence: RecognitionConfidence

    var body: some View {
        let (fg, bg): (Color, Color) = switch confidence {
        case .high: (DS.Color.statusSuccessFg, DS.Color.statusSuccessSoft)
        case .medium: (DS.Color.statusInfoFg, DS.Color.statusInfoSoft)
        case .low: (DS.Color.statusWarningFg, DS.Color.statusWarningSoft)
        }
        Text(confidence.title)
            .dsText(DS.Typography.micro)
            .foregroundStyle(fg)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(Capsule().fill(bg))
            .accessibilityLabel("Уверенность: \(confidence.title)")
    }
}

/// Способ «Фото»: камера или «Фото», подготовка снимка, распознавание.
struct PhotoMethodView: View {
    let meal: MealType
    let api: APIClient
    /// Сценарий UI-теста: снимок вместо камеры.
    var testPhoto = false
    let onResult: (RecognitionResult, UIImage) -> Void
    let onSearch: () -> Void
    let onBarcode: () -> Void

    @State private var showCamera = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var recognizing = false
    @State private var failure: RecognitionFailure?

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s4) {
            Text("Сфотографируйте тарелку сверху — так состав виден лучше. Вес порции вы подтвердите сами.")
                .dsText(DS.Typography.callout)
                .foregroundStyle(DS.Color.fgMuted)
            HStack(spacing: DS.Space.s2) {
                Button {
                    if testPhoto {
                        Task { await recognize(Self.testImage) }
                    } else if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        showCamera = true
                    }
                } label: {
                    Label("Снять", systemImage: "camera")
                }
                .buttonStyle(DSButtonStyle(.primary, size: .medium))
                .accessibilityIdentifier("photo.camera")
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Label("Из «Фото»", systemImage: "photo")
                }
                .buttonStyle(DSButtonStyle(.secondary, size: .medium))
                .accessibilityIdentifier("photo.library")
            }
            if recognizing {
                HStack(spacing: DS.Space.s2) {
                    ProgressView()
                    Text("Распознаём…").dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                }
                .accessibilityIdentifier("photo.recognizing")
            }
            if let failure {
                VStack(alignment: .leading, spacing: DS.Space.s3) {
                    Text(failure.message).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                        .accessibilityIdentifier("photo.failure")
                    if failure.isDailyLimit {
                        HStack(spacing: DS.Space.s2) {
                            Button("Найти вручную", action: onSearch).buttonStyle(DSButtonStyle(.secondary, size: .medium))
                                .accessibilityIdentifier("photo.limit.search")
                            Button("Штрихкод", action: onBarcode).buttonStyle(DSButtonStyle(.secondary, size: .medium))
                                .accessibilityIdentifier("photo.limit.barcode")
                        }
                    }
                }
                .padding(DS.Space.s4)
                .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
            }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                pickerItem = nil
                await recognize(data.flatMap(UIImage.init(data:)))
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                Task { await recognize(image) }
            }
            .ignoresSafeArea()
        }
    }

    private func recognize(_ image: UIImage?) async {
        guard let image else { return }
        guard let jpeg = PhotoPreparation.jpeg(from: image) else {
            failure = .other("Не получилось подготовить фото. Попробуйте другое.")
            return
        }
        recognizing = true
        failure = nil
        defer { recognizing = false }
        do {
            let recognition = try await RecognitionAPI.recognize(jpeg: jpeg, api: api)
            onResult(RecognitionResult(recognition: recognition), image)
        } catch {
            failure = RecognitionFailure(error)
        }
    }

    /// Снимок для сценария UI-теста: в симуляторе камеры нет.
    static var testImage: UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 64, height: 48)).image { context in
            UIColor.systemOrange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
        }
    }
}
