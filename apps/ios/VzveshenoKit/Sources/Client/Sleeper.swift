import Foundation

/// Пауза, которую тесты подменяют виртуальным временем: задержка поиска
/// (300 мс) и окно отмены удаления (5 с) проверяются без ожидания.
public protocol Sleeper: Sendable {
    /// Бросает `CancellationError`, если задачу отменили во время паузы.
    func sleep(for duration: Duration) async throws
}

/// Настоящее время.
public struct TaskSleeper: Sleeper {
    public init() {}

    public func sleep(for duration: Duration) async throws {
        try await Task.sleep(for: duration)
    }
}
