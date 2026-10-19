import Foundation

/// Снимок дня в App Group (`ios-system-surfaces`): его пишет приложение после
/// загрузки «Сегодня» и каждого изменения, читают виджеты, элементы Пункта
/// управления и App Intents. Сеть расширение не трогает ради чтения: всё, что
/// показывается без приложения, — отсюда.
///
/// Снимок принадлежит одному аккаунту (`userID`). Выход его стирает, а
/// читатели сверяют `userID` с сессией в Keychain: данные прежнего аккаунта
/// не показываются и от его имени ничего не делается.
public struct DaySnapshot: Codable, Equatable, Sendable {
    /// Питание дня: съедено и норма. Без нормы — только съеденное.
    public struct Nutrition: Codable, Equatable, Sendable {
        public var eatenKcal: Int
        public var goalKcal: Int?
        public var protein: Macro?
        public var fat: Macro?
        public var carbs: Macro?

        public init(eatenKcal: Int, goalKcal: Int?, protein: Macro? = nil, fat: Macro? = nil, carbs: Macro? = nil) {
            self.eatenKcal = eatenKcal
            self.goalKcal = goalKcal
            self.protein = protein
            self.fat = fat
            self.carbs = carbs
        }

        /// Остаток со знаком: отрицательный — сверх нормы; без нормы — `nil`.
        public var remainingKcal: Int? { goalKcal.map { $0 - eatenKcal } }

        enum CodingKeys: String, CodingKey {
            case protein, fat, carbs
            case eatenKcal = "eaten_kcal"
            case goalKcal = "goal_kcal"
        }
    }

    /// Макронутриент: съедено и норма в граммах.
    public struct Macro: Codable, Equatable, Sendable {
        public var eaten: Int
        public var goal: Int

        public init(eaten: Int, goal: Int) {
            self.eaten = eaten
            self.goal = goal
        }

        /// Остаток со знаком: отрицательный — сверх нормы.
        public var left: Int { goal - eaten }
    }

    /// Вода дня. `enabled == false` — куратор не задал цель.
    public struct Water: Codable, Equatable, Sendable {
        public var glasses: Int
        public var goal: Int
        public var glassSize: Int
        public var enabled: Bool

        public init(glasses: Int, goal: Int, glassSize: Int = 250, enabled: Bool) {
            self.glasses = glasses
            self.goal = goal
            self.glassSize = glassSize
            self.enabled = enabled
        }

        enum CodingKeys: String, CodingKey {
            case glasses, goal, enabled
            case glassSize = "glass_size"
        }
    }

    /// Сводка куратора: «Требуют внимания» и непрочитанные.
    public struct Curator: Codable, Equatable, Sendable {
        public var attentionCount: Int
        public var unread: Int

        public init(attentionCount: Int, unread: Int) {
            self.attentionCount = attentionCount
            self.unread = unread
        }

        enum CodingKeys: String, CodingKey {
            case unread
            case attentionCount = "attention_count"
        }
    }

    public var userID: Int64
    /// Роль как её называет сервер: `client`, `coordinator`, `super_admin`…
    public var role: String
    /// День снимка `yyyy-MM-dd` в поясе профиля.
    public var date: String
    /// Пояс профиля (IANA): по нему виджет решает, сегодняшний ли снимок, и
    /// ставит запись таймлайна на полночь.
    public var timeZone: String
    public var updatedAt: Date
    public var nutrition: Nutrition?
    public var water: Water?
    public var curator: Curator?

    public init(userID: Int64, role: String, date: String, timeZone: String, updatedAt: Date,
                nutrition: Nutrition? = nil, water: Water? = nil, curator: Curator? = nil) {
        self.userID = userID
        self.role = role
        self.date = date
        self.timeZone = timeZone
        self.updatedAt = updatedAt
        self.nutrition = nutrition
        self.water = water
        self.curator = curator
    }

    enum CodingKeys: String, CodingKey {
        case role, date, nutrition, water, curator
        case userID = "user_id"
        case timeZone = "time_zone"
        case updatedAt = "updated_at"
    }

    public var isClient: Bool { role == "client" }
    public var isCurator: Bool { role == "coordinator" }

    public var zone: TimeZone { TimeZone(identifier: timeZone) ?? .current }

    /// Снимок за текущий день пояса профиля. Вчерашний не выдаётся за
    /// сегодняшний.
    public func isCurrent(at now: Date) -> Bool {
        SurfaceCalendar.dayKey(now, in: zone) == date
    }

    public static func decode(_ data: Data) -> DaySnapshot? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return try? decoder.decode(DaySnapshot.self, from: data)
    }

    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(self)
    }
}

/// День и полночь в поясе профиля — без `DayCalendar` из `Client`: расширение
/// виджетов `Client` не подключает.
public enum SurfaceCalendar {
    public static func calendar(_ zone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar
    }

    /// `yyyy-MM-dd` момента в поясе.
    public static func dayKey(_ date: Date, in zone: TimeZone) -> String {
        let parts = calendar(zone).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Ближайшая полночь после `date` в поясе.
    public static func nextMidnight(after date: Date, in zone: TimeZone) -> Date {
        let calendar = calendar(zone)
        let start = calendar.startOfDay(for: date)
        return calendar.date(byAdding: .day, value: 1, to: start) ?? date.addingTimeInterval(86_400)
    }
}
