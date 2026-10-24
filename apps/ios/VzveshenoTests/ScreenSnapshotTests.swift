import Client
import DesignSystem
import SwiftUI
@testable import Vzvesheno
import XCTest

/// Экраны с макетами (`/home/…/mockups`, копия холста «Взвешено · iOS»):
/// SignIn.png, Today.png и TodayDark.png, HealthConnect.png. Данные — те же,
/// что на макетах; системные таббар и аксессуар «Записать еду» не рисуются.
@MainActor
final class ScreenSnapshotTests: XCTestCase {
    func testSignIn() {
        assertScreenSnapshot(
            SignInContent(providers: ["apple", "yandex", "vk"], sessionMessage: nil, email: .constant(""), errorText: nil,
                          working: false),
            named: "light")
    }

    func testToday() {
        let content = TodayContent(state: TodayFixture.state, avatarInitial: "Д")
        for scheme in [ColorScheme.light, .dark] {
            let name = scheme == .light ? "light" : "dark"
            assertScreenSnapshot(ScrollView { content }.scrollDisabled(true), named: name, colorScheme: scheme)
            // Весь экран целиком — блоки ниже сгиба.
            assertScreenSnapshot(content, named: "\(name)-full", colorScheme: scheme, height: nil)
        }
    }

    func testTodayWithoutNorm() {
        assertScreenSnapshot(TodayContent(state: TodayFixture.noNorm, avatarInitial: "Д"), named: "light", height: nil)
    }

    func testHealthConnect() {
        let explainer = HealthExplainer(failed: false, working: false, continueTitle: "health.connect.continue",
                                        notNowTitle: "health.connect.notNow", onContinue: {}, onNotNow: {})
        assertScreenSnapshot(ScrollView { explainer.padding(.horizontal, DS.Space.screenX) }.scrollDisabled(true), named: "light")
    }
}

// MARK: Запись еды и «Дневник» (макеты AddFood.png, Scan.png, PhotoResult.png, Diary.png)

extension ScreenSnapshotTests {
    /// Лист «Записать еду», поиск «гречка», выбрана гречка 150 г в ужин. Сам
    /// лист (затемнение и скругление сверху) рисует система.
    func testAddFood() {
        assertScreenSnapshot(addFood(meal: .dinner), named: "light")
    }

    /// #279: шапка листа на крупном тексте. На крупнейшем размере вне
    /// доступности (xxxLarge) — ещё одной строкой, если «Отмена», заголовок
    /// и «Перекус» (самая длинная подпись приёма) помещаются; на AX5 —
    /// столбиком, выбор приёма своей строкой под заголовком. Ничто ни на
    /// что не наезжает.
    func testAddFoodLargeText() {
        assertScreenSnapshot(addFood(meal: .snack), named: "xxxLarge", typeSize: .xxxLarge)
        // На AX5 выдача уходит далеко за экран — снимок шапки и переключателя
        // способов целиком, без выдачи.
        assertScreenSnapshot(AddFoodContent(method: .constant(.search), meal: .constant(.snack), onCancel: {},
                                            content: { EmptyView() }),
                             named: "ax5", height: nil, typeSize: .accessibility5)
    }

    private func addFood(meal: MealType) -> some View {
        AddFoodContent(method: .constant(.search), meal: .constant(meal), onCancel: {}, content: {
            FoodSearchContent(query: .constant("гречка"), showsSuggestions: false, results: FoodFixture.results, recent: [],
                              favorites: [FoodFixture.results[0]], searching: false, error: nil, searchedFor: "гречка",
                              isFavorite: { $0.id == "p1" }, selected: FoodFixture.results[0],
                              portion: .constant(Portion(unit: .grams, amount: 150)), meal: .dinner,
                              onSelect: { _ in }, onStar: { _ in }, onAdd: {})
        })
    }

    /// Сканер нашёл йогурт: карточка с «Добавить 140 г». Камера — фоном.
    func testScan() {
        assertScreenSnapshot(
            ScanContent(found: FoodFixture.yogurt, portion: Portion(unit: .grams, amount: 140), message: nil, looking: false,
                        torchOn: false, torchAvailable: true, topInset: 58, onClose: {}, onTorch: {}, onManual: {},
                        onAdd: {}, camera: { Color.clear })
            .padding(.top, -54),
            named: "light")
    }

