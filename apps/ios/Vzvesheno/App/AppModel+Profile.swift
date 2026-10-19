import API
import Client
import Foundation
import Outbox

/// `GET /users/profile` → `{profile: {name, onboarding_completed, settings}}`.
struct ProfileAnswer: Decodable, Sendable {
    struct Profile: Decodable, Sendable {
        struct Settings: Decodable, Sendable {
            let language: String?
            let timezone: String?
        }
        let name: String?
        let onboardingCompleted: Bool?
        let settings: Settings?

        enum CodingKeys: String, CodingKey {
            case name, settings
            case onboardingCompleted = "onboarding_completed"
        }
    }
    let profile: Profile
}

// Профиль на запуске (`ios-offline-outbox`, «Быстрый запуск»).
extension AppModel {
    static let profileEndpoint = Endpoint.get("/api/v1/users/profile")

    /// Сохранённый профиль аккаунта — до первого кадра оболочки: имя в шапке,
    /// язык запросов и пояс, по которому «Сегодня» и «Дневник» выбирают день.
    /// Без него модели экранов создавались по поясу телефона, а после ответа
    /// `/users/profile` с другим поясом пересоздавались и грузились заново.
    func applyCachedProfile() async {
        guard let userID = user?.id,
              let cached = ScreenReader(api: api, cache: cache).cached(ProfileAnswer.self, Self.profileEndpoint, userID: userID)
        else { return }
        let profile = cached.value.profile
        profileName = profile.name
        await api.setLanguage(profile.settings?.language)
        if let zone = profile.settings?.timezone.flatMap(TimeZone.init(identifier:)) { profileTimeZone = zone }
    }

    /// Язык запросов, пояс профиля и признак онбординга. (Раньше разбиралось
    /// без обёртки `profile`, и язык с поясом не применялись.)
    func refreshLanguage() async {
        let reader = ScreenReader(api: api, cache: cache)
        guard case let .success(answer) = await reader.fetch(ProfileAnswer.self, Self.profileEndpoint, userID: user?.id) else {
            return
        }
        let profile = answer.profile
        profileName = profile.name
        await api.setLanguage(profile.settings?.language)
        // Сутки шагов и дата взвешивания — по поясу профиля, не устройства.
        if let timezone = profile.settings?.timezone {
            await health.setTimeZone(timezone)
            if let zone = TimeZone(identifier: timezone), zone != profileTimeZone {
                profileTimeZone = zone
                today = nil
                diary = nil
                water = nil
                // Время сообщений — по поясу профиля; куратору — тоже.
                chat = nil
                curator = nil
            }
        }
        if let completed = profile.onboardingCompleted, var current = await session.user, current.onboardingCompleted != completed {
            current.onboardingCompleted = completed
            await session.updateUser(current)
            user = current
        }
    }
}
