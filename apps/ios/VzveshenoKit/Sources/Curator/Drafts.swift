import Client
import Foundation

/// Число из поля ввода: «78,4» и «78.4»; пусто и мусор — `nil`.
public enum DecimalInput {
    public static func parse(_ text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
            .replacingOccurrences(of: NumberText.nbsp, with: "")
        guard !trimmed.isEmpty, let value = Double(trimmed), value.isFinite else { return nil }
        return value
    }

    /// Значение в поле: «78,4», «180».
    public static func text(_ value: Double) -> String { NumberText.oneDecimal(value).replacingOccurrences(of: NumberText.nbsp, with: "") }
}

/// Форма плана недели. Даты меняются только при создании.
public struct PlanDraft: Sendable, Equatable {
    public var calories = ""
    public var protein = ""
    public var fat = ""
    public var carbs = ""
    /// `yyyy-MM-dd`.
    public var startDate: String
    public var endDate: String
    public var comment = ""
    /// Правка существующего плана: поля дат недоступны.
    public let editing: Bool

    public init(startDate: String, endDate: String) {
        self.startDate = startDate
        self.endDate = endDate
        editing = false
    }

    public init(plan: ClientPlan) {
        calories = DecimalInput.text(plan.macros.calories)
        protein = DecimalInput.text(plan.macros.protein)
        fat = DecimalInput.text(plan.macros.fat)
        carbs = DecimalInput.text(plan.macros.carbs)
        startDate = plan.startDate
        endDate = plan.endDate
        comment = plan.comment ?? ""
        editing = true
    }

    /// Новый план — с сегодняшнего дня на неделю.
    public static func new(today: String, calendar: DayCalendar) -> PlanDraft {
        PlanDraft(startDate: today, endDate: calendar.adding(days: 6, to: today))
    }

    public var datesEditable: Bool { !editing }

    /// Что мешает сохранить; `nil` — можно. Сервер требует все четыре числа больше нуля.
    public var problem: String? {
        let values = [calories, protein, fat, carbs].map(DecimalInput.parse)
        if values.contains(where: { $0 == nil || ($0 ?? 0) <= 0 }) { return "Заполните ккал, белки, жиры и углеводы" }
        if !editing, endDate < startDate { return "Конец плана раньше начала" }
        return nil
    }

    public var isValid: Bool { problem == nil }

    struct CreateBody: Encodable, Sendable {
        let calories, protein, fat, carbs: Double
        let startDate, endDate, comment: String
        enum CodingKeys: String, CodingKey {
            case calories, protein, fat, carbs, comment
            case startDate = "start_date"
            case endDate = "end_date"
        }
    }

    struct UpdateBody: Encodable, Sendable {
        let calories, protein, fat, carbs: Double
        let comment: String
    }

