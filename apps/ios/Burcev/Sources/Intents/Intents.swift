import AppIntents

/// «Привет, Siri, добавь стакан воды в BURCEV» — без открытия приложения.
struct AddWaterIntent: AppIntent {
    static let title: LocalizedStringResource = "Добавить стакан воды"
    static let description = IntentDescription("Отмечает выпитый стакан воды в дневнике BURCEV и в Apple Здоровье.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let session = SessionStore(interactive: false)
        await session.restore()
        guard session.user != nil else {
            return .result(dialog: "Сначала войдите в приложение BURCEV.")
        }
        let water = try await session.api.send(Endpoint<Water>.post(
            "/api/v1/food-tracker/water", body: AddWaterRequest(date: APIDates.day(Date()), glasses: 1)))
        await HealthService.shared.saveWater(milliliters: Double(water.glass_size))
        return .result(dialog: "Записал. Сегодня \(water.glasses) из \(water.goal) стаканов.")
    }
}

/// «Открой дневник в BURCEV».
struct OpenDiaryIntent: AppIntent {
    static let title: LocalizedStringResource = "Открыть дневник питания"
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set(Demo.Screen.diary.rawValue, forKey: "launch.tab")
        return .result()
    }
}

struct BurcevShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddWaterIntent(),
                    phrases: ["Добавь стакан воды в \(.applicationName)",
                              "Выпил стакан воды в \(.applicationName)"],
                    shortTitle: "Стакан воды",
                    systemImageName: "drop.fill")
        AppShortcut(intent: OpenDiaryIntent(),
                    phrases: ["Открой дневник в \(.applicationName)"],
                    shortTitle: "Дневник",
                    systemImageName: "fork.knife")
    }
}
