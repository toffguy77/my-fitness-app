import Foundation

/// Демо-режим для скриншотов App Store: приложение запускается с готовыми
/// данными и без сети. Только в отладочной сборке — в TestFlight и App Store
/// его нет.
///
/// Запуск: `-demo client|curator -demoScreen today|diary|chat|profile|clients|client`.
enum Demo {
    enum Screen: String {
        case today, diary, menu, chat, profile, clients, client, leads
    }

    #if DEBUG
    static let role: Role? = {
        guard let raw = UserDefaults.standard.string(forKey: "demo") else { return nil }
        return raw == "curator" ? .coordinator : .client
    }()

    static let screen: Screen? = UserDefaults.standard.string(forKey: "demoScreen").flatMap(Screen.init)
    #else
    static let role: Role? = nil
    static let screen: Screen? = nil
    #endif

    static var isActive: Bool { role != nil }
}

#if DEBUG
/// Ответы демо-режима — в той же обёртке и тех же формах, что у сервера.
struct DemoTransport: HTTPTransport {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let path = request.url?.path ?? ""
        let body = Self.payload(for: path, method: request.httpMethod ?? "GET")
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (Data(#"{"status":"success","data":\#(body)}"#.utf8), response)
    }

    private static func payload(for path: String, method: String) -> String {
        switch path {
        case "/api/v1/food-tracker/entries" where method == "GET":
            return entries
        case "/api/v1/nutrition-calc/targets":
            return #"{"id":1,"user_id":1,"date":"2026-10-11T00:00:00Z","calories":1850,"protein":125,"fat":62,"carbs":195,"source":"curator_override"}"#
        case "/api/v1/food-tracker/water":
            return #"{"glasses":5,"goal":8,"glass_size":250,"enabled":true}"#
        case let p where p.hasPrefix("/api/v1/dashboard/daily/"):
            return #"{"id":"d1","user_id":1,"date":"2026-10-11T00:00:00Z","calories":0,"protein":0,"fat":0,"carbs":0,"weight":68.4,"steps":8420,"workout_completed":true}"#
        case "/api/v1/conversations":
            return #"[{"id":"c1","client_id":1,"curator_id":2,"unread_count":1,"participant":{"id":2,"name":"Мария, куратор"},"last_message":\#(messages[0]),"created_at":"2026-10-01T09:00:00Z","updated_at":"2026-10-11T09:00:00Z"},{"id":"c2","client_id":3,"curator_id":2,"unread_count":0,"participant":{"id":3,"name":"Ольга"},"created_at":"2026-10-01T09:00:00Z","updated_at":"2026-10-10T09:00:00Z"}]"#
        case let p where p.hasSuffix("/messages") && method == "GET":
            return "[" + messages.joined(separator: ",") + "]"
        case "/api/v1/users/profile":
            return #"{"profile":{"id":1,"email":"anna@example.com","name":"Анна","role":"client","onboarding_completed":true,"settings":{"language":"ru","units":"metric","timezone":"Europe/Moscow"}}}"#
        case "/api/v1/users/me/deletion":
            return #"{"requested":false}"#
        case "/api/v1/curator/clients":
            return "[" + clients.joined(separator: ",") + "]"
        case let p where p.hasPrefix("/api/v1/curator/clients/"):
            return clientDetail
        default:
            return "{}"
        }
    }

    private static func entry(_ id: String, _ name: String, _ meal: String, _ grams: Int, _ time: String,
                              _ kcal: Double, _ p: Double, _ f: Double, _ c: Double) -> String {
        #"{"id":"\#(id)","userId":1,"foodId":"f\#(id)","foodName":"\#(name)","mealType":"\#(meal)","portionType":"grams","portionAmount":\#(grams),"nutrition":{"calories":\#(kcal),"protein":\#(p),"fat":\#(f),"carbs":\#(c)},"time":"\#(time)","date":"2026-10-11T00:00:00Z","createdAt":"2026-10-11T06:00:00Z","updatedAt":"2026-10-11T06:00:00Z"}"#
    }

    private static let entries: String = {
        let breakfast = [
            entry("1", "Овсянка на молоке", "breakfast", 250, "08:10", 255, 9.8, 7.5, 37),
            entry("2", "Банан", "breakfast", 120, "08:10", 115, 1.8, 0.4, 26),
        ]
        let lunch = [
            entry("3", "Куриная грудка запечённая", "lunch", 180, "13:20", 297, 55.8, 6.5, 0),
            entry("4", "Гречка отварная", "lunch", 200, "13:20", 220, 7.6, 2.2, 42),
            entry("5", "Салат из свежих овощей", "lunch", 150, "13:20", 68, 1.5, 4.2, 6),
        ]
        let snack = [
            entry("6", "Творог 5%", "snack", 180, "16:45", 218, 30.6, 9, 5.4),
        ]
        return #"{"entries":{"breakfast":[\#(breakfast.joined(separator: ","))],"lunch":[\#(lunch.joined(separator: ","))],"dinner":[],"snack":[\#(snack.joined(separator: ","))]},"dailyTotals":{"calories":1173,"protein":107.1,"fat":29.8,"carbs":116.4}}"#
    }()

    private static let messages: [String] = [
        #"{"id":"m4","conversation_id":"c1","sender_id":2,"type":"text","content":"Отлично! Ужин оставьте лёгким: рыба и овощи, и норма по белку будет закрыта.","created_at":"2026-10-11T14:05:00Z"}"#,
        #"{"id":"m3","conversation_id":"c1","sender_id":1,"type":"text","content":"Записала обед. Гречка и курица, как договаривались 🙂","created_at":"2026-10-11T13:30:00Z"}"#,
        #"{"id":"m2","conversation_id":"c1","sender_id":2,"type":"text","content":"Вижу завтрак, хорошее начало. В обед добавьте белка — до нормы не хватает около 60 г.","created_at":"2026-10-11T09:15:00Z"}"#,
        #"{"id":"m1","conversation_id":"c1","sender_id":1,"type":"text","content":"Доброе утро! Вчера уложилась в калории 💪","created_at":"2026-10-11T08:20:00Z"}"#,
    ]

    private static func client(_ id: Int, _ name: String, _ kcal: Double, _ plan: Double, _ alerts: String, _ unread: Int, _ weight: Double) -> String {
        #"{"id":\#(id),"name":"\#(name)","today_kbzhu":{"calories":\#(kcal),"protein":80,"fat":40,"carbs":150},"plan":{"calories":\#(plan),"protein":120,"fat":60,"carbs":200},"alerts":\#(alerts),"unread_count":\#(unread),"last_weight":\#(weight),"weight_trend":"down","target_weight":62,"today_water":null,"active_tasks_count":2,"overdue_tasks_count":0,"streak_days":12}"#
    }

    private static let clients: [String] = [
        client(11, "Анна Смирнова", 1173, 1850, #"[{"level":"yellow","message":"Белок ниже нормы на 18%"}]"#, 1, 68.4),
        client(12, "Ольга Петрова", 2410, 1900, #"[{"level":"red","message":"Калорийность выше плана на 27%"}]"#, 0, 74.1),
        client(13, "Ирина Ковалёва", 1760, 1800, "[]", 2, 59.8),
        client(14, "Екатерина Орлова", 1590, 1700, "[]", 0, 65.2),
        client(15, "Дарья Волкова", 920, 1750, #"[{"level":"yellow","message":"Нет записей после обеда"}]"#, 0, 70.6),
    ]

    private static let clientDetail: String = {
        func day(_ date: String, _ kcal: Double, _ p: Double, _ f: Double, _ c: Double, _ alerts: String, _ food: String) -> String {
            #"{"date":"\#(date)","kbzhu":{"calories":\#(kcal),"protein":\#(p),"fat":\#(f),"carbs":\#(c)},"plan":{"calories":1850,"protein":125,"fat":62,"carbs":195},"alerts":\#(alerts),"steps":8420,"food_entries":\#(food),"water":null,"workout":null}"#
        }
        let food = #"[{"id":"1","food_name":"Овсянка на молоке","meal_type":"breakfast","calories":255,"protein":9.8,"fat":7.5,"carbs":37,"weight":250,"time":"08:10"},{"id":"3","food_name":"Куриная грудка запечённая","meal_type":"lunch","calories":297,"protein":55.8,"fat":6.5,"carbs":0,"weight":180,"time":"13:20"},{"id":"4","food_name":"Гречка отварная","meal_type":"lunch","calories":220,"protein":7.6,"fat":2.2,"carbs":42,"weight":200,"time":"13:20"},{"id":"6","food_name":"Творог 5%","meal_type":"snack","calories":218,"protein":30.6,"fat":9,"carbs":5.4,"weight":180,"time":"16:45"}]"#
        let days = [
            day("2026-10-11", 1173, 107, 30, 116, #"[{"level":"yellow","message":"Белок ниже нормы на 18%"}]"#, food),
            day("2026-10-10", 1820, 128, 58, 190, "[]", "[]"),
        ]
        return #"{"id":11,"name":"Анна Смирнова","email":"anna@example.com","today_kbzhu":{"calories":1173,"protein":107,"fat":30,"carbs":116},"plan":{"calories":1850,"protein":125,"fat":62,"carbs":195},"alerts":[],"unread_count":1,"last_weight":68.4,"weight_trend":"down","target_weight":62,"today_water":null,"active_tasks_count":2,"overdue_tasks_count":0,"streak_days":12,"days":[\#(days.joined(separator: ","))],"weekly_plan":null,"weight_history":[],"photos":[],"water_goal":8}"#
    }()
}
#endif
