#if DEBUG
import Foundation

/// Изменения, которые помнит сценарий куратора.
struct CuratorScenarioState {
    var waterGoal: Int? = 8
    var targetWeight: Double? = 64
    var planComment = "Держим белок"
    var hasActivePlan = true
    var handledLeads: Set<String> = []
    var delivered = false
    var supportClosed = false
    var replies: [String] = []
    var chat: [[String: Any]] = []
    var feedbackSent = false
    var tasks: [[String: Any]] = []
}

// Куратор и суперадмин: данные — как на макетах CuratorClients.png,
// CuratorClient.png, CuratorChat.png, CuratorLeads.png, CuratorSupport.png.
extension ScenarioTransport {
    private var isCuratorScenario: Bool { scenario == .coordinator || scenario == .superAdmin }
    private static func flag(_ name: String) -> Bool { ProcessInfo.processInfo.arguments.contains(name) }

    static func daysAgo(_ days: Int) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Moscow") ?? .current
        let date = calendar.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    func curatorResponse(_ method: String, _ path: String, _ body: [String: Any], _ query: [String: String]) -> (Int, String)? {
        guard isCuratorScenario else { return nil }
        return hubResponse(method, path) ?? cardResponse(method, path, body) ?? curatorChatResponse(method, path, body)
            ?? leadsResponse(method, path, query) ?? supportResponse(method, path, body)
    }

    // MARK: Клиенты

    private static let plan = ["calories": 2240, "protein": 120, "fat": 75, "carbs": 250]

    private func client(_ id: Int, _ name: String, extra: [String: Any] = [:]) -> [String: Any] {
        var client: [String: Any] = ["id": id, "name": name, "alerts": [] as [Any], "unread_count": 0, "streak_days": 0]
        client.merge(extra) { _, new in new }
        return client
    }

