import AppIntents
import Foundation
import Navigation
import Surfaces

// Действия для голоса, «Быстрых команд», виджетов и Пункта управления
// (`ios-app-intents`, `ios-controls`). Файл собирается и в приложение, и в
// расширение: интент, открывающий приложение, должен быть в обеих целях.
//
// В названиях, описаниях и фразах — без товарных знаков Apple: сборку с
// «Apple» в описании App Intent App Store Connect отверг при обработке
// (ITMS-90626, 0.2.0). Перечень запретных слов сверяет тест.

/// «Добавить стакан воды» — без открытия приложения.
struct AddWaterIntent: AppIntent {
    static var title: LocalizedStringResource { "Добавить стакан воды" }
    static var description: IntentDescription { IntentDescription("Отмечает выпитый стакан воды во Взвешено, не открывая приложение.") }
    static var openAppWhenRun: Bool { false }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let outcome = await AddWaterAction(context: await SurfaceEnvironment.context()).perform()
        return .result(dialog: "\(outcome.dialog)")
    }
}

/// Способ записи еды — параметр «Запиши еду» и элементов Пункта управления.
enum FoodLoggingMethod: String, AppEnum {
    case search, photo, barcode, manual

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Способ записи"
    static let caseDisplayRepresentations: [FoodLoggingMethod: DisplayRepresentation] = [
        .search: "Поиск", .photo: "Фото", .barcode: "Штрихкод", .manual: "Вручную",
    ]

    var addMethod: AddMethod {
        switch self {
        case .search: return .search
        case .photo: return .photo
        case .barcode: return .barcode
        case .manual: return .manual
        }
    }
}

/// «Записать еду» — лист «Записать еду» на способе (по умолчанию — поиск).
struct OpenFoodLoggingIntent: AppIntent {
    static var title: LocalizedStringResource { "Записать еду" }
    static var description: IntentDescription { IntentDescription("Открывает запись еды во Взвешено на выбранном способе.") }
    static var openAppWhenRun: Bool { true }

    @Parameter(title: "Способ", default: .search)
    var method: FoodLoggingMethod

    init() {}

    init(method: FoodLoggingMethod) {
        self.method = method
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        SurfaceRouting.request(FoodLoggingRoute.route(method.addMethod))
        return .result()
    }
}

/// «Сколько калорий осталось» — голосом и карточкой, по снимку дня.
struct RemainingCaloriesIntent: AppIntent {
    static var title: LocalizedStringResource { "Сколько калорий осталось" }
    static var description: IntentDescription { IntentDescription("Называет остаток калорий и белков на сегодня во Взвешено.") }
    static var openAppWhenRun: Bool { false }

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let reader = SurfaceEnvironment.session
        let snapshot = SurfaceAccess.visible(SurfaceEnvironment.snapshots.load(), sessionUserID: reader.user?.id)
        let now = Date()
        let text = snapshot == nil ? SurfaceDialogs.signedOut : RemainingCaloriesAnswer.text(snapshot, now: now)
        let state = ClientWidgetState(snapshot, sessionUserID: reader.user?.id, now: now)
        return .result(dialog: "\(text)", view: RemainingCaloriesSnippet(state: state))
    }
}

/// «Записать вес» — за сегодня, 20–500 кг.
struct LogWeightIntent: AppIntent {
    static var title: LocalizedStringResource { "Записать вес" }
    static var description: IntentDescription { IntentDescription("Записывает вес за сегодня во Взвешено.") }
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "Вес, кг", requestValueDialog: IntentDialog("Сколько?"))
    var value: Double

    init() {}

    init(value: Double) {
        self.value = value
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let outcome = await LogWeightAction(context: await SurfaceEnvironment.context()).perform(kilograms: value)
        if outcome == .outOfRange {
            throw $value.needsValueError(IntentDialog("\(VoiceWeight.outOfRange)"))
        }
        return .result(dialog: "\(outcome.dialog)")
    }
}
