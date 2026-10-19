import API
import Foundation
import Observation
import Outbox

/// Всё, из чего собран экран «Сегодня» на выбранный день.
public struct TodaySnapshot: Sendable, Equatable {
    public var day: DailyMetrics
    public var week: [DailyMetrics]
    public var plan: WeeklyPlan?
    public var targets: TargetsAnswer?
    public var water: WaterDay?
    public var tasks: [CuratorTask]
    public var onboarding: FirstWeekState?
    public var progress: ProgressData?
    public var history: CalorieHistory?
    public var unread: UnreadCounts?
    /// Показан кэш: сервер недоступен.
    public var fromCache: Bool

    public init(day: DailyMetrics, week: [DailyMetrics] = [], plan: WeeklyPlan? = nil, targets: TargetsAnswer? = nil,
                water: WaterDay? = nil, tasks: [CuratorTask] = [], onboarding: FirstWeekState? = nil,
                progress: ProgressData? = nil, history: CalorieHistory? = nil, unread: UnreadCounts? = nil,
                fromCache: Bool = false) {
        self.day = day
        self.week = week
        self.plan = plan
        self.targets = targets
        self.water = water
        self.tasks = tasks
        self.onboarding = onboarding
        self.progress = progress
        self.history = history
        self.unread = unread
        self.fromCache = fromCache
    }
}

/// Отметки «фото недели загружено» по неделям: сервер не отдаёт список фото
/// (`GET` нет), поэтому приложение помнит свои загрузки.
public protocol PhotoWeekStore: Sendable {
    func contains(_ week: String, userID: Int64) -> Bool
    func insert(_ week: String, userID: Int64)
}

public final class InMemoryPhotoWeekStore: PhotoWeekStore, @unchecked Sendable {
    private let lock = NSLock()
    private var weeks: Set<String> = []

    public init() {}

    public func contains(_ week: String, userID: Int64) -> Bool { lock.withLock { weeks.contains("\(userID):\(week)") } }
    public func insert(_ week: String, userID: Int64) { _ = lock.withLock { weeks.insert("\(userID):\(week)") } }
}

/// Итог «Отправить недельный отчёт».
public enum WeeklyReportResult: Equatable, Sendable {
    case sent
    /// Сервер отказал: чего не хватает, по-русски.
    case incomplete([String])
    case failed(APIError)
}

/// Модель экрана «Сегодня» (`ios-client-today`).
///
/// Обновляется при выходе на передний план (`refresh`), по pull-to-refresh,
/// по событию WebSocket (`handle`) и по смене календарного дня
/// (`NSCalendarDayChanged`, `observeDayChanges`). Периодического опроса нет
/// и быть не должно: источник событий у телефона — пуш и сокет.
@MainActor
@Observable
public final class TodayModel {
    public private(set) var snapshot: TodaySnapshot?
    public private(set) var selected: String
    public private(set) var today: String
    public private(set) var isLoading = false
    public private(set) var loadError: APIError?
    /// Сколько раз экран перезагружался — для проверки триггеров.
    public private(set) var reloadCount = 0
    /// Сообщение после отвергнутого изменения из очереди.
    public var notice: String?

    public let calendar: DayCalendar
    private let api: APIClient
    private let outbox: Outbox?
    private let cache: ScreenCache?
    private let photoWeeks: PhotoWeekStore
    private let userID: @Sendable () async -> Int64?
    private let now: @Sendable () -> Date
    @ObservationIgnored private var dayObserver: NSObjectProtocol?
    @ObservationIgnored private var generation = 0
    /// Вода изменилась — для записи в Здоровье (`healthkit-sync`).
    @ObservationIgnored public var onWaterChanged: (@MainActor (_ day: String, _ glasses: Int, _ glassSize: Int) -> Void)?
    /// Сегодняшний день загружен или изменён — для снимка виджетов
    /// (`ios-system-surfaces`). Прошлые дни, открытые в полосе недели, сюда
    /// не попадают.
    @ObservationIgnored public var onDayChanged: (@MainActor (_ snapshot: TodaySnapshot, _ date: String) -> Void)?

    public init(api: APIClient, outbox: Outbox?, cache: ScreenCache? = nil, photoWeeks: PhotoWeekStore = InMemoryPhotoWeekStore(),
                calendar: DayCalendar, now: @escaping @Sendable () -> Date = { Date() },
                userID: @escaping @Sendable () async -> Int64?) {
        self.api = api
        self.outbox = outbox
        self.cache = cache
        self.photoWeeks = photoWeeks
        self.calendar = calendar
        self.now = now
        self.userID = userID
        let today = calendar.key(now())
        self.today = today
        selected = today
    }

