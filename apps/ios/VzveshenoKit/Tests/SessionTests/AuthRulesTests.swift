import API
import Foundation
import TestSupport
@testable import Session
import XCTest

/// Правила экранов входа (`ios-auth-flows`, задача 1.2).
final class AuthRulesTests: XCTestCase {
    /// «Слабый пароль»: «qwerty12» — «Сохранить» недоступна, отмечены
    /// заглавная и спецсимвол.
    func testWeakPasswordListsUnmetRules() {
        XCTAssertEqual(PasswordPolicy.unmet("qwerty12"), [.uppercase, .special])
        XCTAssertFalse(PasswordPolicy.isValid("qwerty12"))
        XCTAssertTrue(PasswordPolicy.isValid("Qwerty12!"))
        XCTAssertEqual(PasswordPolicy.unmet("Qw1!"), [.length])
        XCTAssertEqual(PasswordPolicy.unmet(String(repeating: "Qw1!", count: 33)), [.length], "больше 128")
    }

    /// «Код из подсказки клавиатуры»: вставка «482913» — код полный.
    func testPastedCodeIsCompleteAtTheSixthDigit() {
        XCTAssertEqual(VerificationCode.sanitize("482913"), "482913")
        XCTAssertTrue(VerificationCode.isComplete(VerificationCode.sanitize("482913")))
        XCTAssertEqual(VerificationCode.sanitize("Ваш код: 482 913."), "482913")
        XCTAssertEqual(VerificationCode.sanitize("12345678"), "123456")
        XCTAssertFalse(VerificationCode.isComplete("48291"))
    }

    /// «Повторная отправка»: через 30 с кнопка недоступна и показывает остаток.
    func testResendIsLockedForSixtySeconds() {
        let sent = Date(timeIntervalSince1970: 1000)
        let countdown = ResendCountdown(sentAt: sent)
        XCTAssertFalse(countdown.canResend(now: sent.addingTimeInterval(30)))
        XCTAssertEqual(countdown.title(now: sent.addingTimeInterval(30)), "Отправить повторно через 0:30")
        XCTAssertEqual(countdown.title(now: sent), "Отправить повторно через 1:00")
        XCTAssertTrue(countdown.canResend(now: sent.addingTimeInterval(60)))
        XCTAssertEqual(countdown.title(now: sent.addingTimeInterval(61)), "Отправить повторно")
    }

    /// Отсчёт — от момента отправки письма, а не от показа экрана: экран,
    /// открытый заново через 40 с (или после перезапуска), ждёт ещё 20 с.
    func testResendCountdownRunsFromTheSendTime() {
        let name = "verify-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        let sent = Date(timeIntervalSince1970: 10_000)
        VerificationSendClock(defaults: defaults).markSent(at: sent)

        let reopened = VerificationSendClock(defaults: defaults).countdown
        XCTAssertEqual(reopened.sentAt, sent)
        XCTAssertEqual(reopened.remaining(now: sent.addingTimeInterval(40)), 20)
        XCTAssertTrue(reopened.canResend(now: sent.addingTimeInterval(60)))

        // Отправка неизвестна (код просили на другом телефоне) — сразу можно.
        VerificationSendClock(defaults: defaults).forget()
        XCTAssertTrue(VerificationSendClock(defaults: defaults).countdown.canResend(now: sent))
    }

    func testPendingDeletionTitle() {
        XCTAssertEqual(PendingDeletion(scheduledFor: "2026-11-17T10:00:00Z").title, "Аккаунт будет удалён 17 ноября")
    }

    /// Вход аккаунта, ждущего удаления: сессия выдана, признак — в итоге входа.
    func testLoginWithPendingDeletionKeepsTheSession() async throws {
        let transport = StubTransport { _ in
            .success(#"{"access_token":"a","refresh_token":"r","expires_in":900,"#
                     + #""user":{"id":7,"email":"a@b.c","role":"client","email_verified":true,"onboarding_completed":true},"#
                     + #""pending_deletion":{"requested_at":"2026-10-17T10:00:00Z","scheduled_for":"2026-11-16T10:00:00Z"}}"#)
        }
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
        let outcome = try await NativeAuthAPI(api: api, deviceName: "test").login(email: "a@b.c", password: "x")
        guard case let .signedIn(session, _) = outcome else { return XCTFail("нет сессии") }
        XCTAssertEqual(session.pendingDeletion?.scheduledFor, "2026-11-16T10:00:00Z")
        let stored = try JSONDecoder().decode(NativeSession.self, from: JSONEncoder().encode(session))
        XCTAssertNil(stored.pendingDeletion, "в Keychain признак не попадает")
    }
}
