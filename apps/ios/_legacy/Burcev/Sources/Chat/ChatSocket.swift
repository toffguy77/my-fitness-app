import Foundation
import Observation

/// Живое соединение с сервером: новые сообщения и счётчик непрочитанного без
/// опроса. Авторизация — одноразовый билет на 30 секунд (`/auth/ws-ticket`):
/// токен в адресе осел бы в журналах прокси.
///
/// Соединение держится, пока приложение на экране; при обрыве — повтор с
/// растущей паузой, как на сайте (1 с → ×2 → 30 с).
@MainActor
@Observable
final class ChatSocket {
    private(set) var unreadTotal = 0
    /// Последнее пришедшее сообщение — экраны переписки подхватывают своё.
    private(set) var lastMessage: Message?

    private var task: URLSessionWebSocketTask?
    private var loop: Task<Void, Never>?
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func start() {
        guard loop == nil, !Demo.isActive else { return }
        loop = Task { [weak self] in
            var delay: Double = 1
            while !Task.isCancelled {
                guard let self else { return }
                let connected = await self.connectOnce()
                if Task.isCancelled { return }
                delay = connected ? 1 : min(delay * 2, 30)
                try? await Task.sleep(for: .seconds(delay))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    func refreshUnread() async {
        struct Count: Decodable, Sendable { let count: Int }
        if let count = try? await api.send(Endpoint<Count>.get("/api/v1/conversations/unread")) {
            unreadTotal = count.count
        }
    }

    /// Одна сессия соединения: до обрыва. Возвращает, удалось ли подключиться.
    private func connectOnce() async -> Bool {
        struct Ticket: Decodable, Sendable { let ticket: String }
        guard let ticket = try? await api.send(Endpoint<Ticket>.post("/api/v1/auth/ws-ticket", body: [String: String]())),
              var components = URLComponents(url: AppConfig.apiBaseURL, resolvingAgainstBaseURL: false) else {
            return false
        }
        components.scheme = "wss"
        components.path = "/ws"
        components.queryItems = [URLQueryItem(name: "ticket", value: ticket.ticket)]
        guard let url = components.url else { return false }

        let socket = URLSession.shared.webSocketTask(with: url)
        task = socket
        socket.resume()
        await refreshUnread()
        var received = false
        while !Task.isCancelled {
            guard let frame = try? await socket.receive() else { break }
            received = true
            if case let .string(text) = frame {
                handle(Data(text.utf8))
            }
        }
        socket.cancel(with: .goingAway, reason: nil)
        return received
    }

    private func handle(_ data: Data) {
        struct Frame<T: Decodable>: Decodable { let type: String; let data: T }
        struct Kind: Decodable { let type: String }
        struct Count: Decodable { let count: Int }
        guard let kind = try? JSONDecoder.api.decode(Kind.self, from: data) else { return }
        switch kind.type {
        case "new_message":
            if let frame = try? JSONDecoder.api.decode(Frame<Message>.self, from: data) {
                lastMessage = frame.data
            }
        case "unread_count_update":
            if let frame = try? JSONDecoder.api.decode(Frame<Count>.self, from: data) {
                unreadTotal = frame.data.count
            }
        default:
            break
        }
    }
}