    // MARK: Производные

    /// Состояние экрана для отрисовки.
    public var state: TodayScreenState {
        TodayScreenState(snapshot: snapshot, selected: selected, today: today, calendar: calendar, photoUploaded: photoUploaded)
    }

    public var nutrition: NutritionSummary? { state.nutrition }

    public private(set) var photoUploaded = false

    public var title: String { state.title }
    public var subtitle: String { state.subtitle }

    // MARK: Загрузка

    /// Первая загрузка и pull-to-refresh.
    public func load() async {
        generation += 1
        let started = generation
        let date = selected
        isLoading = true
        defer { if started == generation { isLoading = false } }
        let user = await userID()
        let loaded = await fetch(date: date, userID: user)
        guard started == generation else { return }
        reloadCount += 1
        switch loaded {
        case let .success(snapshot):
            self.snapshot = snapshot
            loadError = nil
            dayChanged()
        case let .failure(error):
            loadError = error
        }
        if let user {
            photoUploaded = photoWeeks.contains(calendar.isoWeekIdentifier(today), userID: user)
        }
    }

    /// Выход на передний план: день мог смениться, пока приложение спало.
    public func refresh() async {
        rollOverIfNeeded()
        await load()
    }

    /// Выбор дня в полосе недели: карточки перезагружаются на эту дату.
    public func select(_ day: String) async {
        guard day != selected, day <= today else { return }
        selected = day
        await load()
    }

