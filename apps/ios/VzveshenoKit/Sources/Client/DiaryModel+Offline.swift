import API
import Foundation
import Outbox

/// Запросы «Дневника» на день — по ним же ищется сохранённый ответ.
struct DiaryEndpoints {
    let entries: Endpoint
    let water: Endpoint
    let plan: Endpoint
    let targets: Endpoint

    init(date: String) {
        entries = .get(DiaryModel.entriesPath, query: [URLQueryItem(name: "date", value: date)])
        water = .get("/api/v1/food-tracker/water", query: [URLQueryItem(name: "date", value: date)])
        plan = .get("/api/v1/dashboard/weekly-plan")
        targets = .get("/api/v1/nutrition-calc/targets", query: [URLQueryItem(name: "date", value: date)])
    }
}

/// «Съел» в «Меню»: что показать в дневнике, пока изменение ждёт отправки.
public struct EatenPreview: Codable, Sendable, Equatable {
    public var entry: NewEntryBody

    public init(entry: NewEntryBody) {
        self.entry = entry
    }
}

extension DiaryModel {
    nonisolated static let entriesPath = "/api/v1/food-tracker/entries"
    public static let eatKind = "menu.eat"

    /// «Обновлено в 14:20», пока на экране сохранённый день.
    public var updatedLabel: String? { freshness.label(now: now(), timeZone: calendar.timeZone) }
    /// Плашка «Нет подключения».
    public var offline: Bool { freshness.offline }

    /// Сохранённый день этого аккаунта — сразу, без сети.
    func hydrate(date: String, userID: Int64?) {
        let endpoints = DiaryEndpoints(date: date)
        guard let cached = reader.cached(DayEntries.self, endpoints.entries, userID: userID) else { return }
        day = cached.value
        freshness.cachedAt = cached.updatedAt
        if water == nil { water = reader.cached(WaterDay.self, endpoints.water, userID: userID)?.value }
        if plan == nil { plan = reader.cached(WeeklyPlanAnswer.self, endpoints.plan, userID: userID)?.value.plan }
        if targets == nil { targets = reader.cached(TargetsAnswer.self, endpoints.targets, userID: userID)?.value }
    }

    func pendingItems(_ user: Int64?) async -> [OutboxItem] {
        guard let outbox, let user else { return [] }
        return ((try? await outbox.pending()) ?? []).filter { $0.userID == user }
    }

    /// Ждущие отправки изменения дневника переживают перезапуск: новые записи
    /// (и «Съел») — строками «ждёт отправки», правки и удаления — поверх
    /// записей с сервера.
    func restoreQueued(_ pending: [OutboxItem]) {
        var restored: [UUID: FoodEntry] = [:]
        var deleted: Set<String> = []
        var edited: [String: EntryUpdateBody] = [:]
        let prefix = Self.entriesPath + "/"
        for item in pending {
            switch (item.kind, item.method) {
            case (Self.addKind, _):
                guard let body = item.body, let draft = try? JSONDecoder().decode(NewEntryBody.self, from: body) else { continue }
                restored[item.id] = Self.entry(id: item.id, body: draft)
            case (Self.eatKind, _):
                guard let preview = item.preview, let eaten = try? JSONDecoder().decode(EatenPreview.self, from: preview) else {
                    continue
                }
                restored[item.id] = Self.entry(id: item.id, body: eaten.entry)
            case (_, .delete) where item.path.hasPrefix(prefix):
                deleted.insert(String(item.path.dropFirst(prefix.count)))
            case (_, .put) where item.path.hasPrefix(prefix):
                if let body = item.body, let update = try? JSONDecoder().decode(EntryUpdateBody.self, from: body) {
                    edited[String(item.path.dropFirst(prefix.count))] = update
                }
            default:
                continue
            }
        }
        queued = restored
        pendingDeleted = deleted
        pendingEdited = edited
        applyPendingEdits()
    }

    /// Правки, ждущие отправки, — в записях дня (приём, порция, КБЖУ).
    func applyPendingEdits() {
        guard var current = day, !pendingEdited.isEmpty else { return }
        for meal in MealType.allCases {
            for entry in current.entries[meal] ?? [] {
                guard let edit = pendingEdited[entry.id] else { continue }
                var changed = entry
                changed.mealType = edit.mealType
                changed.portionType = edit.portionType
                changed.portionAmount = edit.portionAmount
                changed.time = edit.time
                changed.foodName = edit.foodName
                changed.nutrition = Nutrition(calories: edit.calories, protein: edit.protein, fat: edit.fat, carbs: edit.carbs)
                guard changed != entry else { continue }
                current.entries[meal]?.removeAll { $0.id == entry.id }
                current.entries[edit.mealType, default: []].append(changed)
                current.entries[edit.mealType]?.sort { $0.time < $1.time }
            }
        }
        day = current
    }
}
