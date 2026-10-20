import API
import Foundation
import Outbox

/// Запросы «Сегодня» на день: по ним же ищется сохранённый ответ.
struct TodayEndpoints {
    let day: Endpoint
    let week: Endpoint
    let plan: Endpoint
    let targets: Endpoint
    let water: Endpoint
    let tasks: Endpoint
    let onboarding: Endpoint
    let progress: Endpoint
    let history: Endpoint
    let unread: Endpoint

    init(date: String, calendar: DayCalendar) {
        let week = calendar.week(of: date)
        day = .get("/api/v1/dashboard/daily/\(date)")
        self.week = .get("/api/v1/dashboard/week",
                         query: [URLQueryItem(name: "start", value: week[0]), URLQueryItem(name: "end", value: week[6])])
        plan = .get("/api/v1/dashboard/weekly-plan")
        targets = .get("/api/v1/nutrition-calc/targets", query: [URLQueryItem(name: "date", value: date)])
        water = .get("/api/v1/food-tracker/water", query: [URLQueryItem(name: "date", value: date)])
        tasks = .get("/api/v1/dashboard/tasks")
        onboarding = .get("/api/v1/dashboard/onboarding")
        progress = .get("/api/v1/dashboard/progress", query: [URLQueryItem(name: "weeks", value: "4")])
        history = .get("/api/v1/nutrition-calc/history", query: [URLQueryItem(name: "days", value: "7")])
        unread = .get("/api/v1/notifications/unread-counts")
    }
}

/// Изменение из очереди, применённое поверх ответа сервера: без него
/// перечитанный без сети день вернул бы прежний вес, воду и задачу.
enum PendingChange: Equatable {
    case metric(date: String, type: String, data: [String: JSONValue])
    case water(date: String, delta: Int)
    case task(id: String, date: String, workoutType: String?, workoutDuration: Int?)
    /// Еда дневника или «Съел» — итог дня берётся из дневника.
    case food(date: String?)

    static func of(_ item: OutboxItem) -> PendingChange? {
        let json = item.body.flatMap { try? JSONDecoder().decode([String: JSONValue].self, from: $0) } ?? [:]
        let date = json["date"]?.string
        switch (item.method, item.path) {
        case (.post, "/api/v1/dashboard/daily"):
            guard let date, case let .object(metric)? = json["metric"], let type = metric["type"]?.string,
                  case let .object(data)? = metric["data"] else { return nil }
            return .metric(date: date, type: type, data: data)
        case (.post, "/api/v1/food-tracker/water"):
            guard let date, let delta = json["glasses"]?.int else { return nil }
            return .water(date: date, delta: delta)
        case let (.post, path) where path.hasPrefix("/api/v1/dashboard/tasks/") && path.hasSuffix("/complete"):
            let id = path.dropFirst("/api/v1/dashboard/tasks/".count).dropLast("/complete".count)
            guard let date, !id.isEmpty else { return nil }
            return .task(id: String(id), date: date, workoutType: json["workout_type"]?.string,
                         workoutDuration: json["workout_duration"]?.int)
        case let (_, path) where path.hasPrefix("/api/v1/food-tracker/entries"):
            return .food(date: date)
        case let (.post, path) where path.hasPrefix("/api/v1/meal-plans/") && path.hasSuffix("/eat"):
            return .food(date: path.split(separator: "/").dropFirst(3).first.map(String.init))
        default:
            return nil
        }
    }
}

/// Значение JSON — разобрать тело изменения из очереди.
enum JSONValue: Decodable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    var string: String? { if case let .string(value) = self { return value } else { return nil } }
    var double: Double? { if case let .number(value) = self { return value } else { return nil } }
    var int: Int? { double.map { Int($0) } }
    var bool: Bool? { if case let .bool(value) = self { return value } else { return nil } }
}