    /// Смена календарного дня: если показан «сегодня», показать новый день.
    /// Подписка — на `NSCalendarDayChanged`, без таймеров.
    public func observeDayChanges(center: NotificationCenter = .default) {
        if let dayObserver { center.removeObserver(dayObserver) }
        dayObserver = center.addObserver(forName: Self.dayChanged, object: nil, queue: nil) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if self.rollOverIfNeeded() { await self.load() }
            }
        }
    }

    public static let dayChanged = Notification.Name("NSCalendarDayChangedNotification")

    /// `true` — день сменился.
    @discardableResult
    private func rollOverIfNeeded() -> Bool {
        let current = calendar.key(now())
        guard current != today else { return false }
        if selected == today { selected = current }
        today = current
        return true
    }

    /// Событие сокета: переписка — карточка куратора, статьи — колокольчик.
    public func handle(_ event: RealtimeEvent) async {
        switch event {
        case .newMessage, .unreadCount:
            if let onboarding = try? await get(FirstWeekState.self, "/api/v1/dashboard/onboarding") {
                snapshot?.onboarding = onboarding
            }
            reloadCount += 1
        case .contentNotification:
            if let unread = try? await get(UnreadCounts.self, "/api/v1/notifications/unread-counts") {
                snapshot?.unread = unread
            }
            reloadCount += 1
        case .typing, .connected:
            break
        }
    }

    private func fetch(date: String, userID: Int64?) async -> Result<TodaySnapshot, APIError> {
        let week = calendar.week(of: date)
        async let day = getCached(DailyMetrics.self, "/api/v1/dashboard/daily/\(date)", userID: userID)
        async let weekMetrics = getCached(WeekMetrics.self, "/api/v1/dashboard/week",
                                          [URLQueryItem(name: "start", value: week[0]), URLQueryItem(name: "end", value: week[6])],
                                          userID: userID)
        async let plan = getCached(WeeklyPlanAnswer.self, "/api/v1/dashboard/weekly-plan", userID: userID)
        async let targets = getCached(TargetsAnswer.self, "/api/v1/nutrition-calc/targets",
                                      [URLQueryItem(name: "date", value: date)], userID: userID)
        async let water = getCached(WaterDay.self, "/api/v1/food-tracker/water",
                                    [URLQueryItem(name: "date", value: date)], userID: userID)
        async let tasks = getCached(TasksAnswer.self, "/api/v1/dashboard/tasks", userID: userID)
        async let onboarding = getCached(FirstWeekState.self, "/api/v1/dashboard/onboarding", userID: userID)
        async let progress = getCached(ProgressData.self, "/api/v1/dashboard/progress",
                                       [URLQueryItem(name: "weeks", value: "4")], userID: userID)
        async let history = getCached(CalorieHistory.self, "/api/v1/nutrition-calc/history",
                                      [URLQueryItem(name: "days", value: "7")], userID: userID)
        async let unread = getCached(UnreadCounts.self, "/api/v1/notifications/unread-counts", userID: userID)

        let dayResult = await day
        guard case let .success((dayValue, dayCached)) = dayResult else {
            if case let .failure(error) = dayResult { return .failure(error) }
            return .failure(.network)
        }
        return .success(TodaySnapshot(
            day: dayValue,
            week: (try? await weekMetrics.get().0.metrics) ?? [],
            plan: (try? await plan.get().0)?.plan,
            targets: try? await targets.get().0,
            water: try? await water.get().0,
            tasks: (try? await tasks.get().0.tasks) ?? [],
            onboarding: try? await onboarding.get().0,
            progress: try? await progress.get().0,
            history: try? await history.get().0,
            unread: try? await unread.get().0,
            fromCache: dayCached
        ))
    }

    /// GET с кэшем экрана: ответ сохраняется; без сети — последний сохранённый.
    private nonisolated func getCached<T: Decodable & Sendable>(
        _ type: T.Type, _ path: String, _ query: [URLQueryItem] = [], userID: Int64?
    ) async -> Result<(T, Bool), APIError> {
        let endpoint = Endpoint.get(path, query: query)
        let key = "today" + path + query.map { "_\($0.name)=\($0.value ?? "")" }.joined()
        do {
            let raw = try await api.sendRaw(endpoint)
            let value = try raw.decoded(T.self)
            if let userID { try? cache?.store(raw.data, for: key, userID: userID) }
            return .success((value, false))
        } catch APIError.network {
            if let userID, let cached = cache?.load(key, userID: userID),
               let value = try? RawResponse(data: cached.data, status: 200).decoded(T.self) {
                return .success((value, true))
            }
            return .failure(.network)
        } catch let error as APIError {
            return .failure(error)
        } catch {
            return .failure(.network)
        }
    }

    private func get<T: Decodable & Sendable>(_ type: T.Type, _ path: String) async throws -> T {
        try await api.send(.get(path), as: T.self)
    }

    // MARK: Изменения — оптимистично и через очередь

    /// «+» на карточке «Вода»: счётчик сразу, запрос — через очередь с
    /// `Idempotency-Key`.
    public func addGlass() async {
        guard var water = snapshot?.water, water.enabled else { return }
        water.glasses += 1
        snapshot?.water = water
        onWaterChanged?(selected, water.glasses, water.glassSize)
        dayChanged()
        await enqueue(kind: "today.water", try? Endpoint.post("/api/v1/food-tracker/water",
                                                               body: WaterBody(date: selected, glasses: 1)))
    }

    public func saveSteps(_ steps: Int) async {
        snapshot?.day.steps = steps
        snapshot?.day.stepsSource = .manual
        await saveMetric(type: "steps", data: ["steps": .int(steps)])
    }

    public func saveWeight(_ weight: Double) async {
        snapshot?.day.weight = weight
        snapshot?.day.weightSource = .manual
        await saveMetric(type: "weight", data: ["weight": .double(weight)])
    }

    public func saveWorkout(kind: String, minutes: Int) async {
        applyWorkout(kind: kind, minutes: minutes)
        await saveMetric(type: "workout", data: ["completed": .bool(true), "types": .strings([kind]),
                                                 "typeDurations": .durations([kind: minutes])])
    }

    private func applyWorkout(kind: String, minutes: Int) {
        snapshot?.day.workoutCompleted = true
        snapshot?.day.workoutTypes = [kind]
        snapshot?.day.workoutTypeDurations = [kind: minutes]
        snapshot?.day.workoutDuration = minutes
        snapshot?.day.workoutSource = .manual
    }

    private func saveMetric(type: String, data: [String: MetricValue]) async {
        let body = MetricBody(date: selected, metric: MetricBody.Metric(type: type, data: data))
        await enqueue(kind: "today.metric.\(type)", try? Endpoint.post("/api/v1/dashboard/daily", body: body))
        await load()
    }

    /// Отметка задачи. Для задачи-тренировки — вид и длительность: сервер
    /// заодно записывает тренировку дня.
    public func completeTask(_ id: String, workout: (kind: String, minutes: Int)? = nil) async {
        let date = selected
        if let index = snapshot?.tasks.firstIndex(where: { $0.id == id }), var task = snapshot?.tasks[index] {
            if task.recurrence == "once" { task.status = "completed" } else { task.completions.append(date) }
            snapshot?.tasks[index] = task
        }
        if let workout { applyWorkout(kind: workout.kind, minutes: workout.minutes) }
        let body = TaskBody(date: date, workoutType: workout?.kind, workoutDuration: workout?.minutes)
        await enqueue(kind: "today.task", try? Endpoint.post("/api/v1/dashboard/tasks/\(id)/complete", body: body))
        await load()
    }

    private func enqueue(kind: String, _ endpoint: Endpoint?) async {
        guard let endpoint, let outbox, let user = await userID() else { return }
        _ = try? await outbox.enqueue(kind: kind, endpoint: endpoint, userID: user)
        let report = await outbox.drain(userID: user)
        if !report.rejected.isEmpty {
            notice = "Не удалось сохранить изменение. Проверьте значение и попробуйте ещё раз."
        }
    }

    /// Дневник изменил итог дня (запись добавлена, в том числе без сети,
    /// удалена или поправлена): остаток на «Сегодня» меняется сразу.
    public func applyDiaryTotals(day: String, totals: Nutrition) {
        guard day == selected, snapshot != nil else { return }
        snapshot?.day.calories = totals.calories.jsRounded
        snapshot?.day.protein = totals.protein.jsRounded
        snapshot?.day.fat = totals.fat.jsRounded
        snapshot?.day.carbs = totals.carbs.jsRounded
        dayChanged()
    }

    private func dayChanged() {
        guard selected == today, let snapshot else { return }
        onDayChanged?(snapshot, today)
    }

    /// Счётчики уведомлений изменились на экране уведомлений — колокольчик сразу.
    public func applyUnread(_ counts: UnreadCounts) {
        snapshot?.unread = counts
    }

    // MARK: Отчёт и фото недели

    /// «Отправить недельный отчёт»: неделя выбранного дня, RFC 3339.
    public func submitWeeklyReport() async -> WeeklyReportResult {
        let week = calendar.week(of: today)
        do {
            let endpoint = try Endpoint.post("/api/v1/dashboard/weekly-report",
                                             body: ["week_start": calendar.rfc3339(week[0]), "week_end": calendar.rfc3339(week[6])])
            let _: EmptyResponse = try await api.send(endpoint)
            return .sent
        } catch let APIError.server(status, _, params) where status == 400 {
            if case let .list(errors)? = params["errors"] {
                return .incomplete(WeeklyReportProblems.describe(errors.map(\.description)))
            }
            return .incomplete(WeeklyReportProblems.describe([]))
        } catch let error as APIError {
            return .failed(error)
        } catch {
            return .failed(.network)
        }
    }

    /// Фото недели: JPEG уже подготовлен (сжат, без EXIF).
    public func uploadWeekPhoto(jpeg: Data) async throws {
        let week = calendar.isoWeekIdentifier(today)
        let form = MultipartForm(fields: ["week_identifier": week], file: ("photo", "week.jpg", "image/jpeg", jpeg))
        let endpoint = Endpoint(method: .post, path: "/api/v1/dashboard/photo-upload", body: form.body,
                                contentType: form.contentType)
        let raw = try await api.sendRaw(endpoint)
        guard (200..<300).contains(raw.status) else { throw raw.apiError }
        if let user = await userID() { photoWeeks.insert(week, userID: user) }
        photoUploaded = true
    }
}

