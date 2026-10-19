import AppIntents

/// Фразы для голоса и «Быстрых команд» (`ios-app-intents`). Только в
/// приложении: провайдер у приложения один. Те же действия без фраз видны в
/// «Быстрых командах» и Spotlight. Перечень сверяет `ShortcutCatalog` (тест
/// читает этот файл), товарных знаков Apple в текстах нет (ITMS-90626).
struct VzveshenoShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddWaterIntent(),
                    phrases: ["Добавь стакан воды во \(.applicationName)"],
                    shortTitle: "Стакан воды",
                    systemImageName: "drop.fill")
        AppShortcut(intent: RemainingCaloriesIntent(),
                    phrases: ["Сколько калорий осталось во \(.applicationName)"],
                    shortTitle: "Остаток калорий",
                    systemImageName: "flame")
        AppShortcut(intent: LogWeightIntent(),
                    phrases: ["Запиши вес во \(.applicationName)"],
                    shortTitle: "Записать вес",
                    systemImageName: "scalemass")
        AppShortcut(intent: OpenFoodLoggingIntent(),
                    phrases: ["Запиши еду во \(.applicationName)"],
                    shortTitle: "Записать еду",
                    systemImageName: "fork.knife")
    }
}
