#if DEBUG
import DesignSystem
import Foundation
import SwiftUI

// Переписка, статьи, уведомления и настройки сценария UI-теста (задачи 5.1–6.3).
extension ScenarioTransport {
    /// Сегодня по Москве в 08:02 → `2026-10-18T08:02:00+03:00`.
    static func todayAt(_ time: String) -> String { "\(today)T\(time):00+03:00" }

    static func message(_ id: String, sender: Int, type: String = "text", content: String?, time: String,
                        metadata: [String: Any]? = nil) -> [String: Any] {
        var message: [String: Any] = ["id": id, "conversation_id": "c1", "sender_id": sender, "type": type,
                                      "created_at": todayAt(time), "attachments": [] as [Any]]
        if let content { message["content"] = content }
        if let metadata { message["metadata"] = metadata }
        return message
    }

    /// Переписка как на макете Chat.png.
    func seedChat() {
        guard chatMessages.isEmpty else { return }
        chatMessages = [
            Self.message("m1", sender: 3, content: "Доброе утро! Как спалось? Не забудьте взвеситься до завтрака.", time: "08:02"),
            Self.message("m2", sender: 7, content: "Взвесилась, 78,4 — весы сами отправили", time: "08:15"),
            Self.message("m3", sender: 7, type: "image", content: "https://new.burcev.team/uitest/plate.jpg", time: "13:21"),
            Self.message("m4", sender: 3, type: "food_entry", content: "Куриная грудка", time: "13:30",
                         metadata: ["food_entry_id": "e3", "food_name": "Куриная грудка", "meal_type": "lunch", "weight": 150,
                                    "calories": 229, "protein": 46, "fat": 5, "carbs": 0]),
            Self.message("m5", sender: 3, content: "Белок держите отлично, добавьте овощей к ужину", time: "13:40"),
        ]
    }

    var curatorAccess: String { UITestScenario.argument("-uiTestCuratorAccess") ?? "allowed" }

    func clientResponse(_ method: String, _ path: String, _ body: [String: Any], _ query: [String: String]) -> (Int, String)? {
        chatResponse(method, path, body) ?? notificationsResponse(method, path, body, query) ?? contentResponse(method, path)
            ?? settingsResponse(method, path, body)
    }

