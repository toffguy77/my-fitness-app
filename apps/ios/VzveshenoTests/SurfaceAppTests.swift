import AppIntents
import Client
import Foundation
import Navigation
import Surfaces
@testable import Vzvesheno
import XCTest

/// Виджеты, Пункт управления и App Intents на модели приложения
/// (`ios-system-surfaces`, задачи 1.1, 3.1, 4.1, 4.2).
@MainActor
final class SurfaceAppTests: XCTestCase {
    private func started(_ scenario: UITestScenario) async -> AppModel {
        let model = scenario.makeModel(environment: AppEnvironment.current())
        await model.start()
        return model
    }

    private func waitFor(_ condition: () -> Bool) async {
        for _ in 0..<100 where !condition() {
            try? await Task.sleep(for: .milliseconds(20))
        }
    }

    // MARK: Снимок (1.1)

    /// «Сегодня» клиента пишет снимок; выход его стирает — виджет больше не
    /// показывает данных аккаунта.
    func testClientSnapshotIsWrittenAndErasedOnSignOut() async throws {
        let model = await started(.client)
        await waitFor { model.surfaces.current != nil }
        let snapshot = try XCTUnwrap(model.surfaces.current, "«Сегодня» записала снимок")
        XCTAssertEqual(snapshot.userID, 7)
        XCTAssertEqual(snapshot.role, "client")
        XCTAssertNotNil(snapshot.nutrition)

        await model.signOut()
        XCTAssertNil(model.surfaces.current, "выход стёр снимок")
        XCTAssertEqual(ClientWidgetState(model.surfaces.current, sessionUserID: nil, now: Date()), .signedOut)
    }

    /// Куратор: роль и сводка «Клиентов» — для виджета куратора.
    func testCuratorSnapshot() async throws {
        let model = await started(.coordinator)
        await waitFor { model.surfaces.current?.curator != nil }
        let snapshot = try XCTUnwrap(model.surfaces.current)
        XCTAssertEqual(snapshot.role, "coordinator")
        XCTAssertNil(snapshot.nutrition, "данных дня у куратора нет")
        XCTAssertNotNil(snapshot.curator)
        XCTAssertEqual(ClientWidgetState(snapshot, sessionUserID: 7, now: Date()), .wrongRole)
    }

    /// Без сессии при запуске снимка нет (выход без сети, сбой посреди стирания).
    func testSignedOutLaunchErasesALeftoverSnapshot() async throws {
        let model = UITestScenario.signedOut.makeModel(environment: AppEnvironment.current())
        try SnapshotRepository(store: model.snapshot).save(WidgetFixture.snapshot())
        await model.start()
        XCTAssertNil(model.surfaces.current)
    }

    // MARK: Пункт управления и «Запиши еду» (3.1, 4.2)

    /// Сценарий «Штрихкод из Пункта управления»: приложение сразу на сканере.
    func testBarcodeControlOpensTheScanner() async throws {
        let model = await started(.client)
        _ = try await OpenFoodLoggingIntent(method: .barcode).perform()
        XCTAssertEqual(model.selectedTab, .diary)
        XCTAssertEqual(model.foodLog?.method, .barcode)
    }

    func testPhotoControlOpensThePhotoMethod() async throws {
        let model = await started(.client)
        _ = try await OpenFoodLoggingIntent(method: .photo).perform()
        XCTAssertEqual(model.foodLog?.method, .photo)
    }

    /// Сценарий «Без параметра»: лист «Записать еду» на поиске.
    func testFoodLoggingWithoutParameterOpensSearch() async throws {
        let model = await started(.client)
        _ = try await OpenFoodLoggingIntent().perform()
        XCTAssertEqual(model.foodLog?.method, .search)
    }

    /// Маршрут из расширения (приложение не было готово) открывается при
    /// выходе на передний план.
    func testRouteFromTheExtensionOpensOnForeground() async throws {
        let model = await started(.client)
        model.surfaceRoutes.save(.openDiary(add: .barcode))
        await model.onForeground()
        XCTAssertEqual(model.foodLog?.method, .barcode)
    }

    /// Вода — без приложения, еда — с приложением; элементы Пункта управления
    /// открывают его только для фото и штрихкода.
    func testWhichIntentsOpenTheApp() {
        XCTAssertFalse(AddWaterIntent.openAppWhenRun)
        XCTAssertFalse(RemainingCaloriesIntent.openAppWhenRun)
        XCTAssertFalse(LogWeightIntent.openAppWhenRun)
        XCTAssertTrue(OpenFoodLoggingIntent.openAppWhenRun)
        XCTAssertEqual(FoodLoggingMethod.photo.addMethod, .photo)
        XCTAssertEqual(FoodLoggingMethod.barcode.addMethod, .barcode)
    }

    // MARK: Фразы (4.1)

    /// Сценарий «Проверка объявлений»: четыре действия.
    func testFourAppShortcuts() {
        XCTAssertEqual(VzveshenoShortcuts.appShortcuts.count, 4)
    }
}
