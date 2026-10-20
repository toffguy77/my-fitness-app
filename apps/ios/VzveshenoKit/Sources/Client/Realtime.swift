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
    /// Сокет (пере)подключён: то, что пришло, пока его не было, надо перечитать.
    case connected

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

    /// Кадр «печатает» клиента: `{"type":"typing","data":{"conversation_id":…}}`.
    public static func typingFrame(conversationID: String) -> Data {
        let frame: [String: Any] = ["type": "typing", "data": ["conversation_id": conversationID]]
        return (try? JSONSerialization.data(withJSONObject: frame, options: [.sortedKeys])) ?? Data()
    }
}

/// Открытый сокет. Настоящий — `URLSessionWebSocketTask`, в тестах — подделка.
public protocol WebSocketChannel: Sendable {
    /// Следующий кадр; бросает, когда соединение закрыто или оборвано.
    func receive() async throws -> Data
    func send(_ frame: Data) async throws
    func close()
}

/// Открывает сокет по адресу с билетом.
public protocol WebSocketFactory: Sendable {
    func open(_ url: URL) async throws -> WebSocketChannel
}

/// Пауза перед переподключением: 1, 2, 4, 8, 16, затем 30 секунд.
public enum RealtimeBackoff {
    public static func delay(afterFailures failures: Int) -> Duration {
        guard failures > 0 else { return .seconds(1) }
        return .seconds(min(1 << min(failures, 5), 30))
    }
}

/// Сокет приложения: билет `POST /auth/ws-ticket`, затем `/ws?ticket=`.
///
/// Живёт, пока приложение на переднем плане. Обрыв — переподключение со
/// свежим билетом (билет одноразовый, 30 с) после паузы от 1 до 30 секунд
/// (`ios-client-chat`). Поток событий один на всё подключение и переживает
/// переподключения; после каждого открытия — `.connected`.
public actor RealtimeConnection {
    private let api: APIClient
    private let sockets: WebSocketFactory?
    private let sleeper: Sleeper
    private let now: @Sendable () -> Date
    private var continuation: AsyncStream<RealtimeEvent>.Continuation?
    private var loop: Task<Void, Never>?
    private var channel: WebSocketChannel?
    private var lastTyping: [String: Date] = [:]
    /// Сколько раз открывался сокет — для проверок.
    public private(set) var opened = 0

    public init(api: APIClient, sockets: WebSocketFactory? = RealtimeConnection.systemSockets, sleeper: Sleeper = TaskSleeper(),
                now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        self.sockets = sockets
        self.sleeper = sleeper
        self.now = now
    }

    /// Системные сокеты; на Linux их нет.
    public static var systemSockets: WebSocketFactory? {
        #if canImport(Darwin)
        return URLSessionSockets()
        #else
        return nil
        #endif
    }

    /// События подключения; новое подключение заканчивает прежний поток.
    public func connect() -> AsyncStream<RealtimeEvent> {
        disconnect()
        let (stream, continuation) = AsyncStream<RealtimeEvent>.makeStream()
        self.continuation = continuation
        guard let sockets else {
            continuation.finish()
            return stream
        }
        loop = Task { await self.run(sockets) }
        return stream
    }

    public func disconnect() {
        loop?.cancel()
        loop = nil
        channel?.close()
        channel = nil
        continuation?.finish()
        continuation = nil
    }

    /// «Печатает» собеседнику — не чаще раза в 2 секунды на переписку.
    @discardableResult
    public func sendTyping(conversationID: String) async -> Bool {
        let moment = now()
        if let last = lastTyping[conversationID], moment.timeIntervalSince(last) < 2 { return false }
        guard let channel else { return false }
        lastTyping[conversationID] = moment
        try? await channel.send(RealtimeEvent.typingFrame(conversationID: conversationID))
        return true
    }

    private func run(_ sockets: WebSocketFactory) async {
        var failures = 0
        while !Task.isCancelled {
            switch await openChannel(sockets) {
            case let .opened(channel):
                guard !Task.isCancelled else {
                    channel.close()
                    return
                }
                failures = 0
                self.channel = channel
                opened += 1
                continuation?.yield(.connected)
                await pump(channel)
                if Task.isCancelled { return }
                self.channel = nil
            case .stop:
                continuation?.finish()
                return
            case .retry:
                break
            }
            do {
                try await sleeper.sleep(for: RealtimeBackoff.delay(afterFailures: failures))
            } catch {
                return
            }
            failures += 1
        }
    }

    private enum Attempt {
        case opened(WebSocketChannel)
        case retry
        /// Сессия закончена — переподключаться нечем.
        case stop
    }

    private func openChannel(_ sockets: WebSocketFactory) async -> Attempt {
        struct Ticket: Decodable, Sendable { let ticket: String }
        do {
            let endpoint = try Endpoint.post("/api/v1/auth/ws-ticket", body: [String: String]())
            let ticket = try await api.send(endpoint, as: Ticket.self)
            guard let url = RealtimeEvent.socketURL(base: api.baseURL, ticket: ticket.ticket) else { return .retry }
            return .opened(try await sockets.open(url))
        } catch APIError.sessionEnded {
            return .stop
        } catch {
            return .retry
        }
    }

    private func pump(_ channel: WebSocketChannel) async {
        while !Task.isCancelled {
            guard let frame = try? await channel.receive() else { return }
            if let event = RealtimeEvent.parse(frame) {
                continuation?.yield(event)
            }
        }
    }
}

#if canImport(Darwin)
/// Сокеты на `URLSessionWebSocketTask`.
struct URLSessionSockets: WebSocketFactory {
    func open(_ url: URL) async throws -> WebSocketChannel {
        let task = URLSession.shared.webSocketTask(with: url)
        task.resume()
        return URLSessionChannel(task: task)
    }
}

final class URLSessionChannel: WebSocketChannel, @unchecked Sendable {
    let task: URLSessionWebSocketTask

    init(task: URLSessionWebSocketTask) { self.task = task }

    func receive() async throws -> Data {
        switch try await task.receive() {
        case let .string(text): return Data(text.utf8)
        case let .data(raw): return raw
        @unknown default: return Data()
        }
    }

    func send(_ frame: Data) async throws {
        try await task.send(.string(String(bytes: frame, encoding: .utf8) ?? ""))
    }

    func close() {
        task.cancel(with: .goingAway, reason: nil)
    }
}
#endif