    private func chatResponse(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String)? {
        switch (method, path) {
        case ("GET", "/api/v1/conversations/access"):
            switch curatorAccess {
            case "none": return Self.ok(#"{"allowed":false,"expired":false}"#)
            case "expired": return Self.ok(#"{"allowed":false,"expired":true,"expires_at":"2026-10-01","conversation_id":"c1"}"#)
            default: return Self.ok(#"{"allowed":true,"expired":false,"conversation_id":"c1"}"#)
            }
        case ("GET", "/api/v1/conversations"):
            if curatorAccess == "noCurator" { return Self.ok("[]") }
            return Self.ok(#"[{"id":"c1","client_id":7,"curator_id":3,"unread_count":2,"#
                           + #""participant":{"id":3,"name":"Анна Смирнова"}}]"#)
        case ("GET", "/api/v1/conversations/c1/messages"):
            seedChat()
            return Self.ok(Self.json(Array(chatMessages.reversed())))
        case ("POST", "/api/v1/conversations/c1/messages"):
            seedChat()
            let message = Self.message("m\(chatMessages.count + 1)", sender: 7, type: body["type"] as? String ?? "text",
                                       content: body["content"] as? String, time: "13:45")
            chatMessages.append(message)
            return (201, #"{"status":"success","data":\#(Self.json(message))}"#)
        case ("POST", "/api/v1/conversations/c1/upload"):
            return Self.ok(#"{"id":"a1","file_url":"https://new.burcev.team/uitest/a.jpg","file_name":"photo.jpg","#
                           + #""file_size":1000,"mime_type":"image/jpeg"}"#)
        case ("POST", "/api/v1/conversations/c1/read"):
            return Self.ok(#"{"status":"ok"}"#)
        case ("GET", "/api/v1/conversations/unread"):
            return Self.ok(#"{"count":2}"#)
        default:
            return nil
        }
    }

    private func notificationsResponse(_ method: String, _ path: String, _ body: [String: Any],
                                       _ query: [String: String]) -> (Int, String)? {
        switch (method, path) {
        case ("GET", "/api/v1/notifications/unread-counts"):
            let main = ["n1", "n2"].filter { !readNotifications.contains($0) }.count
            let content = readNotifications.contains("cn1") ? 0 : 1
            return Self.ok(#"{"main":\#(main),"content":\#(content)}"#)
        case ("GET", "/api/v1/notifications"):
            let list: [[String: Any]]
            if query["category"] == "content" {
                list = [notification("cn1", kind: ("content", "new_content"), title: "Новая статья",
                                     text: "Почему остаток важнее съеденного",
                                     target: ["kind": "article", "ids": ["article_id": "a1", "slug": "ostatok-vazhnee"]])]
            } else {
                list = [notification("n1", kind: ("main", "task_assigned"), title: "Новая задача от куратора",
                                     text: "Силовая тренировка", target: ["kind": "task", "ids": ["task_id": "t1"]]),
                        notification("n2", kind: ("main", "feedback_received"), title: "Куратор оценил вашу неделю",
                                     text: "Отзыв на недельный отчёт",
                                     target: ["kind": "weekly_feedback", "ids": ["report_id": "42"]])]
            }
            return Self.ok(Self.json(["notifications": list, "total": list.count, "hasMore": false]))
        case let ("POST", path) where path.hasPrefix("/api/v1/notifications/") && path.hasSuffix("/read"):
            let id = path.split(separator: "/")[3]
            readNotifications.insert(String(id))
            if id.hasPrefix("c") { Task { @MainActor in UITestCounters.shared.contentWrites += 1 } }
            return Self.ok(#"{"success":true,"readAt":"2026-10-18T10:00:00Z"}"#)
        case ("POST", "/api/v1/notifications/mark-all-read"):
            if body["category"] as? String == "content" {
                Task { @MainActor in UITestCounters.shared.contentWrites += 1 }
                readNotifications.insert("cn1")
            } else {
                readNotifications.formUnion(["n1", "n2"])
            }
            return Self.ok(#"{"success":true,"markedCount":1}"#)
        case ("GET", "/api/v1/dashboard/weekly-reports/42/feedback"):
            return Self.ok(#"{"nutrition":{"rating":"excellent","comment":"Белок в норме всю неделю"},"#
                           + #""activity":{"rating":"good"},"water":{"rating":"needs_improvement","comment":"Пейте больше"},"#
                           + #""photo_uploaded":true,"summary":"Хорошая неделя: норма соблюдена пять дней из семи.","#
                           + #""recommendations":"Добавьте овощей к ужину и стакан воды до обеда."}"#)
        case ("POST", "/api/v1/notifications/devices"), ("DELETE", _) where path.hasPrefix("/api/v1/notifications/devices/"):
            return (204, "")
        default:
            return nil
        }
    }

    private func notification(_ id: String, kind: (category: String, type: String), title: String, text: String,
                              target: [String: Any]) -> [String: Any] {
        var item: [String: Any] = ["id": id, "userId": 7, "category": kind.category, "type": kind.type, "title": title, "content": text,
                                   "createdAt": "\(Self.today)T09:00:00Z", "target": target]
        if readNotifications.contains(id) { item["readAt"] = "\(Self.today)T10:00:00Z" }
        return item
    }

    static let articleBody = """
        Остаток — главное число дня: сколько ещё можно съесть, чтобы остаться в норме.

        ![Тарелка с обедом](https://new.burcev.team/uitest/plate.jpg)

        ## Как читать остаток

        | Приём | Ккал | Белки | Жиры | Углеводы | Время |
        |---|---|---|---|---|---|
        | Завтрак | 420 | 30 | 15 | 40 | 08:10 |
        | Обед | 610 | 46 | 20 | 55 | 13:20 |

        - **Остаток** считается от нормы куратора.
        - Превышение — *не повод* голодать завтра.

        Тарифы — [на сайте](https://burcev.team/pricing).
        """

    private func contentResponse(_ method: String, _ path: String) -> (Int, String)? {
        guard method == "GET" else { return nil }
        let articles: [[String: Any]] = [
            ["id": "a1", "slug": "ostatok-vazhnee", "title": "Почему остаток важнее съеденного", "category": "nutrition",
             "excerpt": "Как читать дневной остаток и не срываться к вечеру", "published_at": "2026-10-16T09:00:00Z",
             "author_name": "Анна Смирнова"],
            ["id": "a2", "slug": "zavtrak-30-belka", "title": "Завтрак на 30 г белка за 10 минут", "category": "recipes",
             "published_at": "2026-10-15T09:00:00Z"],
            ["id": "a3", "slug": "voda-i-ves", "title": "Вода и вес: почему цифра скачет по утрам", "category": "health",
             "published_at": "2026-10-14T09:00:00Z"],
            ["id": "a4", "slug": "shagi", "title": "Шаги или зал: что сдвигает норму", "category": "training",
             "published_at": "2026-10-13T09:00:00Z"],
        ]
        switch path {
        case "/api/v1/content/feed":
            return Self.ok(Self.json(["articles": articles, "total": articles.count]))
        case "/api/v1/content/feed/a1", "/api/v1/public/content/ostatok-vazhnee":
            var article = articles[0]
            article["body"] = Self.articleBody
            return Self.ok(Self.json(article))
        default:
            return nil
        }
    }

    private func settingsResponse(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String)? {
        let noPassword = ProcessInfo.processInfo.arguments.contains("-uiTestNoPassword")
        switch (method, path) {
        case ("GET", "/api/v1/users/profile"):
            let onboarded = scenario == .newClient ? "false" : "true"
            return Self.ok(#"{"profile":{"id":7,"email":"anna@example.com","name":"Дарья","role":"\#(scenario.role)","#
                           + #""onboarding_completed":\#(onboarded),"settings":{"language":"ru","units":"metric","#
                           + #""timezone":"Europe/Moscow","target_weight":74,"height":168,"biological_sex":"female","#
                           + #""activity_level":"moderate","fitness_goal":"loss"}}}"#)
        case ("PUT", "/api/v1/users/profile"):
            return Self.ok(#"{"profile":{"id":7,"email":"anna@example.com"}}"#)
        case ("POST", "/api/v1/nutrition-calc/recalculate"):
            return Self.ok(#"{"calories":2300,"protein":120,"fat":75,"carbs":260,"source":"calculated"}"#)
        case ("GET", "/api/v1/notifications/delivery-preferences"):
            return Self.ok(#"{"types":[{"type":"chat_message","app":true,"push":true},"#
                           + #"{"type":"feedback_received","app":true,"email":true,"push":true},"#
                           + #"{"type":"task_assigned","app":true,"email":true,"push":true}],"#
                           + #""quietHoursStart":null,"quietHoursEnd":null,"timezone":"Europe/Moscow","#
                           + #""emailUnsubscribed":false,"showMessageText":true}"#)
        case ("GET", "/api/v1/notifications/preferences"):
            return Self.ok(#"{"mutedCategories":[],"muted":false}"#)
        case ("PUT", "/api/v1/notifications/delivery-preferences"), ("PUT", "/api/v1/notifications/preferences"):
            return Self.ok(#"{"status":"ok"}"#)
        case ("GET", "/api/v1/users/me/telegram"):
            return Self.ok(#"{"linked":false}"#)
        case ("GET", "/api/v1/auth/providers/linked"):
            return Self.ok(noPassword ? #"{"linked":[{"provider":"apple","linked_at":"2026-01-01T00:00:00Z"}],"has_password":false}"#
                                      : #"{"linked":[{"provider":"yandex","linked_at":"2026-01-01T00:00:00Z"}],"has_password":true}"#)
        case ("POST", "/api/v1/auth/native/change-password"):
            return body["current_password"] as? String == "Old-pass1!"
                ? Self.ok(#"{"access_token":"a9","refresh_token":"r9","expires_in":900,"user":{"id":7,"email":"anna@example.com","#
                          + #""role":"client","email_verified":true,"onboarding_completed":true}}"#)
                : Self.error(401, "password_incorrect")
        case ("GET", "/api/v1/users/me/export"):
            return Self.ok(#"{"exports":[{"id":"x1","status":"ready","requested_at":"2026-10-17T10:00:00Z","downloaded":false}]}"#)
        case ("GET", "/api/v1/users/me/export/x1"):
            return (200, "PK-uitest-archive")
        case ("POST", "/api/v1/users/me/export"):
            return Self.error(429, "rate_limited")
        case ("GET", "/api/v1/users/me/deletion"):
            guard let scheduled = deletionScheduledFor else { return Self.ok(#"{"requested":false}"#) }
            return Self.ok(#"{"requested":true,"requested_at":"2026-10-01T10:00:00Z","scheduled_for":"\#(scheduled)"}"#)
        case ("POST", "/api/v1/users/me/deletion/code"):
            deletionCodeSent = true
            return Self.ok(#"{"sent":true}"#)
        case ("POST", "/api/v1/users/me/deletion"):
            let accepted = noPassword ? body["code"] as? String == "482913" : body["current_password"] as? String == "Old-pass1!"
            return accepted
                ? (202, #"{"status":"success","data":{"requested":true,"requested_at":"2026-10-17T10:00:00Z","#
                   + #""scheduled_for":"2026-11-16T10:00:00Z"}}"#)
                : Self.error(401, "unauthorized")
        default:
            return nil
        }
    }
}

/// Счётчики сценария, которые видит только UI-тест.
@MainActor
@Observable
final class UITestCounters {
    static let shared = UITestCounters()
    /// Изменения непрочитанного во вкладке «Контент».
    var contentWrites = 0
}

/// «content.writes=N» внизу экрана уведомлений — только в сценарии UI-теста.
struct UITestRequestCounter: View {
    var body: some View {
        if UITestScenario.current != nil {
            // Подпись — по-русски: аудит доступности проверяет и её.
            Text(verbatim: "Изменений во вкладке «Контент»: \(UITestCounters.shared.contentWrites)")
                .dsText(DS.Typography.caption)
                .foregroundStyle(DS.Color.fgMuted)
                .accessibilityIdentifier("uitest.content.writes")
        }
    }
}
#endif
