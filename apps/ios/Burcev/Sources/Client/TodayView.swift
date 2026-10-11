import SwiftUI

struct TodayView: View {
    @Environment(SessionStore.self) private var session

    @State private var date = Date()
    @State private var content: Loadable<Snapshot> = .loading
    @State private var addingWater = false
    @State private var waterError: String?

    struct Snapshot: Sendable {
        var totals: Macros
        var targets: DailyTargets?
        var water: Water?
        var metrics: DailyMetrics?
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    DayPicker(date: $date)
                }
                switch content {
                case .loading:
                    Section { HStack { Spacer(); ProgressView(); Spacer() } }
                case let .failed(message):
                    Section { ErrorRetryView(message: message) { Task { await load() } } }
                case let .loaded(snapshot):
                    nutrition(snapshot)
                    water(snapshot.water)
                    activity(snapshot.metrics)
                }
            }
            .navigationTitle("Сегодня")
            .refreshable { await load() }
            .task(id: APIDates.day(date)) { await load() }
        }
    }

    @ViewBuilder
    private func nutrition(_ snapshot: Snapshot) -> some View {
        let target = snapshot.targets?.macros
        Section {
            MacroRow(title: "Калории", value: snapshot.totals.calories, target: target?.calories, unit: "ккал")
            MacroRow(title: "Белки", value: snapshot.totals.protein, target: target?.protein, unit: "г")
            MacroRow(title: "Жиры", value: snapshot.totals.fat, target: target?.fat, unit: "г")
            MacroRow(title: "Углеводы", value: snapshot.totals.carbs, target: target?.carbs, unit: "г")
        } header: {
            Text("Питание")
        } footer: {
            if let message = snapshot.targets?.message, target == nil {
                Text(message)
            } else if snapshot.targets?.isCuratorOverride == true {
                Text("Цели задал куратор.")
            }
        }
    }

    @ViewBuilder
    private func water(_ water: Water?) -> some View {
        if let water {
            Section {
                HStack {
                    VStack(alignment: .leading) {
                        Text("\(water.glasses) из \(water.goal) стаканов")
                            .monospacedDigit()
                        Text("Стакан — \(water.glass_size) мл")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        Task { await addWater() }
                    } label: {
                        if addingWater {
                            ProgressView()
                        } else {
                            Label("Стакан", systemImage: "plus.circle.fill")
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(addingWater)
                    .accessibilityIdentifier("today.addWater")
                }
                if let waterError {
                    Text(waterError).foregroundStyle(.red).font(.footnote)
                }
            } header: {
                Text("Вода")
            }
        }
    }

    @ViewBuilder
    private func activity(_ metrics: DailyMetrics?) -> some View {
        if let metrics {
            Section("Активность") {
                LabeledContent("Шаги", value: metrics.steps.formatted())
                if let weight = metrics.weight {
                    LabeledContent("Вес", value: "\(weight.formatted(.number.precision(.fractionLength(1)))) кг")
                }
                LabeledContent("Тренировка", value: metrics.workout_completed ? "Выполнена" : "—")
            }
        }
    }

    private func load() async {
        let day = APIDates.day(date)
        let api = session.api
        if content.value == nil { content = .loading }
        do {
            // Четыре независимых запроса — параллельно: экран ждёт самого
            // медленного, а не их сумму.
            async let entries = api.send(Endpoint<EntriesResponse>.get(
                "/api/v1/food-tracker/entries", query: [URLQueryItem(name: "date", value: day)]))
            async let targets = api.send(Endpoint<DailyTargets>.get(
                "/api/v1/nutrition-calc/targets", query: [URLQueryItem(name: "date", value: day)]))
            async let water = api.send(Endpoint<Water>.get(
                "/api/v1/food-tracker/water", query: [URLQueryItem(name: "date", value: day)]))
            async let metrics = api.send(Endpoint<DailyMetrics>.get("/api/v1/dashboard/daily/\(day)"))

            let snapshot = Snapshot(
                totals: try await entries.dailyTotals,
                targets: try? await targets,
                water: try? await water,
                metrics: try? await metrics)
            content = .loaded(snapshot)
        } catch is CancellationError {
            return
        } catch {
            content = .failed(error.userMessage)
        }
    }

    private func addWater() async {
        addingWater = true
        waterError = nil
        defer { addingWater = false }
        do {
            let water = try await session.api.send(Endpoint<Water>.post(
                "/api/v1/food-tracker/water", body: AddWaterRequest(date: APIDates.day(date), glasses: 1)))
            if case var .loaded(snapshot) = content {
                snapshot.water = water
                content = .loaded(snapshot)
            }
        } catch {
            waterError = error.userMessage
        }
    }
}