    /// «Нашли на тарелке»: грудке вес подставлен, рису — нет, соус — «Найти».
    func testPhotoResult() {
        var result = RecognitionResult(recognition: FoodFixture.plate)
        result.applyEstimate(0)
        assertScreenSnapshot(
            PhotoResultContent(result: result, meal: .lunch, photoCaption: "Обед · 13:20", onRetake: {}, onStep: { _, _ in },
                               onApply: { _ in }, onFind: { _ in }, onAdd: {}),
            named: "light")
    }

    /// «Дневник» 17 октября: завтрак и обед, у грудки открыт «Удалить», ужин пуст.
    func testDiary() {
        let state = FoodFixture.diary
        let content = VStack(spacing: DS.Space.s3) {
            DiaryHeader(state: state, tab: .constant(.ration), actions: DiaryActions())
            DiaryRationContent(state: state, revealedEntryID: "e3")
        }
        .padding(.horizontal, DS.Space.screenX)
        assertScreenSnapshot(ScrollView { content }.scrollDisabled(true), named: "light")
        assertScreenSnapshot(content, named: "light-full", height: nil)
        assertScreenSnapshot(content, named: "dark-full", colorScheme: .dark, height: nil)
    }

    /// Детали нутриента (задача 4.3): норма, польза, «При недостатке»,
    /// «Откуда в рационе», «посчитано по 3 из 5 записей».
    func testNutrientDetail() {
        assertScreenSnapshot(NutrientDetailContent(item: FoodFixture.vitaminD).padding(.horizontal, DS.Space.screenX),
                             named: "light", height: nil)
    }
}

/// Данные макетов записи еды и дневника.
enum FoodFixture {
    static let results = [
        FoodItem(id: "p1", name: "Гречка отварная", per100: Nutrition(calories: 110, protein: 4, fat: 1, carbs: 21),
                 source: "database"),
        FoodItem(id: "p2", name: "Гречка ядрица «Мистраль»", per100: Nutrition(calories: 313, protein: 12.6, fat: 3.3, carbs: 62),
                 source: "openfoodfacts", barcode: "4600000000001"),
        FoodItem(id: "p3", name: "Гречка с курицей", per100: Nutrition(calories: 150, protein: 11, fat: 4, carbs: 17),
                 source: "user"),
    ]

    static let yogurt = FoodItem(id: "y1", name: "Йогурт греческий 2%", brand: "Теос", servingSize: 140, servingUnit: "g",
                                 per100: Nutrition(calories: 66, protein: 7, fat: 2, carbs: 4), source: "openfoodfacts",
                                 barcode: "4607012345678")

    static let plate = Recognition(
        foods: [RecognizedFood(name: "Курица с рисом", confidence: 0.4, estimatedWeight: 360,
                               per100: Nutrition(calories: 140, protein: 18, fat: 2, carbs: 14))],
        composition: [
            RecognizedFood(name: "Куриная грудка запечённая", confidence: 0.95, estimatedWeight: 150,
                           per100: Nutrition(calories: 152.7, protein: 30.7, fat: 3.3, carbs: 0)),
            RecognizedFood(name: "Рис басмати", confidence: 0.92, estimatedWeight: 180,
                           per100: Nutrition(calories: 127, protein: 2.7, fat: 0.3, carbs: 28)),
            RecognizedFood(name: "Соус, похож на сливочный", confidence: 0.4, estimatedWeight: 30,
                           per100: Nutrition(calories: 300, protein: 2, fat: 30, carbs: 5)),
        ],
        remaining: 2)

    static var diary: DiaryScreenState {
        let day = "2025-10-17"
        let rows: [MealType: [DiaryRow]] = [
            .breakfast: [
                DiaryRow(entry: FoodEntry(id: "e1", foodName: "Овсянка на молоке", mealType: .breakfast, portionAmount: 250,
                                          nutrition: Nutrition(calories: 280, protein: 25, fat: 40, carbs: 14), time: "08:10",
                                          date: day)),
                DiaryRow(entry: FoodEntry(id: "e2", foodName: "Кофе с молоком", mealType: .breakfast, portionType: .milliliters,
                                          portionAmount: 200, nutrition: Nutrition(calories: 40, protein: 5, fat: 4, carbs: 4),
                                          time: "08:12", date: day)),
            ],
            .lunch: [
                DiaryRow(entry: FoodEntry(id: "e3", foodName: "Куриная грудка запечённая", mealType: .lunch, portionAmount: 150,
                                          nutrition: Nutrition(calories: 229, protein: 46, fat: 5, carbs: 0), time: "13:20",
                                          date: day)),
            ],
        ]
        return DiaryScreenState(selected: day, today: day, calendar: TodayFixture.calendar, day: DayEntries(entries: [:]),
                                rows: rows, water: WaterDay(glasses: 5, goal: 8, enabled: true),
                                plan: WeeklyPlan(caloriesGoal: 2472, proteinGoal: 125, fatGoal: 80, carbsGoal: 230),
                                targets: nil, loaded: true)
    }

