import Foundation
#if canImport(Network)
import Network
#endif

/// Появление сети — один из поводов досылать очередь.
public protocol ConnectivityMonitor: Sendable {
    /// `true`, когда сеть есть. Первое значение — текущее состояние.
    func updates() -> AsyncStream<Bool>
}

/// Переходы «сеть пропала / появилась» из потока состояний монитора.
///
/// Первое значение — текущее состояние: без сети на запуске — это `.lost`
/// (плашка сразу), с сетью — ничего (досылку на запуске делает передний план).
public struct ConnectivityEdges: Sendable {
    public enum Edge: Equatable, Sendable {
        /// Сети не стало: плашка «Нет подключения».
        case lost
        /// Сеть появилась: досылка очереди и обновление экранов.
        case restored
    }

    private var last: Bool?

    public init() {}

    public mutating func next(_ online: Bool) -> Edge? {
        defer { last = online }
        switch (last, online) {
        case (nil, false), (true?, false): return .lost
        case (false?, true): return .restored
        default: return nil
        }
    }
}

#if canImport(Network)
/// `NWPathMonitor` как поток «есть сеть / нет сети».
public final class PathConnectivityMonitor: ConnectivityMonitor, @unchecked Sendable {
    public init() {}

    public func updates() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { path in
                continuation.yield(path.status == .satisfied)
            }
            continuation.onTermination = { _ in monitor.cancel() }
            monitor.start(queue: DispatchQueue(label: "team.burcev.app.connectivity"))
        }
    }
}
#endif
