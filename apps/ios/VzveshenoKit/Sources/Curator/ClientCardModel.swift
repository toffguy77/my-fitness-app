import API
import Client
import Foundation
import Observation
import Outbox

/// Карточка клиента (`ios-curator-client-card`). Действия куратора — только
/// онлайн: ошибка возвращает прежнее значение и показывает «Не удалось сохранить».
@MainActor
@Observable
public final class ClientCardModel {
    public enum Phase: Equatable, Sendable {
        case loading
        case loaded
        case failed(String)
    }

    public static let saveFailed = "Не удалось сохранить"
    public static let waterHidden = "Блок воды скрыт у клиента. Задайте цель, чтобы включить."

    public let clientID: Int64
    public var tab: ClientCardTab
    public private(set) var phase: Phase = .loading
    public private(set) var detail: ClientDetail?
    public private(set) var notices: [ClientNotice] = []
    public private(set) var plans: [ClientPlan] = []
    public private(set) var tasks: [ClientTask] = []
    public private(set) var reports: [WeeklyReport] = []
    public var taskFilter: TaskFilter = .active
    /// «Не удалось сохранить» и тексты ошибок форм.
    public var notice: String?

    /// Сохранённая карточка на экране / обновление не дошло. Только чтение:
    /// изменения куратора — онлайн.
    public private(set) var freshness = Freshness()

    public let calendar: DayCalendar
    private let api: APIClient
    private let reader: ScreenReader
    private let account: Int64?
    private let now: @Sendable () -> Date
    private let messages: ErrorMessages

    public init(api: APIClient, clientID: Int64, tab: ClientCardTab = .overview, calendar: DayCalendar,
                messages: ErrorMessages = ErrorMessages(), cache: ScreenCache? = nil, account: Int64? = nil,
                now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        reader = ScreenReader(api: api, cache: cache, now: now)
        self.account = account
        self.clientID = clientID
        self.tab = tab
        self.calendar = calendar
        self.messages = messages
        self.now = now
        if let cached = reader.cached(ClientDetail.self, detailEndpoint, userID: account) {
            detail = cached.value
            freshness.cachedAt = cached.updatedAt
            phase = .loaded
            notices = reader.cached([ClientNotice].self, .get("\(base)/notices"), userID: account)?.value ?? []
        }
    }

    private var base: String { "/api/v1/curator/clients/\(clientID)" }
    private var detailEndpoint: Endpoint { .get(base, query: [URLQueryItem(name: "days", value: "7")]) }
    public var today: String { calendar.key(now()) }
    public var updatedLabel: String? { freshness.label(now: now(), timeZone: calendar.timeZone) }
    public var offline: Bool { freshness.offline }

    /// Свежий список, без сети — сохранённый; ошибка — прежний.
    private func list<T: Decodable & Sendable>(_ type: T.Type, _ path: String) async -> T? {
        try? await reader.fetchOrCached(T.self, .get(path), userID: account).get().0
    }

    // MARK: Загрузка

    public func load() async {
        switch await reader.fetch(ClientDetail.self, detailEndpoint, userID: account) {
        case let .success(value):
            detail = value
            phase = .loaded
            freshness.markFresh()
        case let .failure(error):
            freshness.markFailed(error)
            if detail == nil { phase = .failed(messages.message(for: error)) }
        }
        notices = await list([ClientNotice].self, "\(base)/notices") ?? notices
        await loadTab()
    }

    /// Данные открытой вкладки.
    public func loadTab() async {
        switch tab {
        case .overview: break
        case .plan: await loadPlans()
        case .tasks: await loadTasks()
        case .reports: await loadReports()
        }
    }

    public func loadPlans() async {
        if let list = await list([ClientPlan].self, "\(base)/weekly-plans") { plans = list }
    }

    public func loadTasks() async {
        if let list = await list([ClientTask].self, "\(base)/tasks") { tasks = list }
    }

    public func loadReports() async {
        if let list = await list([WeeklyReport].self, "\(base)/weekly-reports") { reports = list }
    }

    // MARK: Производные

    public var activePlan: ClientPlan? { plans.first { $0.isActive } }
    public var planHistory: [ClientPlan] { plans.filter { !$0.isActive } }

    public var visibleTasks: [ClientTask] {
        tasks.filter { $0.filter(today: today) == taskFilter }
    }

