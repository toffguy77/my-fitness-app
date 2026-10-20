import Foundation
import Navigation
import Surfaces
import TestSupport
import XCTest

/// Фразы, ответы голосом и маршруты App Intents и Пункта управления
/// (задачи 3.1, 4.1, 4.2; спеки `ios-app-intents`, `ios-controls`).
final class IntentCatalogTests: XCTestCase {
    private let nbsp = "\u{00A0}"

    // MARK: Склонения (4.2)

    func testKilocaloriePlurals() {
        let table: [(Int, String)] = [
            (1, "1 килокалория"), (2, "2 килокалории"), (5, "5 килокалорий"), (11, "11 килокалорий"),
            (21, "21 килокалория"), (1923, "1\(nbsp)923 килокалории"), (0, "0 килокалорий"), (112, "112 килокалорий"),
        ]
        for (value, expected) in table {
            XCTAssertEqual(SurfaceText.kilocalories(value), expected, "\(value)")
        }
    }

    func testGramPlurals() {
        let table: [(Int, String)] = [
            (1, "1 грамм"), (2, "2 грамма"), (5, "5 граммов"), (11, "11 граммов"), (21, "21 грамм"), (49, "49 граммов"),
            (1923, "1\(nbsp)923 грамма"),
        ]
        for (value, expected) in table {
            XCTAssertEqual(SurfaceText.grams(value), expected, "\(value)")
        }
    }

    func testOfGlassesPlurals() {
        XCTAssertEqual(SurfaceText.ofGlasses(1), "из 1 стакана")
        XCTAssertEqual(SurfaceText.ofGlasses(8), "из 8 стаканов")
        XCTAssertEqual(SurfaceText.ofGlasses(21), "из 21 стакана")
        XCTAssertEqual(SurfaceText.ofGlasses(11), "из 11 стаканов")
    }

    // MARK: «Сколько калорий осталось» (4.2)

    /// Сценарий «1 923 ккал».
    func testRemainingCaloriesAnswer() {
        XCTAssertEqual(RemainingCaloriesAnswer.text(Fixture.snapshot(), now: Fixture.friday),
                       "Осталось 1\(nbsp)923 килокалории. Белки — 49 граммов")
    }

    func testOverTheNormAnswer() {
        var snapshot = Fixture.snapshot(eaten: 2600)
        snapshot.nutrition?.protein = .init(eaten: 126, goal: 125)
        XCTAssertEqual(RemainingCaloriesAnswer.text(snapshot, now: Fixture.friday),
                       "Сверх нормы 128 килокалорий. Белки — сверх нормы 1 грамм")
    }

    func testNoSnapshotForTodayAsksToOpenTheApp() {
        XCTAssertEqual(RemainingCaloriesAnswer.text(nil, now: Fixture.friday),
                       "Откройте Взвешено, чтобы обновить данные за сегодня")
        XCTAssertEqual(RemainingCaloriesAnswer.text(Fixture.snapshot(date: "2025-10-16"), now: Fixture.friday),
                       "Откройте Взвешено, чтобы обновить данные за сегодня")
    }

    func testNoNormAnswer() {
        XCTAssertEqual(RemainingCaloriesAnswer.text(Fixture.snapshot(goal: nil), now: Fixture.friday), RemainingCaloriesAnswer.noNorm)
    }

    // MARK: Фразы (4.1)

    /// Сценарий «Проверка объявлений»: четыре действия с русскими фразами —
    /// в провайдере ровно они, по одной на действие.
    func testShortcutsProviderDeclaresTheFourPhrases() throws {
        let source = try RepositoryFiles.read("apps/ios/Vzvesheno/Intents/VzveshenoShortcuts.swift")
        XCTAssertEqual(ShortcutCatalog.phrases.count, 4)
        for phrase in ShortcutCatalog.phrases {
            XCTAssertTrue(source.contains("\"\(phrase)\""), "нет фразы «\(phrase)»")
        }
        XCTAssertEqual(source.components(separatedBy: "AppShortcut(intent:").count - 1, 4)
        for intent in ["AddWaterIntent()", "RemainingCaloriesIntent()", "LogWeightIntent()", "OpenFoodLoggingIntent()"] {
            XCTAssertTrue(source.contains("AppShortcut(intent: \(intent)"), intent)
        }
        let phrases = source.components(separatedBy: "\"").filter { $0.contains("\\(.applicationName)") }
        XCTAssertEqual(Set(phrases), Set(ShortcutCatalog.phrases), "в провайдере нет лишних фраз")
    }

