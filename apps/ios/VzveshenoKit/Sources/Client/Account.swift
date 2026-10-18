import API
import Foundation
import Observation
import Session

/// Способы входа: `GET /auth/providers/linked` → `{linked, has_password}`.
public struct LinkedProviders: Decodable, Sendable, Equatable {
    public struct Provider: Decodable, Sendable, Equatable {
        public var provider: String
        public var email: String?

        public init(provider: String, email: String? = nil) {
            self.provider = provider
            self.email = email
        }

        public var title: String {
            switch provider {
            case "apple": return "Apple"
            case "yandex": return "Яндекс"
            case "vk": return "VK"
            default: return provider
            }
        }
    }

    public var linked: [Provider]
    public var hasPassword: Bool

    public init(linked: [Provider], hasPassword: Bool) {
        self.linked = linked
        self.hasPassword = hasPassword
    }

    enum CodingKeys: String, CodingKey {
        case linked
        case hasPassword = "has_password"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        linked = try container.decodeIfPresent([Provider].self, forKey: .linked) ?? []
        hasPassword = try container.decodeIfPresent(Bool.self, forKey: .hasPassword) ?? false
    }

    /// «Apple, Яндекс» в строке профиля.
    public var summary: String {
        linked.isEmpty ? (hasPassword ? "пароль" : "—") : linked.map(\.title).joined(separator: ", ")
    }
}

/// `GET /users/me/telegram`.
public struct TelegramLink: Decodable, Sendable, Equatable {
    public var linked: Bool
    public var username: String?

    public init(linked: Bool, username: String? = nil) {
        self.linked = linked
        self.username = username
    }

    public var summary: String {
        guard linked else { return "не привязан" }
        return username.flatMap { $0.isEmpty ? nil : "@\($0)" } ?? "привязан"
    }
}

/// Аккаунт: способы входа, пароль, Telegram.
public struct AccountService: Sendable {
    let api: APIClient

    public init(api: APIClient) {
        self.api = api
    }

    public func linkedProviders() async throws -> LinkedProviders {
        try await api.send(.get("/api/v1/auth/providers/linked"))
    }

    /// Отвязать провайдера; последний способ без пароля сервер не отвяжет (`provider_only_way_in`).
    public func unlink(_ provider: String) async throws {
        _ = try await api.send(.delete("/api/v1/auth/providers/\(provider)"), as: EmptyResponse.self)
    }

    public func telegram() async throws -> TelegramLink {
        try await api.send(.get("/api/v1/users/me/telegram"))
    }

    /// Ссылка на бота (одноразовая, 15 минут) — открывает Telegram.
    public func telegramLinkURL() async throws -> URL? {
        struct Answer: Decodable, Sendable { let url: String }
        let answer: Answer = try await api.send(Endpoint(method: .post, path: "/api/v1/users/me/telegram"))
        return URL(string: answer.url)
    }

    public func unlinkTelegram() async throws {
        _ = try await api.send(.delete("/api/v1/users/me/telegram"), as: EmptyResponse.self)
    }

    /// Смена пароля: сервер завершает прочие сессии и выдаёт новую пару — её надо сохранить.
    public func changePassword(current: String, new: String, deviceName: String) async throws -> NativeSession {
        try await api.send(try .post("/api/v1/auth/native/change-password",
                                     body: ["current_password": current, "new_password": new, "device_name": deviceName]))
    }

    /// Пароля нет — ссылка на почту.
    public func sendPasswordLink(email: String) async throws {
        _ = try await api.sendRaw(try .post("/api/v1/auth/forgot-password", body: ["email": email], requiresAuth: false))
    }
}

// MARK: Выгрузка данных

/// Выгрузка `POST/GET /users/me/export`.
public struct DataExport: Decodable, Sendable, Equatable, Identifiable {
    public var id: String
    public var status: String
    public var requestedAt: String?
    public var expiresAt: String?
    public var downloaded: Bool

    public init(id: String, status: String, requestedAt: String? = nil, expiresAt: String? = nil, downloaded: Bool = false) {
        self.id = id
        self.status = status
        self.requestedAt = requestedAt
        self.expiresAt = expiresAt
        self.downloaded = downloaded
    }

    enum CodingKeys: String, CodingKey {
        case id, status, downloaded
        case requestedAt = "requested_at"
        case expiresAt = "expires_at"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "pending"
        requestedAt = try container.decodeIfPresent(String.self, forKey: .requestedAt)
        expiresAt = try container.decodeIfPresent(String.self, forKey: .expiresAt)
        downloaded = try container.decodeIfPresent(Bool.self, forKey: .downloaded) ?? false
    }

    public var isReady: Bool { status == "ready" && !downloaded }

    /// «Готовим архив», «Готова», «Не получилось»…
    public var statusTitle: String {
        switch status {
        case "pending", "building": return "Готовим архив — это займёт несколько минут"
        case "ready": return downloaded ? "Архив уже скачан" : "Готова"
        case "failed": return "Не получилось собрать архив"
        default: return status
        }
    }
}

