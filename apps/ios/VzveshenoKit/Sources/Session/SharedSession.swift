import API
import Foundation

/// Сессия глазами расширения виджетов и App Intents (`ios-app-foundation`,
/// «Одна очередь обновления сессии»).
///
/// Расширение читает сессию из общей группы Keychain, но не обновляет её и
/// ничего не стирает: два процесса с одним refresh-токеном — гонка, которая
/// кончается `session_ended` и выходом на всех устройствах. `SessionStore`
/// здесь не годится: его `restore()` на первом запуске стирает Keychain по
/// отметке установки, а отметка у расширения своя и всегда пуста.
public struct SharedSessionReader: Sendable {
    private let secure: SecureStore

    public init(secure: SecureStore) {
        self.secure = secure
    }

    /// Сессия, которую сохранило приложение, или `nil`, если никто не вошёл.
    public func session() -> NativeSession? {
        guard let data = try? secure.read(SessionStore.sessionKey) else { return nil }
        return try? JSONDecoder().decode(NativeSession.self, from: data)
    }

    public var user: SessionUser? { session()?.user }
}

/// Источник токена без обновления: текущий access-токен из Keychain;
/// просроченный — отказ `sessionEnded`, и очередь оставляет изменение
/// приложению (`DeliveryVerdict.retryLater`).
public struct ReadOnlyTokenProvider: AccessTokenProvider {
    private let reader: SharedSessionReader

    public init(reader: SharedSessionReader) {
        self.reader = reader
    }

    public func currentAccessToken() async -> String? {
        reader.session()?.accessToken
    }

    public func renewAccessToken(rejected: String?) async throws -> String {
        // Приложение могло уже обновить токен — тогда он в Keychain новый.
        if let current = reader.session()?.accessToken, current != rejected {
            return current
        }
        throw APIError.sessionEnded
    }

    /// Конец сессии обрабатывает приложение: оно и стирает данные аккаунта.
    public func sessionWasEnded() async {}
}
