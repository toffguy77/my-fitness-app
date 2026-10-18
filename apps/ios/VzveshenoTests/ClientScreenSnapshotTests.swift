import Client
import DesignSystem
import Navigation
import SwiftUI
@testable import Vzvesheno
import XCTest

/// Экраны фазы C с макетами Chat.png, Articles.png, Profile.png; данные — с макетов.
@MainActor
final class ClientScreenSnapshotTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)

    /// 17 октября 2025, по Москве.
    private func at(_ time: String) -> Date {
        let parts = time.split(separator: ":").compactMap { Double($0) }
        return Date(timeIntervalSince1970: 1_760_648_400 + parts[0] * 3600 + parts[1] * 60)
    }

    private var messages: [ChatMessage] {
        [
            ChatMessage(id: "m1", senderID: 3, content: "Доброе утро! Как спалось? Не забудьте взвеситься до завтрака.",
                        createdAt: at("08:02")),
            ChatMessage(id: "m2", senderID: 7, content: "Взвесилась, 78,4 — весы сами отправили", createdAt: at("08:15")),
            ChatMessage(id: "m3", senderID: 7, kind: .image, content: nil, createdAt: at("13:21")),
            ChatMessage(id: "m4", senderID: 3, kind: .foodEntry, content: "Куриная грудка",
                        foodEntry: FoodEntryCard(foodName: "Куриная грудка", mealType: "lunch", weight: 150, calories: 229,
                                                 protein: 46, fat: 5, carbs: 0),
                        createdAt: at("13:30")),
            ChatMessage(id: "m5", senderID: 3, content: "Белок держите отлично, добавьте овощей к ужину", createdAt: at("13:40")),
        ]
    }

    /// Макет Chat.png: «печатает…», пузыри, фото, карточка КБЖУ, поле сообщения.
    func testChat() {
        let content = ChatContent(curatorName: "Анна Смирнова", typing: true,
                                  items: ChatTimeline.items(messages, calendar: calendar, now: at("14:00")), pending: [],
                                  userID: 7, calendar: calendar, canSend: true, expiredNotice: nil,
                                  hasEarlier: false, text: .constant(""))
        assertScreenSnapshot(content, named: "light")
        assertScreenSnapshot(content, named: "dark", colorScheme: .dark)
    }

    /// Истёкший доступ: история видна, вместо поля — «Доступ действовал до 1 октября».
    func testChatExpired() {
        let content = ChatContent(curatorName: "Анна Смирнова", typing: false,
                                  items: ChatTimeline.items(Array(messages.prefix(2)), calendar: calendar, now: at("14:00")),
                                  pending: [], userID: 7, calendar: calendar, canSend: false,
                                  expiredNotice: "Доступ действовал до 1 октября", hasEarlier: false, text: .constant(""))
        assertScreenSnapshot(content, named: "light")
    }

    /// «Работа с куратором» без цены и заявки; «Куратор пока не назначен».
    func testCuratorAccess() {
        assertScreenSnapshot(CuratorAccessContent(kind: .noAccess, onSupport: {}), named: "noAccess")
        assertScreenSnapshot(CuratorAccessContent(kind: .noCurator, onSupport: {}), named: "noCurator")
    }

    private let placeholderImage: ArticleImage = { _ in AnyView(ArticleImagePlaceholder()) }

    /// Макет Articles.png: чипы, первая статья крупно, остальные строками.
    func testArticles() {
        let articles = [
            Article(id: "a1", slug: "ostatok-vazhnee", title: "Почему остаток важнее съеденного",
                    excerpt: "Как читать дневной остаток и не срываться к вечеру", coverImageURL: "https://storage.yandexcloud.net/burcev-content/1.jpg",
                    category: "nutrition", publishedAt: "2025-10-16T09:00:00Z"),
            Article(id: "a2", title: "Завтрак на 30 г белка за 10 минут", coverImageURL: "https://storage.yandexcloud.net/burcev-content/2.jpg", category: "recipes",
                    publishedAt: "2025-10-15T09:00:00Z"),
            Article(id: "a3", title: "Вода и вес: почему цифра скачет по утрам", coverImageURL: "https://storage.yandexcloud.net/burcev-content/3.jpg",
                    category: "health", publishedAt: "2025-10-14T09:00:00Z"),
        ]
        let content = NavigationStack {
            ScrollView {
                ArticlesContent(category: nil, articles: articles, loading: false, error: nil, image: placeholderImage)
            }
            .scrollDisabled(true)
            .toolbar(.hidden, for: .navigationBar)
        }
        assertScreenSnapshot(content, named: "light")
    }

    /// Статья с таблицей шире экрана и изображением (задача 5.3).
    func testArticleWithTableAndImage() {
        let body = """
            Остаток — главное число дня: сколько ещё можно съесть, чтобы остаться в норме.

            ![Тарелка с обедом](https://storage.yandexcloud.net/burcev-content/plate.jpg)

            ## Как читать остаток

            | Приём | Ккал | Белки | Жиры | Углеводы | Время |
            |---|---|---|---|---|---|
            | Завтрак | 420 | 30 | 15 | 40 | 08:10 |
            | Обед | 610 | 46 | 20 | 55 | 13:20 |

            - **Остаток** считается от нормы куратора.
            - Превышение — *не повод* голодать завтра.
            """
        let article = Article(id: "a1", slug: "ostatok-vazhnee", title: "Почему остаток важнее съеденного",
                              authorName: "Анна Смирнова", category: "nutrition", publishedAt: "2025-10-16T09:00:00Z", body: body)
        let content = ArticleContent(article: article, document: ArticleDocument(markdown: body), image: placeholderImage)
        assertScreenSnapshot(content, named: "light", height: nil)
    }

    /// Макет Profile.png: разделы, «Связи», «Вход», «Данные», «Выйти».
    func testProfile() {
        let summary = ProfileSummary(name: "Дмитрий", email: "dmitry@yandex.ru", body: "78,4 → 74 кг", health: "шаги, вес, тренировки",
                                     healthConnected: true, telegram: "не привязан", password: "изменить",
                                     signInMethods: "Apple, Яндекс")
        let content = NavigationStack {
            ProfileContent(summary: summary, avatarInitial: "Д", appearance: .constant(.auto))
                .toolbar(.hidden, for: .navigationBar)
        }
        assertScreenSnapshot(content, named: "light", height: nil)
    }

    func testNotifications() {
        let items = [
            AppNotification(id: "n1", type: "task_assigned", title: "Новая задача от куратора", content: "Силовая тренировка",
                            createdAt: "2025-10-17T09:00:00Z", target: .init(kind: "task", ids: ["task_id": "t1"])),
            AppNotification(id: "n2", type: "feedback_received", title: "Куратор оценил вашу неделю",
                            content: "Отзыв на недельный отчёт", createdAt: "2025-10-16T09:00:00Z", readAt: "2025-10-16T10:00:00Z"),
        ]
        assertScreenSnapshot(NotificationsContent(tab: .main, counts: UnreadCounts(main: 1, content: 1), items: items), named: "light")
    }

    func testWeeklyFeedback() {
        let feedback = WeeklyFeedback(nutrition: .init(rating: "excellent", comment: "Белок в норме всю неделю"),
                                      activity: .init(rating: "good"),
                                      water: .init(rating: "needs_improvement", comment: "Пейте больше"),
                                      summary: "Хорошая неделя: норма соблюдена пять дней из семи.",
                                      recommendations: "Добавьте овощей к ужину и стакан воды до обеда.")
        assertScreenSnapshot(ScrollView { WeeklyFeedbackContent(feedback: feedback) }.scrollDisabled(true), named: "light")
    }
}

/// «Поделиться» и ссылки статьи в приложении.
final class ArticleLinkTests: XCTestCase {
    func testShareURLIsProductionEvenInDevBuild() {
        XCTAssertEqual(AppEnvironment.current().name, "dev")
        XCTAssertEqual(Article(id: "a1", slug: "ostatok-vazhnee", title: "Т").shareURL?.absoluteString,
                       "https://burcev.team/content/ostatok-vazhnee")
    }

    func testProfileEmailIsMasked() {
        XCTAssertEqual(ProfileContent.masked("dmitry@yandex.ru"), "d***@yandex.ru")
        XCTAssertEqual(ProfileScreen.bodySummary(current: 78.4, target: 74), "78,4 → 74 кг")
    }
}
