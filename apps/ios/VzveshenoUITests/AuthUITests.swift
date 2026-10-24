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

    /// После входа с паролем система предлагает сохранить его в связке
    /// ключей; лист перекрывает экран и съедает нажатия.
    private func dismissSavePasswordPrompt(_ app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Не сейчас", "Not Now"] {
            for candidate in [springboard.buttons[label], app.buttons[label]] where candidate.waitForExistence(timeout: 2) {
                candidate.tap()
                return
            }
        }
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

    /// «Вход через Apple без сети» (`apple-sign-in`): nonce выдаёт сервер, и
    /// без него лист Apple не открывается — сразу понятная ошибка.
    func testAppleSignInWithoutNetworkExplainsInsteadOfOpeningTheSheet() {
        let app = launch("signedOut", ["-uiTestProviders", "apple,yandex", "-uiTestAppleNonceOffline"])
        let apple = app.descendants(matching: .any)["signIn.apple"]
        XCTAssertTrue(apple.waitForExistence(timeout: 10))
        apple.tap()
        let error = app.staticTexts["signIn.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(error.label.contains("Нет подключения"), error.label)
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

    /// «Получить новую» помнит адрес: ссылку просили на этом телефоне — новое
    /// письмо уходит туда же, без возврата к вводу почты.
    func testExpiredMagicLinkSendsANewOneToTheSameAddress() {
        let app = launch("signedOut", ["-uiTestMagicLinkEmail", "anna@example.com",
                                       "-uiTestOpenURL", "https://new.burcev.team/auth/link/consume?token=old"])
        XCTAssertTrue(app.staticTexts["Ссылка устарела"].waitForExistence(timeout: 10))
        app.buttons["linkExpired.again"].tap()
        let sent = app.staticTexts["linkExpired.sent"]
        XCTAssertTrue(sent.waitForExistence(timeout: 5), app.screenSummary)
        XCTAssertTrue(sent.label.contains("anna@example.com"), sent.label)
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
        dismissSavePasswordPrompt(app)
        XCTAssertTrue(app.staticTexts["Аккаунт будет удалён 31 октября"].waitForExistence(timeout: 10))
        app.buttons["deletion.cancel"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10), app.screenSummary)
    }
}