    static let vitaminD = NutrientRecommendation(
        id: "d1", name: "Витамин D", category: "vitamins", unit: "mcg",
        description: "Жирорастворимый витамин, который кожа вырабатывает на солнце.",
        benefits: "Помогает усваивать кальций, поддерживает кости, мышцы и иммунитет.",
        effects: "Слабость, боли в мышцах, ломкость костей, частые простуды.",
        dailyTarget: 15, normSource: "МР 2.3.1.0253-21", currentIntake: 4.2, percentage: 28, countedEntries: 3, totalEntries: 5)
}

/// День с макета Today.png: пятница, 17 октября; 549 из 2 472 по норме куратора.
enum TodayFixture {
    static let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)

    static let day = DailyMetrics(date: "2025-10-17", calories: 549, protein: 76, fat: 49, carbs: 18, weight: 78.4, steps: 6412,
                                  workoutCompleted: true, workoutTypes: ["strength"], workoutTypeDurations: ["strength": 45],
                                  workoutDuration: 45, stepsSource: .healthkit, weightSource: .healthkit, workoutSource: .healthkit)

    static let week = [
        DailyMetrics(date: "2025-10-13", calories: 1900, weight: 78.9, steps: 9000),
        DailyMetrics(date: "2025-10-14", calories: 2100, weight: 78.8),
        DailyMetrics(date: "2025-10-15", calories: 2000, weight: 78.6, steps: 7000),
        DailyMetrics(date: "2025-10-16", calories: 1800, steps: 11000),
        DailyMetrics(date: "2025-10-17", calories: 549, weight: 78.4),
    ]

    static let curator = FirstWeekState.Curator(
        conversationID: "c1", name: "Анна", unreadCount: 2,
        lastMessage: .init(text: "Белок держите отлично, добавьте овощей к ужину", fromCurator: true))

    static var snapshot: TodaySnapshot {
        TodaySnapshot(
            day: day,
            week: week,
            plan: WeeklyPlan(caloriesGoal: 2472, proteinGoal: 125, fatGoal: 80, carbsGoal: 230),
            targets: TargetsAnswer(targets: CalculatedTargets(calories: 2472, protein: 125, fat: 80, carbs: 230, workoutBonus: 210)),
            water: WaterDay(glasses: 5, goal: 8, enabled: true),
            tasks: [CuratorTask(id: "t1", title: "Сфотографировать обед", type: "nutrition", dueDate: "2025-10-31", recurrence: "daily")],
            onboarding: FirstWeekState(active: false, curator: curator, curatorAccess: .init(allowed: true)),
            progress: ProgressData(weightTrend: [.init(date: "2025-09-19", weight: 80.1), .init(date: "2025-10-10", weight: 78.7)],
                                   nutritionAdherence: 71),
            history: CalorieHistory(days: [
                .init(date: "2025-10-11", target: 2472, actual: 2300), .init(date: "2025-10-12", target: 2472, actual: 2600),
                .init(date: "2025-10-13", target: 2472, actual: 1900), .init(date: "2025-10-14", target: 2472, actual: 2100),
                .init(date: "2025-10-15", target: 2472, actual: 2000), .init(date: "2025-10-16", target: 2472, actual: 1800),
                .init(date: "2025-10-17", target: 2472, actual: 549),
            ]),
            unread: UnreadCounts(main: 3, content: 0)
        )
    }

    static var state: TodayScreenState {
        TodayScreenState(snapshot: snapshot, selected: "2025-10-17", today: "2025-10-17", calendar: calendar, photoUploaded: true)
    }

    static var noNorm: TodayScreenState {
        var snapshot = snapshot
        snapshot.plan = nil
        snapshot.targets = TargetsAnswer(targets: nil, missing: MissingTargetInputs(profile: true, weight: true))
        snapshot.tasks = []
        snapshot.onboarding = FirstWeekState(active: true,
                                             steps: [.init(key: "profile", done: false), .init(key: "first_meal", done: true)],
                                             curatorAccess: .init(allowed: false))
        return TodayScreenState(snapshot: snapshot, selected: "2025-10-18", today: "2025-10-18", calendar: calendar)
    }
}