@MainActor
@Observable
public final class ExportModel {
    public static let dailyLimitMessage = "Выгрузку можно запрашивать раз в сутки. Попробуйте завтра."

    public private(set) var latest: DataExport?
    public private(set) var working = false
    public var message: String?
    private let api: APIClient
    private let directory: URL

    public init(api: APIClient, directory: URL = FileManager.default.temporaryDirectory) {
        self.api = api
        self.directory = directory
    }

    public func load() async {
        struct Answer: Decodable, Sendable { let exports: [DataExport] }
        if let answer: Answer = try? await api.send(.get("/api/v1/users/me/export")) {
            latest = answer.exports.first
        }
    }

    /// «Выгрузить мои данные».
    public func request() async {
        working = true
        defer { working = false }
        do {
            latest = try await api.send(Endpoint(method: .post, path: "/api/v1/users/me/export"))
            message = nil
        } catch APIError.server(429, _, _) {
            message = Self.dailyLimitMessage
        } catch APIError.server(409, _, _) {
            message = "Архив уже готовится."
            await load()
        } catch {
            message = ErrorMessages().message(for: error)
        }
    }

    /// «Скачать»: файл архива во временном каталоге — его открывает share sheet.
    public func download() async -> URL? {
        guard let latest, latest.isReady else { return nil }
        working = true
        defer { working = false }
        do {
            let raw = try await api.sendRaw(.get("/api/v1/users/me/export/\(latest.id)"))
            guard (200..<300).contains(raw.status) else { throw raw.apiError }
            let url = directory.appendingPathComponent("vzvesheno-export-\(String(latest.requestedAt?.prefix(10) ?? "data")).zip")
            try raw.data.write(to: url, options: .atomic)
            self.latest?.downloaded = true
            return url
        } catch APIError.server(410, _, _) {
            message = "Ссылка на архив устарела. Запросите выгрузку снова."
            return nil
        } catch {
            message = ErrorMessages().message(for: error)
            return nil
        }
    }
}

// MARK: Удаление аккаунта

/// «Удалить аккаунт» (`ios-client-settings`, Guideline 5.1.1(v)): слово
/// «УДАЛИТЬ» и пароль, у аккаунта без пароля — код из письма.
@MainActor
@Observable
public final class DeletionModel {
    public static let confirmationWord = "УДАЛИТЬ"

    public var word = ""
    public var password = ""
    public var code = ""
    public private(set) var hasPassword: Bool?
    public private(set) var codeSent = false
    public private(set) var working = false
    public var error: String?
    private let api: APIClient

    public init(api: APIClient, hasPassword: Bool? = nil) {
        self.api = api
        self.hasPassword = hasPassword
    }

    public func load() async {
        if let linked = try? await AccountService(api: api).linkedProviders() {
            hasPassword = linked.hasPassword
        }
    }

    public var canSubmit: Bool {
        guard word.trimmingCharacters(in: .whitespaces) == Self.confirmationWord, let hasPassword, !working else { return false }
        return hasPassword ? !password.isEmpty : code.filter(\.isNumber).count == 6
    }

    /// «Прислать код» — для аккаунта без пароля.
    public func sendCode() async {
        working = true
        defer { working = false }
        do {
            _ = try await api.send(Endpoint(method: .post, path: "/api/v1/users/me/deletion/code"), as: EmptyResponse.self)
            codeSent = true
            error = nil
        } catch {
            self.error = ErrorMessages().message(for: error)
        }
    }

    /// `POST /users/me/deletion`; `202` — дата удаления.
    public func submit() async -> PendingDeletion? {
        guard canSubmit, let hasPassword else { return nil }
        working = true
        defer { working = false }
        struct Answer: Decodable, Sendable {
            let requestedAt: String?
            let scheduledFor: String
            enum CodingKeys: String, CodingKey {
                case requestedAt = "requested_at"
                case scheduledFor = "scheduled_for"
            }
        }
        do {
            let body = hasPassword ? ["current_password": password] : ["code": code.filter(\.isNumber)]
            let answer: Answer = try await api.send(try .post("/api/v1/users/me/deletion", body: body))
            error = nil
            return PendingDeletion(requestedAt: answer.requestedAt, scheduledFor: answer.scheduledFor)
        } catch APIError.server(401, _, _) {
            error = hasPassword ? "Неверный пароль." : "Неверный код."
        } catch APIError.server(409, _, _) {
            error = "Удаление уже запрошено."
        } catch {
            self.error = ErrorMessages().message(for: error)
        }
        return nil
    }
}

extension PendingDeletion {
    /// «Аккаунт будет удалён 17 ноября. До этой даты удаление можно отменить, войдя снова».
    public var signedOutMessage: String {
        "\(title). До этой даты удаление можно отменить, войдя снова"
    }
}