    private func hubResponse(_ method: String, _ path: String) -> (Int, String)? {
        guard method == "GET" else { return nil }
        switch path {
        case "/api/v1/curator/analytics":
            return Self.ok(Self.json(["total_clients": 14, "attention_clients": 4, "avg_kbzhu_percent": 87, "total_unread": 6,
                                      "clients_waiting": 3, "active_tasks": 9, "overdue_tasks": 2, "completed_today": 0]))
        case "/api/v1/curator/analytics/benchmark":
            if Self.flag("-uiTestBenchmarkDown") { return Self.error(500, "internal") }
            return Self.ok(#"{"own_snapshots":[],"platform_benchmarks":[]}"#)
        case "/api/v1/curator/attention":
            func item(_ id: Int, _ name: String, _ reason: String, _ detail: String, _ priority: Int, chat: Bool = false) -> [String: Any] {
                ["client_id": id, "client_name": name, "reason": reason, "detail": detail, "priority": priority,
                 "action_url": chat ? "/curator/chat/\(id)" : "/curator/clients/\(id)"]
            }
            return Self.ok(Self.json([
                item(11, "Мария К.", "red_alert", "Калории: 2960 из 2240 (132%)", 1),
                item(12, "Игорь П.", "overdue_task", "Просрочено: Замеры (дедлайн 15.10)", 2),
                item(13, "Ольга С.", "inactive", "Нет записей о питании сегодня и вчера", 3),
                item(11, "Мария К.", "unread_message", "Непрочитанных сообщений: 2", 4, chat: true),
                item(14, "Денис Л.", "awaiting_feedback", "Отчёт за неделю 06.10 ожидает обратной связи", 5),
            ]))
        case "/api/v1/curator/clients":
            return Self.ok(Self.json([
                client(11, "Мария К.", extra: ["today_kbzhu": ["calories": 2960, "protein": 106, "fat": 118, "carbs": 330],
                                               "plan": Self.plan, "unread_count": 2, "streak_days": 12, "timezone": "Europe/Moscow"]),
                client(12, "Игорь П."),
                client(13, "Ольга С.", extra: ["last_activity_date": Self.daysAgo(2)]),
                client(14, "Денис Л."),
                client(16, "Алексей В.", extra: ["weekly_kbzhu_percent": 76]),
                client(17, "Марина Т.", extra: ["weekly_kbzhu_percent": 94]),
                client(99, "Пётр Н.", extra: ["weekly_kbzhu_percent": 81]),
            ]))
        default:
            return nil
        }
    }

    // MARK: Карточка

    private func detail() -> [String: Any] {
        let today = Self.today
        var days: [[String: Any]] = []
        for offset in 0..<7 {
            let date = Self.daysAgo(offset)
            let calories = [2960, 2180, 2050, 2300, 1980, 2210, 2120][offset]
            var day: [String: Any] = ["date": date, "kbzhu": ["calories": calories, "protein": 106, "fat": 118, "carbs": 330],
                                      "plan": Self.plan, "alerts": [] as [Any], "food_entries": [] as [Any], "steps": 6412 - offset * 300]
            if date == today {
                day["alerts"] = [["level": "red", "message": "Калории значительно выше нормы: 2960 из 2240 (132%)"]]
                day["food_entries"] = [
                    ["id": "e1", "food_name": "Торт «Наполеон»", "meal_type": "dinner", "calories": 684, "protein": 9, "fat": 45,
                     "carbs": 61, "weight": 180, "created_by": 7, "time": "20:40"],
                    ["id": "e2", "food_name": "Овсянка на молоке", "meal_type": "breakfast", "calories": 280, "protein": 25,
                     "fat": 40, "carbs": 14, "weight": 250, "time": "08:10"],
                ]
                day["water"] = ["glasses": 3, "goal": 8, "glass_size": 250]
                day["steps_source"] = "healthkit"
                day["weight"] = 68.1
                day["weight_source"] = "healthkit"
            }
            days.append(day)
        }
        let weights = [69.4, 69.2, 69.3, 68.9, 68.8, 68.5, 68.4, 68.1]
        var detail = client(11, "Мария К.", extra: ["birth_date": "1994-03-02", "biological_sex": "female", "fitness_goal": "loss",
                                                    "last_weight": 68.1, "last_weight_source": "healthkit"])
        detail["target_weight"] = curator.targetWeight.map { $0 as Any } ?? NSNull()
        detail["water_goal"] = curator.waterGoal.map { $0 as Any } ?? NSNull()
        detail["weekly_plan"] = Self.plan
        detail["days"] = days
        detail["weight_history"] = weights.enumerated().map { ["date": Self.daysAgo(49 - $0.offset * 7), "weight": $0.element,
                                                                "source": "healthkit"] }
        detail["photos"] = [["id": "p1", "photo_url": "https://storage.yandexcloud.net/weekly-progress-photos/uitest/1.jpg",
                             "week_start": Self.daysAgo(6)]]
        return detail
    }

    private func cardResponse(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String)? {
        let base = "/api/v1/curator/clients/11"
        guard path.hasPrefix(base) else { return nil }
        let saveFails = Self.flag("-uiTestCuratorSaveFails")
        switch (method, String(path.dropFirst(base.count))) {
        case ("GET", ""):
            return Self.ok(Self.json(detail()))
        case ("GET", "/notices"):
            return Self.ok(#"[{"id":"n1","type":"plan_updated","title":"Новый план питания","#
                           + #""createdAt":"2026-10-13T09:00:00Z","deliveries":[]}]"#)
        case ("PUT", "/target-weight"):
            if saveFails { return Self.error(500, "internal") }
            curator.targetWeight = body["target_weight"] as? Double
            return Self.ok(#"{"message":"Целевой вес обновлён"}"#)
        case ("PUT", "/water-goal"):
            if saveFails { return Self.error(500, "internal") }
            curator.waterGoal = body["water_goal"] as? Int
            return Self.ok(#"{"message":"Цель по воде обновлена"}"#)
        case ("GET", "/weekly-plans"):
            let active: [String: Any] = ["id": "w2", "calories": 2240, "protein": 120, "fat": 75, "carbs": 250,
                                         "start_date": Self.daysAgo(3), "end_date": Self.daysAgo(-3), "comment": curator.planComment,
                                         "is_active": true, "created_at": "2026-10-13T09:00:00Z"]
            let old: [String: Any] = ["id": "w1", "calories": 2100, "protein": 110, "fat": 70, "carbs": 230,
                                      "start_date": Self.daysAgo(10), "end_date": Self.daysAgo(4), "is_active": false,
                                      "created_at": "2026-10-06T09:00:00Z"]
            return Self.ok(Self.json(curator.hasActivePlan ? [active, old] : [old]))
        case ("POST", "/weekly-plan"):
            curator.hasActivePlan = true
            return (201, #"{"status":"success","data":{"id":"w3"}}"#)
        case ("PUT", "/weekly-plan/w2"):
            curator.planComment = body["comment"] as? String ?? curator.planComment
            return Self.ok(#"{"id":"w2"}"#)
        case ("DELETE", "/weekly-plan/w2"):
            curator.hasActivePlan = false
            return Self.ok(#"{"message":"План питания удалён"}"#)
        case ("GET", "/tasks"):
            if curator.tasks.isEmpty {
                curator.tasks = [["id": "t1", "title": "Замеры талии", "type": "measurement", "deadline": Self.daysAgo(-4),
                                  "recurrence": "once", "status": "active"],
                                 ["id": "t2", "title": "Овощи к ужину", "type": "nutrition", "deadline": Self.daysAgo(3),
                                  "recurrence": "once", "status": "overdue"]]
            }
            return Self.ok(Self.json(curator.tasks))
        case ("POST", "/tasks"):
            var task = body
            task["id"] = "t\(curator.tasks.count + 1)"
            task["status"] = "active"
            curator.tasks.insert(task, at: 0)
            return (201, #"{"status":"success","data":\#(Self.json(task))}"#)
        case let ("PUT", tail) where tail.hasPrefix("/tasks/"):
            return Self.ok(#"{"id":"t1"}"#)
        case ("GET", "/weekly-reports"):
            var report: [String: Any] = ["id": "r1", "week_start": Self.daysAgo(13), "week_end": Self.daysAgo(7), "week_number": 41,
                                         "summary": [:] as [String: Any], "has_feedback": curator.feedbackSent]
            if curator.feedbackSent { report["curator_feedback"] = ["summary": "Хорошая неделя"] }
            return Self.ok(Self.json([report]))
        case ("PUT", "/weekly-reports/r1/feedback"):
            curator.feedbackSent = true
            return Self.ok(#"{"message":"Отзыв сохранён"}"#)
        default:
            return nil
        }
    }

    // MARK: Чаты

    private static func curatorMessage(_ id: String, sender: Int, type: String = "text", content: String?, time: String,
                                       metadata: [String: Any]? = nil) -> [String: Any] {
        var message: [String: Any] = ["id": id, "conversation_id": "c11", "sender_id": sender, "type": type,
                                      "created_at": todayAt(time), "attachments": [] as [Any]]
        if let content { message["content"] = content }
        if let metadata { message["metadata"] = metadata }
        return message
    }

    private func curatorChatResponse(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String)? {
        if curator.chat.isEmpty {
            curator.chat = [
                Self.curatorMessage("k1", sender: 11, content: "Была на дне рождения, не удержалась...", time: "20:14"),
                Self.curatorMessage("k2", sender: 11, type: "image", content: "https://storage.yandexcloud.net/chats/uitest/cake.jpg",
                                    time: "20:14"),
                Self.curatorMessage("k3", sender: 7, content: "Ничего страшного, это один день. Завтра вернёмся к плану — запишите "
                                    + "завтрак, я посмотрю.", time: "20:31"),
                Self.curatorMessage("k4", sender: 11, content: "Спасибо!", time: "20:33"),
            ]
        }
        let conversation: [String: Any] = ["id": "c11", "client_id": 11, "curator_id": 7, "unread_count": 2,
                                           "participant": ["id": 11, "name": "Мария К."],
                                           "last_message": curator.chat.last ?? [:]]
        switch (method, path) {
        case ("GET", "/api/v1/conversations"):
            let other: [String: Any] = ["id": "c16", "client_id": 16, "curator_id": 7, "unread_count": 0,
                                        "participant": ["id": 16, "name": "Алексей В."],
                                        "last_message": Self.curatorMessage("a1", sender: 16, content: "Записал завтрак", time: "09:10")]
            return Self.ok(Self.json([other, conversation]))
        case ("GET", "/api/v1/conversations/by-participant/11"):
            return Self.ok(Self.json(conversation))
        case let ("GET", other) where other.hasPrefix("/api/v1/conversations/by-participant/"):
            return (404, #"{"status":"error","code":"not_found","message":"Переписка не найдена"}"#)
        case ("GET", "/api/v1/conversations/c11/messages"):
            return Self.ok(Self.json(Array(curator.chat.reversed())))
        case ("POST", "/api/v1/conversations/c11/messages"):
            let message = Self.curatorMessage("k\(curator.chat.count + 1)", sender: 7, type: body["type"] as? String ?? "text",
                                              content: body["content"] as? String, time: "20:40")
            curator.chat.append(message)
            return (201, #"{"status":"success","data":\#(Self.json(message))}"#)
        case let ("POST", food) where food.hasPrefix("/api/v1/conversations/c11/messages/") && food.hasSuffix("/food-entry"):
            let card = Self.curatorMessage("k\(curator.chat.count + 1)", sender: 7, type: "food_entry", content: "запись",
                                           time: "20:40", metadata: body)
            curator.chat.append(card)
            return (201, #"{"status":"success","data":\#(Self.json(card))}"#)
        case ("POST", "/api/v1/conversations/c11/read"):
            return Self.ok(#"{"status":"ok"}"#)
        case ("GET", "/api/v1/conversations/unread"):
            return Self.ok(#"{"count":6}"#)
        default:
            return nil
        }
    }

    // MARK: Заявки

    private func leadsResponse(_ method: String, _ path: String, _ query: [String: String]) -> (Int, String)? {
        switch (method, path) {
        case ("GET", "/api/v1/curator/leads"):
            func lead(_ id: String, _ fields: [String: Any]) -> [String: Any] {
                var lead: [String: Any] = ["id": id, "parameters": [:] as [String: Any], "attribution": [:] as [String: Any],
                                           "reminder_sent": false, "contact_allowed": true]
                lead.merge(fields) { _, new in new }
                if curator.handledLeads.contains(id) { lead["handled_at"] = "2026-10-19T10:00:00Z" }
                return lead
            }
            var items = [
                lead("l1", ["email": "k***@mail.ru", "name": "Екатерина", "last_step": "result", "age_days": 3, "reminder_sent": true,
                            "parameters": ["goal": "loss", "height_cm": 168, "weight_kg": 74], "result": ["calories": 1780],
                            "attribution": ["utm_source": "yandex", "utm_medium": "cpc", "utm_campaign": "kbzhu_autumn"]]),
                lead("l2", ["email": "a***@gmail.com", "last_step": "bot", "age_days": 1, "contact_allowed": false,
                            "attribution": ["referrer": "https://t.me/burcev_bot"], "conversation_id": "s1"]),
                lead("l3", ["email": "s***@yandex.ru", "name": "Сергей", "last_step": "registration", "age_days": 0,
                            "contact_allowed": false]),
            ]
            if query["include_handled"] != "true" { items.removeAll { curator.handledLeads.contains($0["id"] as? String ?? "") } }
            return Self.ok(Self.json(["items": items, "total": items.count, "limit": 50, "offset": 0]))
        case ("POST", "/api/v1/curator/leads/l1/handled") where Self.flag("-uiTestLeadConflict"):
            curator.handledLeads.insert("l1")
            return Self.error(409, "lead_already_claimed")
        case let ("POST", handled) where handled.hasPrefix("/api/v1/curator/leads/") && handled.hasSuffix("/handled"):
            curator.handledLeads.insert(handled.split(separator: "/")[4].description)
            return Self.ok(#"{"handled":true}"#)
        default:
            return nil
        }
    }

    // MARK: Обращения

    private func supportResponse(_ method: String, _ path: String, _ body: [String: Any]) -> (Int, String)? {
        let base = "/api/v1/curator/support/conversations"
        guard path.hasPrefix(base) else { return nil }
        let escalatedAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-12 * 60))
        let telegram: [String: Any] = ["id": "s1", "channel": "telegram", "status": curator.supportClosed ? "closed" : "escalated",
                                       "telegram_username": "nina_run", "lead_id": "l2",
                                       "escalation_reason": "вопрос про медицинские противопоказания", "escalated_at": escalatedAt,
                                       "last_message_at": escalatedAt]
        let web: [String: Any] = ["id": "s2", "channel": "web", "status": "open", "last_message_at": escalatedAt]
        switch (method, String(path.dropFirst(base.count))) {
        case ("GET", ""):
            let list = curator.supportClosed ? [web, telegram] : [telegram, web]
            return Self.ok(Self.json(["items": list, "total": 2, "limit": 50, "offset": 0]))
        case ("GET", "/s1"):
            var messages: [[String: Any]] = [
                ["id": "u1", "author": "user", "text": "Можно ли мне дефицит, если у меня гастрит?", "created_at": escalatedAt],
                ["id": "b1", "author": "bot", "text": "На такой вопрос лучше ответит человек. Я позвала куратора.",
                 "created_at": escalatedAt],
                ["id": "o1", "author": "operator", "text": "Здравствуйте! Дефицит возможен, но сначала...", "created_at": escalatedAt,
                 "delivered": curator.delivered],
            ]
            for (index, reply) in curator.replies.enumerated() {
                messages.append(["id": "o\(index + 2)", "author": "operator", "text": reply, "created_at": escalatedAt, "delivered": true])
            }
            return Self.ok(Self.json(["conversation": telegram, "messages": messages,
                                      "lead": ["id": "l2", "email": "n***@mail.ru", "name": "", "last_step": "contact",
                                               "summary": "цель: loss, расчёт: 1650 ккал"]]))
        case ("GET", "/s2"):
            return Self.ok(Self.json(["conversation": web, "messages": [["id": "w1", "author": "user", "text": "Здравствуйте",
                                                                         "created_at": escalatedAt]], "lead": NSNull()]))
        case let ("POST", reply) where reply.hasSuffix("/reply"):
            curator.replies.append(body["text"] as? String ?? "")
            return Self.ok(#"{"sent":true}"#)
        case ("POST", "/s1/messages/o1/retry"):
            curator.delivered = true
            return Self.ok(#"{"message":{"id":"o1","author":"operator","text":"Здравствуйте! Дефицит возможен, но сначала...","#
                           + #""created_at":"2026-10-19T09:10:00Z","delivered":true}}"#)
        case ("POST", "/s1/close"):
            curator.supportClosed = true
            return Self.ok(#"{"closed":true}"#)
        default:
            return nil
        }
    }
}
#endif