extension TodayModel {
    /// Сохранённый день этого аккаунта: без ответа на сам день — ничего.
    func cachedSnapshot(date: String, userID: Int64?) -> TodaySnapshot? {
        let endpoints = TodayEndpoints(date: date, calendar: calendar)
        guard let day = reader.cached(DailyMetrics.self, endpoints.day, userID: userID) else { return nil }
        return TodaySnapshot(
            day: day.value,
            week: reader.cached(WeekMetrics.self, endpoints.week, userID: userID)?.value.metrics ?? [],
            plan: reader.cached(WeeklyPlanAnswer.self, endpoints.plan, userID: userID)?.value.plan,
            targets: reader.cached(TargetsAnswer.self, endpoints.targets, userID: userID)?.value,
            water: reader.cached(WaterDay.self, endpoints.water, userID: userID)?.value,
            tasks: reader.cached(TasksAnswer.self, endpoints.tasks, userID: userID)?.value.tasks ?? [],
            onboarding: reader.cached(FirstWeekState.self, endpoints.onboarding, userID: userID)?.value,
            progress: reader.cached(ProgressData.self, endpoints.progress, userID: userID)?.value,
            history: reader.cached(CalorieHistory.self, endpoints.history, userID: userID)?.value,
            unread: reader.cached(UnreadCounts.self, endpoints.unread, userID: userID)?.value,
            fromCache: true,
            updatedAt: day.updatedAt
        )
    }

    func pendingItems(_ user: Int64?) async -> [OutboxItem] {
        guard let outbox, let user else { return [] }
        return ((try? await outbox.pending()) ?? []).filter { $0.userID == user }
    }

    /// Ждущие отправки изменения дня — поверх ответа (свежего или сохранённого).
    func overlay(_ base: TodaySnapshot, pending: [OutboxItem], date: String) -> TodaySnapshot {
        var snapshot = base
        var foodPending = false
        for change in pending.compactMap(PendingChange.of) {
            switch change {
            case let .metric(day, type, data) where day == date:
                Self.apply(metric: type, data: data, to: &snapshot.day)
            case let .water(day, delta) where day == date:
                if var water = snapshot.water {
                    water.glasses = max(0, water.glasses + delta)
                    snapshot.water = water
                }
            case let .task(id, day, kind, minutes) where day == date:
                if let index = snapshot.tasks.firstIndex(where: { $0.id == id }) {
                    if snapshot.tasks[index].recurrence == "once" {
                        snapshot.tasks[index].status = "completed"
                    } else if !snapshot.tasks[index].completions.contains(day) {
                        snapshot.tasks[index].completions.append(day)
                    }
                }
                if let kind, let minutes {
                    Self.apply(metric: "workout", data: ["types": .array([.string(kind)]),
                                                         "typeDurations": .object([kind: .number(Double(minutes))])],
                               to: &snapshot.day)
                }
            case let .food(day) where day == nil || day == date:
                foodPending = true
            default:
                break
            }
        }
        // Итог дня с записями, ждущими отправки, знает дневник.
        if foodPending, let diary = diaryTotals, diary.day == date {
            snapshot.day.calories = diary.totals.calories.jsRounded
            snapshot.day.protein = diary.totals.protein.jsRounded
            snapshot.day.fat = diary.totals.fat.jsRounded
            snapshot.day.carbs = diary.totals.carbs.jsRounded
        }
        return snapshot
    }

    static func apply(metric type: String, data: [String: JSONValue], to day: inout DailyMetrics) {
        switch type {
        case "weight":
            if let weight = data["weight"]?.double {
                day.weight = weight
                day.weightSource = .manual
            }
        case "steps":
            if let steps = data["steps"]?.int {
                day.steps = steps
                day.stepsSource = .manual
            }
        case "workout":
            let kinds = data["types"].flatMap { value -> [String]? in
                if case let .array(items) = value { return items.compactMap(\.string) }
                return nil
            } ?? []
            var durations: [String: Int] = [:]
            if case let .object(values)? = data["typeDurations"] {
                for (kind, minutes) in values { durations[kind] = minutes.int }
            }
            day.workoutCompleted = true
            day.workoutTypes = kinds
            day.workoutTypeDurations = durations
            day.workoutDuration = durations.values.reduce(0, +)
            day.workoutSource = .manual
        default:
            break
        }
    }
}
