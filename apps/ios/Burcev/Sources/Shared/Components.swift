import SwiftUI

/// Переключатель дня: ‹ сегодня ›. Будущие дни не открываются — в них нечего
/// смотреть и некуда записывать.
struct DayPicker: View {
    @Binding var date: Date
    /// Меню планируется вперёд, дневник — нет.
    var allowFuture = false

    var body: some View {
        HStack {
            Button {
                shift(by: -1)
            } label: {
                Image(systemName: "chevron.left")
            }
            .accessibilityLabel("Предыдущий день")

            Spacer()
            Text(title)
                .font(.headline)
            Spacer()

            Button {
                shift(by: 1)
            } label: {
                Image(systemName: "chevron.right")
            }
            .disabled(!allowFuture && Calendar.current.isDateInToday(date))
            .accessibilityLabel("Следующий день")
        }
        .padding(.vertical, 4)
    }

    private var title: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Сегодня" }
        if calendar.isDateInYesterday(date) { return "Вчера" }
        if calendar.isDateInTomorrow(date) { return "Завтра" }
        return date.formatted(.dateTime.day().month(.wide).weekday(.abbreviated).locale(Locale(identifier: "ru_RU")))
    }

    private func shift(by days: Int) {
        if let next = Calendar.current.date(byAdding: .day, value: days, to: date) {
            date = next
        }
    }
}

/// Строка «факт / цель» с полосой заполнения.
struct MacroRow: View {
    let title: String
    let value: Double
    let target: Double?
    let unit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                Spacer()
                Text(label)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            if let target, target > 0 {
                ProgressView(value: min(value / target, 1))
                    .tint(value > target * 1.1 ? .orange : .accentColor)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var label: String {
        let fact = value.formatted(.number.precision(.fractionLength(0)))
        guard let target, target > 0 else { return "\(fact) \(unit)" }
        return "\(fact) / \(target.formatted(.number.precision(.fractionLength(0)))) \(unit)"
    }
}

/// Состояние загрузки экрана: идёт, ошибка с повтором, готово.
enum Loadable<Value: Sendable>: Sendable {
    case loading
    case failed(String)
    case loaded(Value)

    var value: Value? {
        if case let .loaded(value) = self { return value }
        return nil
    }
}

struct ErrorRetryView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Не загрузилось", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Повторить", action: retry)
                .buttonStyle(.borderedProminent)
        }
    }
}

extension Error {
    /// Текст для человека: у ошибок API он свой, у прочих — системный.
    var userMessage: String {
        (self as? LocalizedError)?.errorDescription ?? localizedDescription
    }
}
