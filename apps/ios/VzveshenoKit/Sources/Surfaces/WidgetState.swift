import Foundation

/// Чей снимок можно показать: только вошедшего сейчас аккаунта.
public enum SurfaceAccess {
    /// Снимок, если он принадлежит сессии в Keychain. Нет сессии, нет снимка
    /// или снимок другого аккаунта (выход, смена аккаунта, переустановка —
    /// Keychain её переживает, а App Group нет) — `nil`.
    public static func visible(_ snapshot: DaySnapshot?, sessionUserID: Int64?) -> DaySnapshot? {
        guard let snapshot, let sessionUserID, snapshot.userID == sessionUserID else { return nil }
        return snapshot
    }
}

/// Макронутриент на виджете: «Б 49», «Ж +12».
public struct MacroText: Equatable, Sendable {
    public enum Kind: String, Sendable {
        case protein, fat, carbs
    }

    public let kind: Kind
    /// Остаток «49» или превышение «+12».
    public let value: String

    public var letter: String {
        switch kind {
        case .protein: return "Б"
        case .fat: return "Ж"
        case .carbs: return "У"
        }
    }

    public var text: String { "\(letter) \(value)" }
}

/// День клиента для виджетов — все строки готовы, виду остаётся раскладка.
public struct ClientDay: Equatable, Sendable {
    /// «Осталось», «Сверх нормы», «Съедено».
    public let title: String
    /// Заголовок среднего виджета: «Осталось на сегодня».
    public let mediumTitle: String
    /// «1 923», «+128»; без нормы — съеденное.
    public let headline: String
    /// Для круглого виджета экрана блокировки — без пробела: «1923».
    public let compact: String
    /// «ккал из 2 472»; без нормы — «ккал».
    public let caption: String
    /// Строчный виджет и первая строка прямоугольного: «1 923 ккал».
    public let inline: String
    /// Доля съеденного: дуга, больше 1 не бывает.
    public let fraction: Double
    public let isOver: Bool
    /// Остаток макросов; без всех трёх норм — `nil`.
    public let macros: [MacroText]?
    /// Вода, если куратор задал цель.
    public let water: DaySnapshot.Water?

    /// «Б 49 · Ж 31 · У 212».
    public var macrosLine: String? {
        macros.map { $0.map(\.text).joined(separator: " · ") }
    }

    /// «5/8».
    public var waterShort: String? {
        water.map { "\($0.glasses)/\($0.goal)" }
    }

    /// Вторая строка прямоугольного виджета: «Б 49 · Ж 31 · У 212 · вода 5/8».
    public var rectangularDetail: String {
        [macrosLine, waterShort.map { "вода \($0)" }].compactMap { $0 }.joined(separator: " · ")
    }

    public var accessibilityLabel: String {
        var parts = ["\(title) \(headline) \(caption)"]
        if let macrosLine { parts.append(macrosLine) }
        if let water { parts.append("вода \(water.glasses) из \(water.goal)") }
        return parts.joined(separator: ", ")
    }

    public init(nutrition: DaySnapshot.Nutrition?, water: DaySnapshot.Water?) {
        let eaten = nutrition?.eatenKcal ?? 0
        let goal = nutrition?.goalKcal
        self.water = water?.enabled == true ? water : nil
        if let goal, goal > 0 {
            let remaining = goal - eaten
            isOver = remaining < 0
            title = isOver ? "Сверх нормы" : "Осталось"
            mediumTitle = isOver ? "Сверх нормы" : "Осталось на сегодня"
            headline = isOver ? "+\(SurfaceText.grouped(-remaining))" : SurfaceText.grouped(remaining)
            compact = isOver ? "+\(-remaining)" : "\(remaining)"
            caption = "ккал из \(SurfaceText.grouped(goal))"
            fraction = min(max(Double(eaten) / Double(goal), 0), 1)
        } else {
            isOver = false
            title = "Съедено"
            mediumTitle = "Съедено сегодня"
            headline = SurfaceText.grouped(eaten)
            compact = "\(eaten)"
            caption = "ккал"
            fraction = 0
        }
        inline = "\(headline) ккал"
        if let protein = nutrition?.protein, let fat = nutrition?.fat, let carbs = nutrition?.carbs, goal != nil {
            macros = [(MacroText.Kind.protein, protein), (.fat, fat), (.carbs, carbs)].map { kind, macro in
                MacroText(kind: kind, value: macro.left >= 0 ? SurfaceText.grouped(macro.left) : "+\(SurfaceText.grouped(-macro.left))")
            }
        } else {
            macros = nil
        }
    }
}

/// Что показывает виджет клиента.
public enum ClientWidgetState: Equatable, Sendable {
    /// Никто не вошёл (или снимок другого аккаунта): данных нет.
    case signedOut
    /// Роль в снимке не `client`.
    case wrongRole
    /// Снимок не за сегодня по поясу профиля.
    case noData
    case day(ClientDay)

    public static let signedOutText = "Войдите во Взвешено"
    public static let wrongRoleText = "Доступно клиентам"
    public static let noDataText = "Нет данных за сегодня"

    public init(_ snapshot: DaySnapshot?, sessionUserID: Int64?, now: Date) {
        guard let snapshot = SurfaceAccess.visible(snapshot, sessionUserID: sessionUserID) else {
            self = .signedOut
            return
        }
        guard snapshot.isClient else {
            self = .wrongRole
            return
        }
        guard snapshot.isCurrent(at: now) else {
            self = .noData
            return
        }
        self = .day(ClientDay(nutrition: snapshot.nutrition, water: snapshot.water))
    }

    /// Текст вместо данных.
    public var message: String? {
        switch self {
        case .signedOut: return Self.signedOutText
        case .wrongRole: return Self.wrongRoleText
        case .noData: return Self.noDataText
        case .day: return nil
        }
    }
}

/// Что показывает виджет куратора.
public enum CuratorWidgetState: Equatable, Sendable {
    case signedOut
    /// Роль в снимке не `coordinator`.
    case wrongRole
    case counts(attention: Int, unread: Int)

    public static let wrongRoleText = "Доступно кураторам"

    public init(_ snapshot: DaySnapshot?, sessionUserID: Int64?) {
        guard let snapshot = SurfaceAccess.visible(snapshot, sessionUserID: sessionUserID) else {
            self = .signedOut
            return
        }
        guard snapshot.isCurator else {
            self = .wrongRole
            return
        }
        self = .counts(attention: snapshot.curator?.attentionCount ?? 0, unread: snapshot.curator?.unread ?? 0)
    }

    public var message: String? {
        switch self {
        case .signedOut: return ClientWidgetState.signedOutText
        case .wrongRole: return Self.wrongRoleText
        case .counts: return nil
        }
    }

    /// «Требуют внимания: 3».
    public var attentionText: String? {
        if case let .counts(attention, _) = self { return "Требуют внимания: \(SurfaceText.grouped(attention))" }
        return nil
    }

    /// «Непрочитанные: 5».
    public var unreadText: String? {
        if case let .counts(_, unread) = self { return "Непрочитанные: \(SurfaceText.grouped(unread))" }
        return nil
    }
}

/// Записи таймлайна виджета: сейчас и ближайшая полночь по поясу профиля —
/// в полночь вчерашний остаток сменяется «Нет данных за сегодня», даже если
/// приложение не открывали.
public enum WidgetTimelinePlan {
    public static func dates(snapshot: DaySnapshot?, now: Date) -> [Date] {
        let zone = snapshot?.zone ?? .current
        return [now, SurfaceCalendar.nextMidnight(after: now, in: zone)]
    }
}
