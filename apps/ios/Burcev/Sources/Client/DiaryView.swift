import SwiftUI

struct DiaryView: View {
    @Environment(SessionStore.self) private var session

    @State private var date = Date()
    @State private var content: Loadable<EntriesResponse> = .loading
    @State private var addingTo: MealType?
    @State private var deleteError: String?
    @State private var editing: FoodEntry?

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
                case let .loaded(response):
                    Section {
                        LabeledContent("Итого", value: "\(response.dailyTotals.calories.formatted(.number.precision(.fractionLength(0)))) ккал")
                        Text(macroLine(response.dailyTotals))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(MealType.allCases) { meal in
                        mealSection(meal, entries: response.entries(for: meal))
                    }
                }
            }
            .navigationTitle("Дневник")
            .refreshable { await load() }
            .task(id: APIDates.day(date)) { await load() }
            .sheet(item: $addingTo) { meal in
                AddFoodView(meal: meal, date: date) {
                    Task { await load() }
                }
            }
            .sheet(item: $editing) { entry in
                NavigationStack {
                    PortionView(mode: .edit(entry), meal: entry.mealType, date: date) {
                        editing = nil
                        Task { await load() }
                    }
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { editing = nil } }
                    }
                }
            }
            .alert("Не удалось удалить", isPresented: Binding(
                get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(deleteError ?? "")
            }
        }
    }

    private func mealSection(_ meal: MealType, entries: [FoodEntry]) -> some View {
        Section {
            ForEach(entries) { entry in
                Button { editing = entry } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(entry.foodName)
                        Spacer()
                        Text("\(entry.nutrition.calories.formatted(.number.precision(.fractionLength(0)))) ккал")
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    Text("\(entry.portionAmount.formatted(.number.precision(.fractionLength(0...1)))) \(unit(entry.portionType)) · \(entry.time)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .foregroundStyle(.primary)
                }
            }
            .onDelete { offsets in
                let doomed = offsets.map { entries[$0] }
                Task { await delete(doomed) }
            }
            Button {
                addingTo = meal
            } label: {
                Label("Добавить", systemImage: "plus")
            }
            .accessibilityIdentifier("diary.add.\(meal.rawValue)")
        } header: {
            Text(meal.title)
        }
    }

    private func unit(_ portionType: String) -> String {
        switch portionType {
        case "milliliters": return "мл"
        case "portion": return "порц."
        default: return "г"
        }
    }

    private func macroLine(_ m: Macros) -> String {
        let f = FloatingPointFormatStyle<Double>.number.precision(.fractionLength(0))
        return "Б \(m.protein.formatted(f)) · Ж \(m.fat.formatted(f)) · У \(m.carbs.formatted(f))"
    }

    private func load() async {
        if content.value == nil { content = .loading }
        do {
            let response = try await session.api.send(Endpoint<EntriesResponse>.get(
                "/api/v1/food-tracker/entries", query: [URLQueryItem(name: "date", value: APIDates.day(date))]))
            content = .loaded(response)
        } catch is CancellationError {
            return
        } catch {
            content = .failed(error.userMessage)
        }
    }

    private func delete(_ entries: [FoodEntry]) async {
        for entry in entries {
            do {
                _ = try await session.api.send(Endpoint<DeleteResult>.delete("/api/v1/food-tracker/entries/\(entry.id)"))
                await HealthService.shared.deleteNutrition(entryID: entry.id)
            } catch {
                deleteError = error.userMessage
            }
        }
        await load()
    }
}
