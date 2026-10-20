import SwiftUI

/// Переключатель дня: ‹ сегодня ›, а по нажатию на дату — календарь.
///
/// Стрелки — `.borderless`: в строке списка кнопка без своего стиля отдаёт
/// нажатие всей строке, и две стрелки в одной строке не работали вовсе.
struct DayPicker: View {
    @Binding var date: Date
    /// Меню планируется вперёд, дневник — нет.
    var allowFuture = false
    /// На сколько дней вперёд можно заглянуть.
    var futureDays = 30

    @State private var choosing = false

    var body: some View {
        HStack {
            Button {
                shift(by: -1)
            } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 32)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Предыдущий день")

            Spacer()
            Button {
                choosing = true
            } label: {
                HStack(spacing: 4) {
                    Text(title).font(.headline)
                    Image(systemName: "calendar").font(.subheadline)
                }
            }
            .buttonStyle(.borderless)
            .foregroundStyle(.primary)
            .accessibilityHint("Выбрать день в календаре")
            Spacer()

            Button {
                shift(by: 1)
            } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 32)
            }
            .buttonStyle(.borderless)
            .disabled(!canGoForward)
            .accessibilityLabel("Следующий день")
        }
        .padding(.vertical, 4)
        .sheet(isPresented: $choosing) {
            NavigationStack {
                DatePicker("День", selection: Binding(get: { date }, set: { date = $0; choosing = false }),
                           in: range, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .environment(\.locale, Locale(identifier: "ru_RU"))
                    .padding()
                    .navigationTitle("Выберите день")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { choosing = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Сегодня") { date = Date(); choosing = false }
                        }
                    }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var range: ClosedRange<Date> {
        let calendar = Calendar.current
        let start = calendar.date(byAdding: .year, value: -2, to: Date())!
        let end = allowFuture ? calendar.date(byAdding: .day, value: futureDays, to: Date())! : Date()
        return start...end
    }

    private var canGoForward: Bool {
        let calendar = Calendar.current
        let next = calendar.date(byAdding: .day, value: 1, to: date)!
        return calendar.startOfDay(for: next) <= calendar.startOfDay(for: range.upperBound)
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
