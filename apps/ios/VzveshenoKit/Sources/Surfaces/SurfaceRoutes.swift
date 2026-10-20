import Foundation
import Navigation
import Outbox

/// Экран, который App Intent или элемент Пункта управления просит открыть.
///
/// Интент с `openAppWhenRun` может выполниться и в расширении, и в
/// приложении, а приложение при холодном запуске ещё не готово открыть экран.
/// Поэтому маршрут кладётся в файл App Group, а приложение забирает его,
/// когда готово (`take`), — тем же путём, что ссылка (`AppModel.open(_ intent:)`).
public struct PendingRouteStore: Sendable {
    public let url: URL
    /// Маршрут старше этого не открывается: человек нажал давно, а приложение
    /// открыли по другой причине.
    public static let lifetime: TimeInterval = 5 * 60

    public init(url: URL) {
        self.url = url
    }

    public init(directory: URL) {
        self.init(url: directory.appendingPathComponent("pending-route.json"))
    }

    public func save(_ route: IntentRoute, at date: Date = Date()) {
        let record = Record(route: Coded(route), createdAt: date.timeIntervalSince1970)
        if let data = try? JSONEncoder().encode(record) {
            try? ProtectedFiles.write(data, to: url)
        }
    }

    /// Отдаёт и забывает. Просроченный маршрут забывается без открытия.
    public func take(now: Date = Date()) -> IntentRoute? {
        defer { try? FileManager.default.removeItem(at: url) }
        guard let data = try? Data(contentsOf: url), let record = try? JSONDecoder().decode(Record.self, from: data),
              now.timeIntervalSince1970 - record.createdAt <= Self.lifetime else {
            return nil
        }
        return record.route.route
    }

    public func erase() {
        try? FileManager.default.removeItem(at: url)
    }

    private struct Record: Codable {
        let route: Coded
        let createdAt: Double
    }

    private struct Coded: Codable {
        let kind: String
        let add: String?

        init(_ route: IntentRoute) {
            switch route {
            case .openToday: kind = "today"; add = nil
            case let .openDiary(method): kind = "diary"; add = method?.rawValue
            case .openChat: kind = "chat"; add = nil
            }
        }

        var route: IntentRoute? {
            switch kind {
            case "today": return .openToday
            case "diary": return .openDiary(add: add.flatMap(AddMethod.init(rawValue:)))
            case "chat": return .openChat
            default: return nil
            }
        }
    }
}

/// «Запиши еду» и элементы «Еда по фото», «Штрихкод»: лист «Записать еду»
/// на способе; без способа — поиск (`ios-app-intents`).
public enum FoodLoggingRoute {
    public static func route(_ method: AddMethod?) -> IntentRoute {
        .openDiary(add: method ?? .search)
    }
}

/// Фразы App Shortcuts (`ios-app-intents`). Сами фразы объявлены литералами в
/// `VzveshenoShortcuts` (их читает компилятор метаданных App Intents, а не
/// код); этот перечень — то, с чем тест сверяет исходник.
public enum ShortcutCatalog {
    public static let phrases = [
        "Добавь стакан воды во \\(.applicationName)",
        "Сколько калорий осталось во \\(.applicationName)",
        "Запиши вес во \\(.applicationName)",
        "Запиши еду во \\(.applicationName)",
    ]

    /// Слова, за которые App Store Connect молча отвергает сборку при
    /// обработке (ITMS-90626 — «Apple» в описании App Intent, сборки 0.2.0).
    public static let forbiddenWords = ["apple", "siri", "iphone", "айфон", "сири", "эппл"]
}

/// Элементы Пункта управления и кнопки «Действие» (`ios-controls`).
///
/// `route == nil` — действие без открытия приложения («Добавить стакан
/// воды»); иначе — экран, на котором откроется приложение.
public struct SurfaceControl: Equatable, Sendable {
    public let kind: String
    public let title: String
    public let systemImage: String
    public let route: IntentRoute?

    public static let water = SurfaceControl(kind: "team.burcev.vzvesheno.control.water", title: "Добавить стакан воды",
                                             systemImage: "drop.fill", route: nil)
    public static let photo = SurfaceControl(kind: "team.burcev.vzvesheno.control.photo", title: "Еда по фото",
                                             systemImage: "camera", route: FoodLoggingRoute.route(.photo))
    public static let barcode = SurfaceControl(kind: "team.burcev.vzvesheno.control.barcode", title: "Штрихкод",
                                               systemImage: "barcode.viewfinder", route: FoodLoggingRoute.route(.barcode))

    public static let all = [water, photo, barcode]
}
