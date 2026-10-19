import Foundation

/// Виртуальное время для `Sleeper`: пауза заканчивается только по
/// `advance(by:)`. Отмена задачи заканчивает паузу `CancellationError`.
public final class ManualSleeper: @unchecked Sendable {
    private struct Waiter {
        let id: UUID
        let deadline: Duration
        let continuation: CheckedContinuation<Void, Error>
    }

    private let lock = NSLock()
    private var now: Duration = .zero
    private var waiters: [Waiter] = []

    public init() {}

    /// Сколько пауз сейчас идёт.
    public var sleeping: Int { lock.withLock { waiters.count } }

    public func sleep(for duration: Duration) async throws {
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                lock.withLock {
                    if Task.isCancelled {
                        continuation.resume(throwing: CancellationError())
                    } else {
                        waiters.append(Waiter(id: id, deadline: now + duration, continuation: continuation))
                    }
                }
            }
        } onCancel: {
            let cancelled = lock.withLock { () -> Waiter? in
                guard let index = waiters.firstIndex(where: { $0.id == id }) else { return nil }
                return waiters.remove(at: index)
            }
            cancelled?.continuation.resume(throwing: CancellationError())
        }
    }

    /// Сдвинуть время: паузы, чей срок наступил, заканчиваются.
    public func advance(by duration: Duration) async {
        let due = lock.withLock { () -> [Waiter] in
            now += duration
            let due = waiters.filter { $0.deadline <= now }
            waiters.removeAll { $0.deadline <= now }
            return due
        }
        for waiter in due { waiter.continuation.resume() }
        // Дать проснувшимся задачам доработать.
        for _ in 0..<50 { await Task.yield() }
    }

    /// Дождаться, пока задачи дойдут до паузы.
    public func waitForSleepers(_ count: Int = 1) async {
        for _ in 0..<10_000 where sleeping < count {
            await Task.yield()
        }
    }
}