    /// ITMS-90626: ни в одном тексте интентов, виджетов и элементов управления
    /// нет товарных знаков Apple — App Store Connect отвергает такую сборку
    /// молча, уже после загрузки.
    func testNoAppleTrademarksInIntentTexts() throws {
        let root = RepositoryFiles.url("apps/ios")
        let files = ["Shared", "VzveshenoWidgets", "Vzvesheno/Intents"].flatMap { folder -> [URL] in
            let enumerator = FileManager.default.enumerator(at: root.appendingPathComponent(folder), includingPropertiesForKeys: nil)
            return (enumerator?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
        }
        XCTAssertGreaterThanOrEqual(files.count, 5)
        for file in files {
            let source = try String(contentsOf: file, encoding: .utf8)
            // Только строковые литералы: комментарии объясняют запрет и называют слово.
            let literals = source.components(separatedBy: "\n")
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .flatMap { line in line.components(separatedBy: "\"").enumerated().filter { $0.offset % 2 == 1 }.map(\.element) }
            for literal in literals {
                for word in ShortcutCatalog.forbiddenWords {
                    XCTAssertFalse(literal.lowercased().contains(word), "«\(literal)» в \(file.lastPathComponent)")
                }
            }
        }
    }

    // MARK: Пункт управления и «Запиши еду» (3.1, 4.2)

    /// Три элемента; вода — без приложения, фото и штрихкод — лист «Записать
    /// еду» на своём способе.
    func testControls() {
        XCTAssertEqual(SurfaceControl.all.map(\.title), ["Добавить стакан воды", "Еда по фото", "Штрихкод"])
        XCTAssertNil(SurfaceControl.water.route)
        XCTAssertEqual(SurfaceControl.photo.route, .openDiary(add: .photo))
        XCTAssertEqual(SurfaceControl.barcode.route, .openDiary(add: .barcode))
        XCTAssertEqual(Set(SurfaceControl.all.map(\.kind)).count, 3)
    }

    /// Сценарий «Штрихкод из Пункта управления»: маршрутизатор ведёт клиента
    /// в «Дневник» с листом на сканере.
    func testControlRoutesThroughTheRouter() throws {
        let route = try XCTUnwrap(SurfaceControl.barcode.route)
        XCTAssertEqual(Router.target(for: Router.link(for: route), shell: .client),
                       NavigationTarget(tab: .diary, path: [.diaryDay(date: nil, add: .barcode)]))
        let photo = try XCTUnwrap(SurfaceControl.photo.route)
        XCTAssertEqual(Router.link(for: photo), .foodTracker(date: nil, add: .photo))
    }

    /// Сценарий «Без параметра»: «Запиши еду» — лист на поиске.
    func testFoodLoggingDefaultsToSearch() {
        XCTAssertEqual(FoodLoggingRoute.route(nil), .openDiary(add: .search))
        XCTAssertEqual(Router.link(for: FoodLoggingRoute.route(nil)), .foodTracker(date: nil, add: .search))
    }

    /// Маршрут из расширения ждёт приложение в App Group; забирается один
    /// раз; давний не открывается.
    func testPendingRouteStore() {
        let store = PendingRouteStore(directory: Fixture.directory())
        XCTAssertNil(store.take())
        store.save(.openDiary(add: .barcode), at: Fixture.friday)
        XCTAssertEqual(store.take(now: Fixture.friday.addingTimeInterval(3)), .openDiary(add: .barcode))
        XCTAssertNil(store.take(now: Fixture.friday.addingTimeInterval(4)), "забирается один раз")

        store.save(.openToday, at: Fixture.friday)
        XCTAssertNil(store.take(now: Fixture.friday.addingTimeInterval(PendingRouteStore.lifetime + 1)), "давний не открывается")
        XCTAssertNil(store.take(now: Fixture.friday))

        for route in [IntentRoute.openToday, .openChat, .openDiary(add: nil), .openDiary(add: .manual)] {
            store.save(route, at: Fixture.friday)
            XCTAssertEqual(store.take(now: Fixture.friday), route)
        }
        store.save(.openChat)
        store.erase()
        XCTAssertNil(store.take())
    }
}