// MARK: Тела запросов

struct WaterBody: Encodable, Sendable {
    let date: String
    let glasses: Int
}

enum MetricValue: Encodable, Sendable {
    case int(Int)
    case double(Double)
    case bool(Bool)
    case strings([String])
    case durations([String: Int])

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .int(value): try container.encode(value)
        case let .double(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case let .strings(value): try container.encode(value)
        case let .durations(value): try container.encode(value)
        }
    }
}

struct MetricBody: Encodable, Sendable {
    struct Metric: Encodable, Sendable {
        let type: String
        let data: [String: MetricValue]
    }
    let date: String
    let metric: Metric
}

struct TaskBody: Encodable, Sendable {
    let date: String
    let workoutType: String?
    let workoutDuration: Int?

    enum CodingKeys: String, CodingKey {
        case date
        case workoutType = "workout_type"
        case workoutDuration = "workout_duration"
    }
}

/// `multipart/form-data` из полей и одного файла.
public struct MultipartForm: Sendable {
    public let boundary: String
    public let body: Data

    public init(fields: [String: String], file: (name: String, filename: String, mime: String, data: Data),
                boundary: String = "vz-\(UUID().uuidString)") {
        self.boundary = boundary
        var body = Data()
        for (name, value) in fields.sorted(by: { $0.key < $1.key }) {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        body.append(Data(("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(file.name)\"; filename=\"\(file.filename)\"\r\n"
                          + "Content-Type: \(file.mime)\r\n\r\n").utf8))
        body.append(file.data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        self.body = body
    }

    public var contentType: String { "multipart/form-data; boundary=\(boundary)" }
}
