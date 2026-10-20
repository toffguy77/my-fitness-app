import AppIntents
import Surfaces
import SwiftUI
import WidgetKit

// Пункт управления и кнопка «Действие» (`ios-controls`). Кнопку «Действие»
// человек назначает в настройках телефона на любой из этих элементов —
// отдельного кода для неё нет. Имена и значки — `SurfaceControl`.

/// «Добавить стакан воды» — без открытия приложения.
struct AddWaterControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: SurfaceControl.water.kind) {
            ControlWidgetButton(action: AddWaterIntent()) {
                Label(SurfaceControl.water.title, systemImage: SurfaceControl.water.systemImage)
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: SurfaceControl.water.title))
        .description("Стакан воды во Взвешено, не открывая приложение.")
    }
}

/// «Еда по фото» — приложение сразу на съёмке блюда.
struct PhotoFoodControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: SurfaceControl.photo.kind) {
            ControlWidgetButton(action: OpenFoodLoggingIntent(method: .photo)) {
                Label(SurfaceControl.photo.title, systemImage: SurfaceControl.photo.systemImage)
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: SurfaceControl.photo.title))
        .description("Открывает запись еды по фото.")
    }
}

/// «Штрихкод» — приложение сразу на сканере.
struct BarcodeControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: SurfaceControl.barcode.kind) {
            ControlWidgetButton(action: OpenFoodLoggingIntent(method: .barcode)) {
                Label(SurfaceControl.barcode.title, systemImage: SurfaceControl.barcode.systemImage)
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: SurfaceControl.barcode.title))
        .description("Открывает сканер штрихкода продукта.")
    }
}
