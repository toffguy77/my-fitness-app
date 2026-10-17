import XCTest

/// `ios-auth-flows` на заглушке API (задачи 1.1 и 1.2).
@MainActor
final class AuthUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ scenario: String, _ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestScenario", scenario, "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"] + extra
        app.launch()
        return app
    }

    /// «VK выключен на сервере»: провайдеры `yandex` и `apple`.
    func testOnlyEnabledProvidersAreShown() {
        let app = launch("signedOut", ["-uiTestProviders", "yandex,apple"])
        XCTAssertTrue(app.buttons["signIn.provider.yandex"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Яндекс ID"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["signIn.apple"].exists, "«Вход с Apple»")
        XCTAssertFalse(app.buttons["VK ID"].exists)
        XCTAssertFalse(app.buttons["signIn.provider.vk"].exists)
    }

    func testAllProvidersInOrder() {
        let app = launch("signedOut", ["-uiTestProviders", "apple,yandex,vk"])
        let apple = app.descendants(matching: .any)["signIn.apple"]
        XCTAssertTrue(apple.waitForExistence(timeout: 10))
        let yandex = app.buttons["signIn.provider.yandex"]
        let vk = app.buttons["signIn.provider.vk"]
        XCTAssertTrue(yandex.exists && vk.exists)
        XCTAssertLessThan(apple.frame.minY, yandex.frame.minY, "Apple — первой")
        XCTAssertTrue(app.buttons["signIn.magicLink"].exists)
        XCTAssertTrue(app.buttons["signIn.password"].exists)
    }

    /// «Попытка продолжить без согласия на ПДн».
    func testConsentsRequireAllThree() {
        let app = launch("signedOut", ["-uiTestPendingConsents"])
        let submit = app.buttons["consents.submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 10))
        let switches = app.switches
        switches.element(boundBy: 0).tap()
        switches.element(boundBy: 1).tap()
        XCTAssertFalse(submit.isEnabled, "без согласия на ПДн «Продолжить» недоступна")
        switches.element(boundBy: 2).tap()
        XCTAssertTrue(submit.isEnabled)
    }

    /// «Код из подсказки клавиатуры»: проверка уходит без нажатия кнопки.
    func testCodeIsCheckedAfterTheSixthDigit() {
        let app = launch("unverified")
        let field = app.textFields["verify.code"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("482913")
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10), "почта подтверждена — открыт «Сегодня»")
    }

    /// «Повторная отправка»: сразу после отправки кнопка недоступна и показывает остаток.
    func testResendIsLockedWithCountdown() {
        let app = launch("unverified")
        let resend = app.buttons["verify.resend"]
        XCTAssertTrue(resend.waitForExistence(timeout: 10))
        XCTAssertFalse(resend.isEnabled)
        XCTAssertTrue(resend.label.hasPrefix("Отправить повторно через 0:"), resend.label)
    }

    /// «Просроченная ссылка» — «Ссылка устарела» с «Получить новую».
    func testExpiredMagicLink() {
        let app = launch("signedOut", ["-uiTestOpenURL", "https://new.burcev.team/auth/link/consume?token=old"])
        XCTAssertTrue(app.staticTexts["Ссылка устарела"].waitForExistence(timeout: 10))
        app.buttons["linkExpired.again"].tap()
        XCTAssertTrue(app.buttons["signIn.magicLink"].waitForExistence(timeout: 5))
    }

    /// «Слабый пароль»: «qwerty12» — «Сохранить» недоступна, пункты отмечены.
    func testWeakPasswordOnReset() {
        let app = launch("signedOut", ["-uiTestOpenURL", "https://new.burcev.team/reset-password?token=r1"])
        let field = app.secureTextFields["reset.password"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("qwerty12")
        XCTAssertTrue(app.descendants(matching: .any)["password.rule.length.met"].waitForExistence(timeout: 5), app.screenSummary)
        XCTAssertFalse(app.buttons["reset.save"].isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["password.rule.uppercase.unmet"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["password.rule.special.unmet"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["password.rule.digit.met"].exists)
    }

    /// «Отмена удаления»: вход аккаунта, ждущего удаления, → экран → отмена → корень роли.
    func testCancelPendingDeletion() {
        let app = launch("signedOut")
        XCTAssertTrue(app.buttons["signIn.password"].waitForExistence(timeout: 10))
        app.buttons["signIn.password"].tap()
        let email = app.textFields["password.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        email.tap()
        email.typeText("deleting@example.com")
        let password = app.secureTextFields["password.password"]
        password.tap()
        password.typeText("Secret12!")
        app.buttons["signIn.submit"].tap()
        XCTAssertTrue(app.staticTexts["Аккаунт будет удалён 31 октября"].waitForExistence(timeout: 10))
        app.buttons["deletion.cancel"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10), app.screenSummary)
    }
}