    public var waterCaption: String? {
        guard let detail else { return nil }
        return detail.waterGoal == nil ? Self.waterHidden : nil
    }

    // MARK: Цели

    /// Цель веса 20–500 кг с шагом 0,1; `nil` — убрать.
    public static func validTargetWeight(_ value: Double) -> Bool { (20...500).contains(value) }

    public func setTargetWeight(_ value: Double?) async {
        guard var current = detail else { return }
        let rounded = value.map { ($0 * 10).rounded() / 10 }
        if let rounded, !Self.validTargetWeight(rounded) {
            notice = "Цель веса — от 20 до 500 кг"
            return
        }
        let previous = current.client.targetWeight
        current.client.targetWeight = rounded
        detail = current
        struct Body: Encodable { let targetWeight: Double?
            enum CodingKeys: String, CodingKey { case targetWeight = "target_weight" }
            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encode(targetWeight, forKey: .targetWeight)
            }
        }
        if !(await put("\(base)/target-weight", Body(targetWeight: rounded))) {
            detail?.client.targetWeight = previous
            notice = Self.saveFailed
        }
    }

    /// Цель по воде 1–30 стаканов; `nil` — «Убрать».
    public func setWaterGoal(_ value: Int?) async {
        guard var current = detail else { return }
        if let value, !(1...30).contains(value) { return }
        let previous = current.waterGoal
        current.waterGoal = value
        detail = current
        struct Body: Encodable { let waterGoal: Int?
            enum CodingKeys: String, CodingKey { case waterGoal = "water_goal" }
            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encode(waterGoal, forKey: .waterGoal)
            }
        }
        if !(await put("\(base)/water-goal", Body(waterGoal: value))) {
            detail?.waterGoal = previous
            notice = Self.saveFailed
        }
    }

    private func put<Body: Encodable & Sendable>(_ path: String, _ body: Body) async -> Bool {
        guard let endpoint = try? Endpoint.put(path, body: body), let response = try? await api.sendRaw(endpoint) else { return false }
        return (200..<300).contains(response.status)
    }

    // MARK: План

    /// Создание (`POST …/weekly-plan`) или правка без дат (`PUT …/weekly-plan/:id`).
    /// `nil` — сохранено; иначе — текст ошибки, форма остаётся открытой.
    public func save(_ draft: PlanDraft, editing planID: String?) async -> String? {
        guard draft.isValid else { return draft.problem }
        do {
            if let planID {
                _ = try await api.sendRaw(try Endpoint.put("\(base)/weekly-plan/\(planID)", body: draft.updateBody)).checked()
            } else {
                _ = try await api.sendRaw(try Endpoint.post("\(base)/weekly-plan", body: draft.createBody)).checked()
            }
            await loadPlans()
            return nil
        } catch {
            return messages.message(for: error)
        }
    }

    public func deletePlan(_ id: String) async -> String? {
        do {
            _ = try await api.sendRaw(.delete("\(base)/weekly-plan/\(id)")).checked()
            await loadPlans()
            return nil
        } catch {
            return messages.message(for: error)
        }
    }

    // MARK: Задачи

    public func save(_ draft: TaskDraft, editing taskID: String?) async -> String? {
        guard draft.isValid else { return draft.problem }
        do {
            if let taskID {
                _ = try await api.sendRaw(try Endpoint.put("\(base)/tasks/\(taskID)", body: draft.updateBody)).checked()
            } else {
                _ = try await api.sendRaw(try Endpoint.post("\(base)/tasks", body: draft.createBody)).checked()
            }
            await loadTasks()
            return nil
        } catch {
            return messages.message(for: error)
        }
    }

    // MARK: Отчёты

    public func submit(_ draft: FeedbackDraft, reportID: String) async -> String? {
        guard draft.isValid else { return FeedbackDraft.summaryMissing }
        do {
            _ = try await api.sendRaw(try Endpoint.put("\(base)/weekly-reports/\(reportID)/feedback", body: draft.body)).checked()
            await loadReports()
            return nil
        } catch {
            return messages.message(for: error)
        }
    }
}

extension RawResponse {
    /// Ответ не 2xx — ошибка API с кодом сервера.
    func checked() throws -> RawResponse {
        guard (200..<300).contains(status) else { throw apiError }
        return self
    }
}
