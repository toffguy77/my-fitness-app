import API
import Foundation
import Observation

/// Поиск продукта (`ios-food-logging`): запрос со второго символа через
/// 300 мс после последней буквы; пустая строка — «Недавние» и «Избранное».
@MainActor
@Observable
public final class FoodSearchModel {
    public static let minimumLength = 2
    public static let delay: Duration = .milliseconds(300)

    public private(set) var results: [FoodItem] = []
    public private(set) var recent: [FoodItem] = []
    public private(set) var favorites: [FoodItem] = []
    public private(set) var searching = false
    public private(set) var error: String?
    /// Запрос, по которому показаны `results`.
    public private(set) var searchedFor: String?

    public var query = "" {
        didSet { if query != oldValue { schedule() } }
    }

    private let api: APIClient
    private let sleeper: Sleeper
    @ObservationIgnored private var task: Task<Void, Never>?

    public init(api: APIClient, sleeper: Sleeper = TaskSleeper()) {
        self.api = api
        self.sleeper = sleeper
    }

    public var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Строка пустая или короче двух символов — показаны недавние и избранное.
    public var showsSuggestions: Bool { trimmed.count < Self.minimumLength }

    public func isFavorite(_ item: FoodItem) -> Bool { favorites.contains { $0.id == item.id } }

    /// Ожидание текущего поиска — для тестов.
    public func waitForSearch() async { await task?.value }

    private func schedule() {
        task?.cancel()
        let text = trimmed
        guard text.count >= Self.minimumLength else {
            results = []
            searchedFor = nil
            searching = false
            error = nil
            return
        }
        task = Task { [weak self, sleeper] in
            do {
                try await sleeper.sleep(for: Self.delay)
            } catch {
                return
            }
            await self?.search(text)
        }
    }

    private func search(_ text: String) async {
        guard !Task.isCancelled else { return }
        searching = true
        defer { searching = false }
        do {
            let answer: FoodSearchAnswer = try await api.send(.get("/api/v1/food-tracker/search", query: [
                URLQueryItem(name: "q", value: text), URLQueryItem(name: "limit", value: "20"),
            ]))
            guard !Task.isCancelled, text == trimmed else { return }
            results = answer.items
            searchedFor = text
            error = nil
        } catch {
            guard !Task.isCancelled else { return }
            self.error = "Поиск не ответил. Проверьте сеть и попробуйте ещё раз."
        }
    }

    /// Недавние и избранное — при открытии листа.
    public func loadSuggestions() async {
        async let recent: FoodList? = try? api.send(.get("/api/v1/food-tracker/recent",
                                                         query: [URLQueryItem(name: "limit", value: "15")]))
        async let favorites: FoodList? = try? api.send(.get("/api/v1/food-tracker/favorites"))
        if let value = await recent { self.recent = value.foods }
        if let value = await favorites { self.favorites = value.foods }
    }

    /// Звезда: добавить или убрать из избранного. Сразу, откат — при отказе.
    public func toggleFavorite(_ item: FoodItem) async {
        let adding = !isFavorite(item)
        let before = favorites
        if adding { favorites.insert(item, at: 0) } else { favorites.removeAll { $0.id == item.id } }
        let path = "/api/v1/food-tracker/favorites/\(item.id)"
        do {
            let endpoint = adding ? try Endpoint.post(path, body: [String: String]()) : Endpoint.delete(path)
            let raw = try await api.sendRaw(endpoint)
            guard (200..<300).contains(raw.status) else { throw raw.apiError }
        } catch {
            favorites = before
        }
    }
}

/// «Вручную»: свой продукт (`POST /user-foods`). Если его завели после
/// ненайденного штрихкода, код запоминается на устройстве (`BarcodeCache`,
/// 90 дней): следующий скан того же кода сразу находит этот продукт. На
/// сервере у своего продукта штрихкода нет — общий поиск по коду глобальный,
/// и чужой продукт не должен находиться у других.
public struct ManualFoodService: Sendable {
    private let api: APIClient
    private let cache: BarcodeCache

    public init(api: APIClient, cache: BarcodeCache) {
        self.api = api
        self.cache = cache
    }

    public func create(_ body: NewUserFoodBody, barcode: String?) async throws -> FoodItem {
        let food: UserFood = try await api.send(try Endpoint.post("/api/v1/food-tracker/user-foods", body: body))
        let item = food.asFoodItem
        if let code = barcode.flatMap(BarcodeInput.normalize) {
            cache.store(item, for: code)
        }
        return item
    }
}

/// Итог поиска по штрихкоду.
public enum BarcodeLookup: Equatable, Sendable {
    case found(FoodItem, cached: Bool)
    /// Сервер не знает код: «Ввести вручную» с подставленным кодом.
    case notFound(code: String)
    case failed(String)
}

/// Штрихкод → продукт: сперва кэш устройства (90 дней), затем сервер.
public struct BarcodeLookupService: Sendable {
    private let api: APIClient
    private let cache: BarcodeCache

    public init(api: APIClient, cache: BarcodeCache) {
        self.api = api
        self.cache = cache
    }

    public func lookup(_ raw: String) async -> BarcodeLookup {
        guard let code = BarcodeInput.normalize(raw) else {
            return .failed("Штрихкод — от 8 до 14 цифр.")
        }
        if let food = cache.food(for: code) { return .found(food, cached: true) }
        do {
            let answer: BarcodeAnswer = try await api.send(.get("/api/v1/food-tracker/barcode/\(code)"))
            guard answer.found, let food = answer.food else { return .notFound(code: code) }
            cache.store(food, for: code)
            return .found(food, cached: false)
        } catch APIError.server(404, _, _) {
            return .notFound(code: code)
        } catch {
            return .failed("Не получилось проверить код. Проверьте сеть или введите продукт вручную.")
        }
    }
}
