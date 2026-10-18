import API
import Client
import Foundation
import Session

/// Шаги после входа (`ios-auth-flows`, `ios-onboarding`): почта, удаление
/// аккаунта, онбординг.
extension AppModel {
    /// Причина отказа из `/auth/native-complete?error=…` — человеческими словами.
    static func providerFailureMessage(_ reason: String?) -> String {
        switch reason {
        case "cancelled": return "Вход отменён."
        case "unavailable": return "Вход через этот сервис сейчас недоступен."
        default: return "Не получилось войти. Попробуйте ещё раз или войдите по ссылке из письма."
        }
    }

    /// `POST /auth/verify-email` — сразу после шестой цифры.
    func verifyEmail(code: String) async throws {
        let _: EmptyResponse = try await api.send(try .post("/api/v1/auth/verify-email", body: ["code": code]))
        if var current = await session.user {
            current.emailVerified = true
            await session.updateUser(current)
            user = current
        }
        recompute()
    }

    /// `POST /auth/resend-verification` без тела: письмо на почту из токена.
    func resendVerification() async throws {
        let _: EmptyResponse = try await api.send(Endpoint(method: .post, path: "/api/v1/auth/resend-verification"))
    }

    /// «Отменить удаление»: `DELETE /users/me/deletion`, затем маршрут после входа.
    func cancelDeletion() async throws {
        do {
            let _: EmptyResponse = try await api.send(.delete("/api/v1/users/me/deletion"))
        } catch APIError.server(404, _, _) {
            // Уже отменено (например, в вебе) — цель достигнута.
        }
        pendingDeletion = nil
        recompute()
    }

    /// Ответы онбординга и `PUT /users/onboarding/complete`.
    func completeOnboarding(_ draft: OnboardingDraft) async throws {
        let today = DayCalendar(timeZone: TimeZone(identifier: draft.timezone) ?? profileTimeZone).key(Date())
        try await OnboardingService(api: api).complete(draft, today: today)
        if let zone = TimeZone(identifier: draft.timezone), !draft.settingsSkipped {
            profileTimeZone = zone
            await health.setTimeZone(draft.timezone)
        }
        if var current = await session.user {
            current.onboardingCompleted = true
            await session.updateUser(current)
            user = current
        }
        recompute()
    }

    /// Буква в аватаре: имя профиля, иначе почта.
    var avatarInitial: String {
        let source = profileName?.trimmingCharacters(in: .whitespaces).nilIfEmpty ?? user?.name ?? user?.email ?? "?"
        return source.first.map { String($0).uppercased() } ?? "?"
    }
}