    var createBody: CreateBody {
        CreateBody(calories: value(calories), protein: value(protein), fat: value(fat), carbs: value(carbs),
                   startDate: startDate, endDate: endDate, comment: comment.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Правка — без дат: сервер их и не принимает.
    var updateBody: UpdateBody {
        UpdateBody(calories: value(calories), protein: value(protein), fat: value(fat), carbs: value(carbs),
                   comment: comment.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func value(_ text: String) -> Double { DecimalInput.parse(text) ?? 0 }
}

/// Форма задачи.
public struct TaskDraft: Sendable, Equatable {
    public var title = ""
    public var kind: TaskKind = .nutrition
    /// `yyyy-MM-dd`.
    public var deadline: String
    public var description = ""
    public var recurrence: TaskRecurrence = .once
    /// Дни недели как в вебе: 1 — понедельник … 6 — суббота, 0 — воскресенье.
    public var days: Set<Int> = []
    public let editing: Bool

    /// Порядок кнопок дней: Пн…Вс.
    public static let weekdays: [(value: Int, title: String)] = [
        (1, "Пн"), (2, "Вт"), (3, "Ср"), (4, "Чт"), (5, "Пт"), (6, "Сб"), (0, "Вс"),
    ]

    public init(deadline: String) {
        self.deadline = deadline
        editing = false
    }

    public init(task: ClientTask) {
        title = task.title
        kind = task.kind ?? .habit
        deadline = task.deadline
        description = task.description ?? ""
        recurrence = TaskRecurrence(rawValue: task.recurrence) ?? .once
        days = Set(task.recurrenceDays)
        editing = true
    }

    public var problem: String? {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Введите название" }
        if trimmed.count > 200 { return "Название длиннее 200 символов" }
        if deadline.isEmpty { return "Укажите дедлайн" }
        if recurrence == .weekly, days.isEmpty { return "Отметьте дни недели" }
        return nil
    }

    /// «Готово» доступна.
    public var isValid: Bool { problem == nil }

    struct CreateBody: Encodable, Sendable {
        let title, type, description, deadline, recurrence: String
        let recurrenceDays: [Int]?
        enum CodingKeys: String, CodingKey {
            case title, type, description, deadline, recurrence
            case recurrenceDays = "recurrence_days"
        }
    }

    struct UpdateBody: Encodable, Sendable {
        let title, description, deadline: String
    }

    var createBody: CreateBody {
        CreateBody(title: title.trimmingCharacters(in: .whitespacesAndNewlines), type: kind.rawValue,
                   description: description.trimmingCharacters(in: .whitespacesAndNewlines), deadline: deadline,
                   recurrence: recurrence.rawValue,
                   recurrenceDays: recurrence == .weekly ? Self.weekdays.map(\.value).filter(days.contains) : nil)
    }

    /// Сервер меняет у задачи только название, описание, дедлайн и статус.
    var updateBody: UpdateBody {
        UpdateBody(title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                   description: description.trimmingCharacters(in: .whitespacesAndNewlines), deadline: deadline)
    }
}

/// Форма отзыва на недельный отчёт.
public struct FeedbackDraft: Sendable, Equatable {
    public static let summaryMissing = "Заполните итог"

    public var nutrition: FeedbackRating?
    public var nutritionComment = ""
    public var activity: FeedbackRating?
    public var activityComment = ""
    public var water: FeedbackRating?
    public var waterComment = ""
    public var photoUploaded = false
    public var summary = ""
    public var recommendations = ""

    public init() {}

    public init(_ body: WeeklyFeedbackBody) {
        nutrition = body.nutrition?.rating
        nutritionComment = body.nutrition?.comment ?? ""
        activity = body.activity?.rating
        activityComment = body.activity?.comment ?? ""
        water = body.water?.rating
        waterComment = body.water?.comment ?? ""
        photoUploaded = body.photoUploaded ?? false
        summary = body.summary
        recommendations = body.recommendations
    }

    /// «Отправить» доступна только с итогом.
    public var isValid: Bool { !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    /// Подсказка под «Итогом».
    public var summaryHint: String? { isValid ? nil : Self.summaryMissing }

    var body: WeeklyFeedbackBody {
        func category(_ rating: FeedbackRating?, _ comment: String) -> WeeklyFeedbackBody.Category? {
            rating.map { WeeklyFeedbackBody.Category(rating: $0, comment: comment.trimmingCharacters(in: .whitespacesAndNewlines)) }
        }
        return WeeklyFeedbackBody(nutrition: category(nutrition, nutritionComment), activity: category(activity, activityComment),
                                  water: category(water, waterComment), photoUploaded: photoUploaded,
                                  summary: summary.trimmingCharacters(in: .whitespacesAndNewlines),
                                  recommendations: recommendations.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

/// Лист «Ввести КБЖУ» по фото клиента (`ios-curator-chat`).
public struct FoodEntryDraft: Sendable, Equatable {
    public var name = ""
    public var meal: MealType
    public var weight = ""
    public var calories = ""
    public var protein = ""
    public var fat = ""
    public var carbs = ""

    /// Приём по умолчанию — по времени фото в поясе клиента (те же часы, что
    /// у клиента при записи еды: 5–10 завтрак, 11–15 обед, 17–21 ужин).
    public init(photoTime: Date, calendar: DayCalendar) {
        meal = MealType.at(photoTime, calendar: calendar)
    }

    public var isValid: Bool {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let weight = DecimalInput.parse(weight), weight > 0 else { return false }
        return [calories, protein, fat, carbs].allSatisfy { (DecimalInput.parse($0) ?? -1) >= 0 }
    }

    struct Body: Encodable, Sendable {
        let foodName, mealType: String
        let weight, calories, protein, fat, carbs: Double
        enum CodingKeys: String, CodingKey {
            case weight, calories, protein, fat, carbs
            case foodName = "food_name"
            case mealType = "meal_type"
        }
    }

    var body: Body {
        Body(foodName: name.trimmingCharacters(in: .whitespacesAndNewlines), mealType: meal.rawValue,
             weight: DecimalInput.parse(weight) ?? 0, calories: DecimalInput.parse(calories) ?? 0,
             protein: DecimalInput.parse(protein) ?? 0, fat: DecimalInput.parse(fat) ?? 0, carbs: DecimalInput.parse(carbs) ?? 0)
    }
}
