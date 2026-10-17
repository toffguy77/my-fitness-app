import API
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Событие WebSocket `/ws` (`{type, data}`). Сервер шлёт только четыре вида;
/// о задачах и плане он по сокету не сообщает — их обновляет передний план,
/// pull-to-refresh и пуш.
public enum RealtimeEvent: Equatable, Sendable {
    /// Новое сообщение в переписке.
    case newMessage(conversationID: String)
    /// Непрочитанных сообщений стало столько.
    case unreadCount(Int)
    /// Собеседник печатает.
    case typing(conversationID: String)
    /// Новая статья — счётчик колокольчика.
    case contentNotification

    /// Кадр сокета → событие; незнакомое и битое — `nil`.
    public static func parse(_ frame: Data) -> RealtimeEvent? {
        struct Frame: Decodable {
            struct Payload: Decodable {
                let count: Int?
                let conversationID: String?
                enum CodingKeys: String, CodingKey {
                    case count
                    case conversationID = "conversation_id"
                }
            }
            let type: String
            let data: Payload?
        }
        guard let frame = try? JSONDecoder().decode(Frame.self, from: frame) else { return nil }
        switch frame.type {
        case "new_message": return .newMessage(conversationID: frame.data?.conversationID ?? "")
        case "unread_count_update": return .unreadCount(frame.data?.count ?? 0)
        case "typing": return .typing(conversationID: frame.data?.conversationID ?? "")
        case "content_notification": return .contentNotification
        default: return nil
        }
    }

    /// Адрес сокета по билету: `wss://<стенд>/ws?ticket=…`.
    public static func socketURL(base: URL, ticket: String) -> URL? {
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        components?.scheme = base.scheme == "http" ? "ws" : "wss"
        components?.path = "/ws"
        components?.queryItems = [URLQueryItem(name: "ticket", value: ticket)]
        return components?.url
    }
}

/// Сокет приложения: билет `POST /auth/ws-ticket`, затем `/ws?ticket=`.
/// Живёт, пока приложение на переднем плане; переподключение — по выходу
/// на передний план (переписка, `ios-client-chat`, добавит повтор с паузой).
public actor RealtimeConnection {
    private let api: APIClient
    private var continuation: AsyncStream<RealtimeEvent>.Continuation?
    #if canImport(Darwin)
    private var task: URLSessionWebSocketTask?
    #endif

    public init(api: APIClient) {
        self.api = api
    }

    /// События текущего подключения; новое подключение начинает новый поток.
    public func connect() async -> AsyncStream<RealtimeEvent> {
        disconnect()
        let (stream, continuation) = AsyncStream<RealtimeEvent>.makeStream()
        self.continuation = continuation
        #if canImport(Darwin)
        struct Ticket: Decodable, Sendable { let ticket: String }
        guard let endpoint = try? Endpoint.post("/api/v1/auth/ws-ticket", body: [String: String]()),
              let ticket = try? await api.send(endpoint, as: Ticket.self),
              let url = RealtimeEvent.socketURL(base: api.baseURL, ticket: ticket.ticket) else {
            continuation.finish()
            return stream
        }
        let task = URLSession.shared.webSocketTask(with: url)
        self.task = task
        task.resume()
        Task { await self.receive(task) }
        #else
        continuation.finish()
        #endif
        return stream
    }

    public func disconnect() {
        #if canImport(Darwin)
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        #endif
        continuation?.finish()
        continuation = nil
    }

    #if canImport(Darwin)
    private func receive(_ task: URLSessionWebSocketTask) async {
        while self.task === task {
            do {
                let message = try await task.receive()
                let data: Data?
                switch message {
                case let .string(text): data = Data(text.utf8)
                case let .data(raw): data = raw
                @unknown default: data = nil
                }
                if let data, let event = RealtimeEvent.parse(data) {
                    continuation?.yield(event)
                }
            } catch {
                if self.task === task { disconnect() }
                return
            }
        }
    }
    #endif
}
