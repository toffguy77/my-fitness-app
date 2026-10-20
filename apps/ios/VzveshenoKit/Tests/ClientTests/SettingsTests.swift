import API
@testable import Client
import Foundation
import Session
import TestSupport
import XCTest

/// Профиль и настройки (`ios-client-settings`, задачи 6.1–6.3).
@MainActor
final class SettingsTests: XCTestCase {
    private func api(_ transport: StubTransport) -> APIClient {
        APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test", transport: transport)
    }

    // Сценарий «Сохранение тела и целей».
    func testBodyGoalsSavesSettingsThenRecalculates() async throws {
        let transport = StubTransport { request in
            switch request.path {
            case "/api/v1/users/settings": return .success(#"{"settings":{}}"#)
            case "/api/v1/nutrition-calc/recalculate":
                return .success(#"{"calories":2300,"protein":120,"fat":75,"carbs":260,"source":"calculated"}"#)
            default: return .error(404, code: "not_found")
            }
        }
        var draft = BodyGoalsDraft(settings: UserProfile.Settings(targetWeight: 78, height: 172, biologicalSex: "female"))
        draft.targetWeight = "74"
        let result = try await ProfileService(api: api(transport)).saveBodyGoals(draft)
        XCTAssertEqual(result, "Нормы пересчитаны")
        XCTAssertEqual(transport.requests.map { "\($0.method) \($0.path)" },
                       ["PUT /api/v1/users/settings", "POST /api/v1/nutrition-calc/recalculate"])
        let body = transport.requests[0].json
        XCTAssertEqual(body?["target_weight"] as? Double, 74)
        XCTAssertEqual(body?["height"] as? Double, 172)
        XCTAssertEqual(body?["biological_sex"] as? String, "female")
        XCTAssertTrue(body?["birth_date"] is NSNull, "очищенное поле — null")
    }

    func testBodyGoalsBoundsMatchTheWeb() async {
        var draft = BodyGoalsDraft(settings: UserProfile.Settings())
        draft.height = "40"
        draft.targetWeight = "600"
        XCTAssertEqual(draft.problems, ["height": "Рост — от 50 до 300 см", "targetWeight": "Целевой вес — от 20 до 500 кг"])
        draft.height = "172,5"
        draft.targetWeight = "20"
        XCTAssertTrue(draft.isValid)
    }

    func testRecalculationWithoutWeightExplains() async throws {
        let transport = StubTransport { request in
            request.path.hasSuffix("recalculate")
                ? .success(#"{"targets":null,"message":"Профиль не заполнен или нет данных о весе"}"#)
                : .success("{}")
        }
        let result = try await ProfileService(api: api(transport)).saveBodyGoals(BodyGoalsDraft(settings: UserProfile.Settings()))
        XCTAssertEqual(result, "Профиль не заполнен или нет данных о весе")
    }

    // Сценарий «Разрешение отклонено ранее» и прочие состояния.
    func testPushColumnByPermission() async {
        XCTAssertEqual(PushColumn(.authorized), .enabled)
        XCTAssertEqual(PushColumn(.provisional), .enabled)
        XCTAssertEqual(PushColumn(.notDetermined), .askPermission)
        XCTAssertEqual(PushColumn(.notDetermined).buttonTitle, "Разрешить")
        XCTAssertEqual(PushColumn(.denied), .openSettings)
        XCTAssertEqual(PushColumn(.denied).buttonTitle, "Открыть настройки")
        XCTAssertFalse(PushColumn(.denied).isEnabled)
        XCTAssertNil(PushColumn(.authorized).buttonTitle)
    }

    func testDeliveryPreferencesRoundTripKeepsChatWithoutEmail() async throws {
        let json = #"{"types":[{"type":"chat_message","app":true,"push":true},{"type":"task_assigned","app":true,"email":true,"#
            + #""push":false}],"quietHoursStart":22,"quietHoursEnd":7,"timezone":"Europe/Moscow","emailUnsubscribed":false,"#
            + #""showMessageText":true}"#
        var prefs = try JSONDecoder().decode(DeliveryPreferences.self, from: Data(json.utf8))
        XCTAssertNil(prefs.types[0].email, "почта для сообщений чата не предлагается")
        prefs.showMessageText = false
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(prefs)) as? [String: Any]
        let types = encoded?["types"] as? [[String: Any]]
        XCTAssertNil(types?[0]["email"])
        XCTAssertEqual(types?[1]["email"] as? Bool, true)
        XCTAssertEqual(encoded?["quietHoursStart"] as? Int, 22)
        XCTAssertEqual(encoded?["showMessageText"] as? Bool, false)
        XCTAssertEqual(DeliveryPreferences.title("chat_message"), "Сообщения куратора")
    }

    // Сценарий «Переезд»: двое суток расхождения — вопрос, один раз.
    func testTimeZoneSuggestedAfterTwoDaysOfMismatchOnce() async {
        let start = Date(timeIntervalSince1970: 1_760_691_600)
        var state = TimeZoneSuggestion()
        var result = state.evaluate(profile: "Europe/Moscow", device: "Asia/Yekaterinburg", now: start)
        XCTAssertNil(result.suggest, "только что переехал — не спрашивать")
        state = result.state
        result = state.evaluate(profile: "Europe/Moscow", device: "Asia/Yekaterinburg", now: start.addingTimeInterval(12 * 3600))
        XCTAssertNil(result.suggest)
        state = result.state
        result = state.evaluate(profile: "Europe/Moscow", device: "Asia/Yekaterinburg", now: start.addingTimeInterval(2 * 86_400))
        XCTAssertEqual(result.suggest, "Asia/Yekaterinburg")
        state = result.state.answering("Asia/Yekaterinburg")
        result = state.evaluate(profile: "Europe/Moscow", device: "Asia/Yekaterinburg", now: start.addingTimeInterval(5 * 86_400))
        XCTAssertNil(result.suggest, "на ответ «Оставить» больше не спрашивать")
        XCTAssertEqual(TimeZoneSuggestion.title("Asia/Yekaterinburg"), "Екатеринбург (UTC+5)")
    }

    func testTimeZoneMismatchResetsWhenZonesMatchAgain() async {
        let start = Date(timeIntervalSince1970: 1_760_691_600)
        var state = TimeZoneSuggestion().evaluate(profile: "Europe/Moscow", device: "Asia/Omsk", now: start).state
        state = state.evaluate(profile: "Europe/Moscow", device: "Europe/Moscow", now: start.addingTimeInterval(3600)).state
        let result = state.evaluate(profile: "Europe/Moscow", device: "Asia/Omsk", now: start.addingTimeInterval(30 * 3600))
        XCTAssertNil(result.suggest, "сутки подряд считаются заново")
    }

    // Сценарий «Выгрузка готова».
    func testExportDownloadsTheFile() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let transport = StubTransport { request in
            switch request.path {
            case "/api/v1/users/me/export":
                return .success(#"{"exports":[{"id":"x1","status":"ready","requested_at":"2026-10-17T10:00:00Z","downloaded":false}]}"#)
            case "/api/v1/users/me/export/x1": return StubResponse(status: 200, body: Data("PK-zip".utf8))
            default: return .error(404, code: "not_found")
            }
        }
        let model = ExportModel(api: api(transport), files: AccountFiles(root: directory))
        await model.load()
        XCTAssertEqual(model.latest?.statusTitle, "Готова")
        let file = await model.download()
        XCTAssertEqual(file?.lastPathComponent, "vzvesheno-export-2026-10-17.zip")
        XCTAssertEqual(file?.deletingLastPathComponent().lastPathComponent, "exports", "архив — в каталоге аккаунта")
        XCTAssertEqual(file.flatMap { try? Data(contentsOf: $0) }, Data("PK-zip".utf8))
    }

    func testExportTwiceADayShowsTheLimit() async {
        let transport = StubTransport { _ in .error(429, code: "rate_limited") }
        let model = ExportModel(api: api(transport), files: AccountFiles(root: FileManager.default.temporaryDirectory))
        await model.request()
        XCTAssertEqual(model.message, "Выгрузку можно запрашивать раз в сутки. Попробуйте завтра.")
    }

    // Сценарий «Удаление аккаунта через Apple без пароля».
    func testDeletionWithoutPasswordAsksForCode() async {
        let transport = StubTransport { request in
            switch request.path {
            case "/api/v1/auth/providers/linked":
                return .success(#"{"linked":[{"provider":"apple","linked_at":"2026-01-01T00:00:00Z"}],"has_password":false}"#)
            case "/api/v1/users/me/deletion/code": return .success(#"{"sent":true}"#)
            case "/api/v1/users/me/deletion":
                return .success(#"{"requested":true,"requested_at":"2026-10-17T10:00:00Z","scheduled_for":"2026-11-16T10:00:00Z"}"#,
                                status: 202)
            default: return .error(404, code: "not_found")
            }
        }
        let model = DeletionModel(api: api(transport))
        await model.load()
        XCTAssertEqual(model.hasPassword, false)
        model.word = "УДАЛИТЬ"
        XCTAssertFalse(model.canSubmit, "без кода нельзя")
        await model.sendCode()
        XCTAssertTrue(model.codeSent)
        model.code = "482913"
        XCTAssertTrue(model.canSubmit)
        let deletion = await model.submit()
        XCTAssertEqual(transport.requests.last?.json as? [String: String], ["code": "482913"])
        XCTAssertEqual(deletion?.signedOutMessage,
                       "Аккаунт будет удалён 16 ноября. До этой даты удаление можно отменить, войдя снова")
    }

    func testDeletionWithPasswordNeedsTheWordAndPassword() async {
        let transport = StubTransport { request in
            request.path == "/api/v1/users/me/deletion" ? .error(401, code: "unauthorized") : .success("{}")
        }
        let model = DeletionModel(api: api(transport), hasPassword: true)
        model.word = "удалить"
        model.password = "Secret1!"
        XCTAssertFalse(model.canSubmit, "слово — заглавными")
        model.word = "УДАЛИТЬ"
        XCTAssertTrue(model.canSubmit)
        let deletion = await model.submit()
        XCTAssertNil(deletion)
        XCTAssertEqual(transport.requests.last?.json as? [String: String], ["current_password": "Secret1!"])
        XCTAssertEqual(model.error, "Неверный пароль.")
    }

    func testLinkedProvidersSummary() async {
        XCTAssertEqual(LinkedProviders(linked: [.init(provider: "apple"), .init(provider: "yandex")], hasPassword: true).summary,
                       "Apple, Яндекс")
        XCTAssertEqual(TelegramLink(linked: false).summary, "не привязан")
        XCTAssertEqual(TelegramLink(linked: true, username: "anna").summary, "@anna")
    }

    /// «Привязка Apple к существующему аккаунту» (`external-identity`):
    /// `native/apple/link` с access-токеном; серверу — исходный nonce.
    func testLinkAppleSendsTheCredentialWithTheRawNonce() async throws {
        let transport = StubTransport { _ in .success(#"{"linked":true,"provider":"apple"}"#) }
        let nonce = AppleNonce(raw: "raw-nonce")
        try await AccountService(api: api(transport)).linkApple(identityToken: "id-token", authorizationCode: "code", nonce: nonce)
        let request = try XCTUnwrap(transport.requests.last)
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.path, "/api/v1/auth/native/apple/link")
        XCTAssertEqual(request.json?["identity_token"] as? String, "id-token")
        XCTAssertEqual(request.json?["authorization_code"] as? String, "code")
        XCTAssertEqual(request.json?["nonce"] as? String, "raw-nonce", "серверу — исходное значение, не хэш")
    }

    /// Apple ID уже у другого аккаунта — ошибка сервера доходит до экрана.
    func testLinkAppleConflictIsReported() async {
        let transport = StubTransport { _ in .error(409, code: "conflict") }
        do {
            try await AccountService(api: api(transport)).linkApple(identityToken: "t", authorizationCode: "c",
                                                                     nonce: AppleNonce(raw: "n"))
            XCTFail("ожидалась ошибка")
        } catch {
            guard case APIError.server(409, "conflict", _) = error else { return XCTFail("\(error)") }
        }
    }

    func testOnlyAppleIsLinkedInTheApp() {
        XCTAssertTrue(AccountService.linkableInApp("apple"))
        XCTAssertFalse(AccountService.linkableInApp("yandex"))
        XCTAssertFalse(AccountService.linkableInApp("vk"))
    }
}

/// Запрошенное удаление переживает перезапуск (phase A: экран не возвращался).
final class PendingDeletionPersistenceTests: XCTestCase {
    func testPendingDeletionIsStoredAndErasedOnSignOut() async throws {
        let secure = InMemorySecureStore()
        let api = APIClient(baseURL: URL(string: "https://new.burcev.team")!, clientHeader: "ios/test",
                            transport: StubTransport { _ in StubResponse(status: 204) })
        let store = SessionStore(api: api, secure: secure, installMarker: AlwaysMarked())
        var session = NativeSession(accessToken: "a", refreshToken: "r",
                                    user: SessionUser(id: 7, email: "a@b.c", role: "client"))
        session.pendingDeletion = PendingDeletion(scheduledFor: "2026-11-16T10:00:00Z")
        try await store.adopt(session)

        // Перезапуск: новая сессия поверх того же Keychain.
        let relaunched = SessionStore(api: api, secure: secure, installMarker: AlwaysMarked())
        _ = await relaunched.restore()
        let restored = await relaunched.storedPendingDeletion()
        XCTAssertEqual(restored?.scheduledFor, "2026-11-16T10:00:00Z")

        await relaunched.setPendingDeletion(nil)
        let cancelled = await relaunched.storedPendingDeletion()
        XCTAssertNil(cancelled)
        await relaunched.setPendingDeletion(PendingDeletion(scheduledFor: "2026-11-16T10:00:00Z"))
        await relaunched.signOut()
        XCTAssertNil(try secure.read("pending_deletion"), "выход стирает отметку")
    }
}

private struct AlwaysMarked: InstallMarker {
    func isMarked() -> Bool { true }
    func mark() {}
}
