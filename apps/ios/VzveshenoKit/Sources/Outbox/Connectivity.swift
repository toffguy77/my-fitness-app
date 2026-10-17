import Foundation
#if canImport(Network)
import Network
#endif

/// Появление сети — один из поводов досылать очередь.
public protocol ConnectivityMonitor: Sendable {
    /// `true`, когда сеть есть. Первое значение — текущее состояние.
    func updates() -> AsyncStream<Bool>
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
