import Foundation

/// Задача куратора в блоке «Задачи от куратора».
public struct TaskRow: Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let subtitle: String
    public let isOverdue: Bool
    public let isDone: Bool
    /// Задача-тренировка: отметка сначала спрашивает вид и длительность.
    public let needsWorkout: Bool

    public init(task: CuratorTask, day: String, today: String) {
        id = task.id
        title = task.title
        needsWorkout = task.kind == .workout
        let recurring = task.recurrence != "once"
        isDone = recurring ? task.completions.contains(day) : task.status == "completed"
        isOverdue = !isDone && (task.status == "overdue" || (!recurring && !task.due.isEmpty && task.due < today))
        let kind: String
        switch task.kind {
        case .nutrition: kind = "Питание"
        case .workout: kind = "Тренировка"
        case .measurement: kind = "Замеры"
        case .habit, .none: kind = "Привычка"
        }
        let when: String
        if isOverdue {
            when = "Просрочено"
        } else if task.recurrence == "daily" {
            when = "ежедневно"
        } else if task.recurrence == "weekly" {
            when = "еженедельно"
        } else {
            when = task.due.isEmpty ? "" : "до \(DayText.dayMonth(task.due))"
        }
        subtitle = [kind, when].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// Пункт чек-листа «Первая неделя».
public struct FirstWeekItem: Sendable, Equatable, Identifiable {
    public let key: String
    public let title: String
    public let done: Bool

    public var id: String { key }

    public static func items(_ state: FirstWeekState?) -> [FirstWeekItem] {
        guard let state, state.active else { return [] }
        return state.steps.map { step in
            let title: String
            switch step.key {
            case "profile": title = "Заполнить профиль: пол, дата рождения, рост"
            case "first_meal": title = "Записать первый приём пищи"
            case "plate_photo": title = "Распознать тарелку по фото"
            case "curator_hello": title = "Поздороваться с куратором"
            default: title = step.key
            }
            return FirstWeekItem(key: step.key, title: title, done: step.done)
        }
    }
}

/// Карточка куратора: имя, последнее сообщение, непрочитанные.
public struct CuratorSummary: Sendable, Equatable {
    public enum State: Sendable, Equatable {
        /// Доступ есть, куратор назначен.
        case curator(name: String, lastMessage: String?, unread: Int)
        /// Доступа нет: «Работа с куратором» — без цены, заявки и ссылок
        /// на оплату (App Review 3.1.1(a)).
        case noAccess(expired: Bool)
        /// Доступ есть, куратора ещё нет.
        case unassigned
    }

    public let state: State

    public init(_ onboarding: FirstWeekState?) {
        guard let onboarding else {
            state = .noAccess(expired: false)
            return
        }
        if !onboarding.curatorAccess.allowed {
            state = .noAccess(expired: onboarding.curatorAccess.expired)
        } else if let curator = onboarding.curator {
            state = .curator(name: curator.name, lastMessage: curator.lastMessage?.text, unread: curator.unreadCount)
        } else {
            state = .unassigned
        }
    }

    public init(state: State) { self.state = state }

    /// Инициал для аватара: «А».
    public var initial: String? {
        guard case let .curator(name, _, _) = state, let first = name.first else { return nil }
        return String(first).uppercased()
    }
}

/// Что показывать на «Сегодня» кроме дня (`ios-client-today`, задача 2.3).
public struct TodayVisibility: Sendable, Equatable {
    public let firstWeek: Bool
    public let tasks: Bool
    public let photoReminder: Bool
    public let weeklyReport: Bool
    public let plank: Bool
    public let weekCalories: Bool
    public let progress: Bool

    public init(selected: String, today: String, calendar: DayCalendar, firstWeekActive: Bool, hasTasks: Bool,
                photoUploadedThisWeek: Bool, hasPlan: Bool, hasHistory: Bool) {
        let weekday = calendar.isoWeekday(today)
        let currentWeek = calendar.weekStart(of: selected) == calendar.weekStart(of: today)
        firstWeek = firstWeekActive
        tasks = hasTasks
        // Суббота и воскресенье текущей недели, фото ещё нет.
        photoReminder = currentWeek && weekday >= 6 && !photoUploadedThisWeek
        // Только в воскресенье текущей недели.
        weeklyReport = currentWeek && weekday == 7
        // После первой недели.
        plank = !firstWeekActive && hasPlan
        weekCalories = !firstWeekActive && hasHistory
        progress = !firstWeekActive
    }
}

/// Отказ отчёта: сервер перечисляет недостающее по-английски — переводим.
public enum WeeklyReportProblems {
    public static func describe(_ errors: [String]) -> [String] {
        let described = errors.map(describe)
        return described.isEmpty ? ["Неделя ещё не заполнена"] : described
    }

    static func describe(_ error: String) -> String {
        let numbers = error.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
        let logged = numbers.first
        let minimum = numbers.count > 1 ? numbers[1] : 5
        if error.hasPrefix("nutrition logged") {
            return "Питание записано \(Plural.days(logged ?? 0)) из 7 — нужно не меньше \(minimum)"
        }
        if error.hasPrefix("weight logged") {
            return "Вес записан \(Plural.days(logged ?? 0)) из 7 — нужно не меньше \(minimum)"
        }
        if error.contains("photo") {
            return "Нет фото недели"
        }
        return "Не всё готово к отчёту"
    }
}

/// Столбец «Недели по калориям».
public struct CalorieBar: Sendable, Equatable, Identifiable {
    public let day: String
    public let label: String
    public let actual: Int
    public let target: Int?

    public var id: String { day }

    /// Доля от нормы, не больше 1,25 — для высоты столбца.
    public var fraction: Double {
        guard let target, target > 0 else { return 0 }
        return min(Double(actual) / Double(target), 1.25)
    }

    public var isOver: Bool { target.map { actual > $0 } ?? false }

    public static func bars(_ history: CalorieHistory?, calendar: DayCalendar) -> [CalorieBar] {
        (history?.days ?? []).map { day in
            let key = DayKey.of(day.date)
            return CalorieBar(day: key, label: DayText.short(key, calendar: calendar),
                              actual: NumberText.jsRound(day.actual?.calories ?? 0),
                              target: day.target.map { NumberText.jsRound($0.calories) })
        }
    }

    public static func hasData(_ history: CalorieHistory?) -> Bool {
        (history?.days ?? []).contains { ($0.actual?.calories ?? 0) > 0 }
    }
}
