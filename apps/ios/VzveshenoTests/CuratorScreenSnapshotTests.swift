import Client
import Curator
import DesignSystem
import SwiftUI
@testable import Vzvesheno
import XCTest

/// Экраны куратора с макетами ряда «Куратор»; данные — с макетов.
@MainActor
final class CuratorScreenSnapshotTests: XCTestCase {
    private let calendar = DayCalendar(timeZone: TimeZone(identifier: "Europe/Moscow") ?? .current)
    private let today = "2025-10-17"

    /// 17 октября 2025, по Москве.
    private func at(_ time: String) -> Date {
        let parts = time.split(separator: ":").compactMap { Double($0) }
        return Date(timeIntervalSince1970: 1_760_648_400 + parts[0] * 3600 + parts[1] * 60)
    }

    private let plan = Macros(calories: 2240, protein: 120, fat: 75, carbs: 250)

    private func item(_ id: Int64, _ name: String, _ reason: String, _ detail: String, _ priority: Int) -> AttentionItem {
        AttentionItem(clientID: id, clientName: name, reason: reason, detail: detail, priority: priority,
                      actionURL: reason == "unread_message" ? "/curator/chat/\(id)" : "/curator/clients/\(id)")
    }

    /// Макет CuratorClients.png: сводка, «Требуют внимания», «Остальные».
    func testCuratorClients() {
        let analytics = CuratorAnalytics(totalClients: 14, attentionClients: 4, avgKBZHUPercent: 87, totalUnread: 6, clientsWaiting: 3,
                                         activeTasks: 9, overdueTasks: 2, completedToday: 0)
        let items = [
            item(11, "Мария К.", "red_alert", "Калории: 2960 из 2240 (132%)", 1),
            item(12, "Игорь П.", "overdue_task", "Просрочено: Замеры (дедлайн 15.10)", 2),
            item(13, "Ольга С.", "inactive", "Нет записей о питании сегодня и вчера", 3),
            item(11, "Мария К.", "unread_message", "Непрочитанных сообщений: 2", 4),
            item(14, "Денис Л.", "awaiting_feedback", "Отчёт за неделю 06.10 ожидает обратной связи", 5),
        ]
        let clients = [CuratorClient(id: 13, name: "Ольга С.", lastActivityDate: "2025-10-15"),
                       CuratorClient(id: 16, name: "Алексей В.", weeklyKBZHUPercent: 76)]
        let groups = AttentionGrouping.groups(items, clients: clients, today: today, calendar: calendar)
        let content = HubContent(phase: .loaded, analytics: analytics, groups: groups,
                                 others: AttentionGrouping.others(clients, excluding: groups), query: .constant("")) {
            ProfileAvatar(initial: "А")
        }
        assertScreenSnapshot(content, named: "light")
        assertScreenSnapshot(content, named: "dark", colorScheme: .dark)
    }

    private var detail: ClientDetail {
        let client = CuratorClient(id: 11, name: "Мария К.", lastWeight: 68.1, lastWeightSource: "healthkit", targetWeight: 64,
                                   birthDate: "1993-03-02", biologicalSex: "female", fitnessGoal: "loss")
        let days = [
            ClientDay(date: "2025-10-17", kbzhu: Macros(calories: 2960, protein: 106, fat: 118, carbs: 330), plan: plan,
                      alerts: [ClientAlert(level: "red", message: "Калории значительно выше нормы: 2960 из 2240 (132%)")],
                      water: WaterView(glasses: 3, goal: 8), steps: 6412, stepsSource: "healthkit"),
            ClientDay(date: "2025-10-16", kbzhu: Macros(calories: 2180, protein: 110, fat: 70, carbs: 240), plan: plan),
            ClientDay(date: "2025-10-15", kbzhu: Macros(calories: 2050, protein: 100, fat: 65, carbs: 230), plan: plan),
        ]
        let weights = [69.4, 69.2, 69.3, 68.9, 68.8, 68.5, 68.4, 68.1].enumerated().map {
            WeightPoint(date: calendar.adding(days: -49 + $0.offset * 7, to: today), weight: $0.element, source: "healthkit")
        }
        // Чужой адрес — заглушка вместо загрузки: снимок не зависит от сети.
        let photos = [WeekPhoto(id: "p1", photoURL: "https://example.invalid/1.jpg", weekStart: "2025-10-13"),
                      WeekPhoto(id: "p2", photoURL: "https://example.invalid/2.jpg", weekStart: "2025-10-06")]
        return ClientDetail(client: client, days: days, weeklyPlan: plan, weightHistory: weights, photos: photos, waterGoal: 8)
    }

    /// Макет CuratorClient.png: шапка, вкладки, «Сегодня», вес и вода, дневник.
    func testCuratorClient() {
        let content = ClientCardContent(detail: detail, streak: 12, tab: .constant(.overview), today: today,
                                        taskFilter: .constant(.active), calendar: calendar)
        assertScreenSnapshot(content, named: "light")
    }

    /// Вкладки «План», «Задачи», «Отчёты» — макетов нет, собраны из тех же компонентов.
    func testCuratorClientTabs() {
        let plans = [ClientPlan(id: "w2", macros: plan, startDate: "2025-10-13", endDate: "2025-10-19", comment: "Держим белок",
                                isActive: true),
                     ClientPlan(id: "w1", macros: Macros(calories: 2100, protein: 110, fat: 70, carbs: 230), startDate: "2025-10-06",
                                endDate: "2025-10-12", isActive: false)]
        let planContent = ClientCardContent(detail: detail, streak: 12, tab: .constant(.plan), today: today, plans: plans,
                                            taskFilter: .constant(.active), calendar: calendar)
        assertScreenSnapshot(planContent, named: "plan")
        let tasks = [ClientTask(id: "t1", title: "Замеры талии", type: "measurement", deadline: "2025-10-21", status: "active"),
                     ClientTask(id: "t2", title: "Вода до обеда", type: "habit", description: "Два стакана до 13:00",
                                deadline: "2025-10-31", recurrence: "weekly", recurrenceDays: [1, 3, 5], status: "active")]
        let taskContent = ClientCardContent(detail: detail, streak: 12, tab: .constant(.tasks), today: today, tasks: tasks,
                                            taskFilter: .constant(.active), calendar: calendar)
        assertScreenSnapshot(taskContent, named: "tasks")
        let reports = [WeeklyReport(id: "r2", weekStart: "2025-10-06", weekEnd: "2025-10-12", hasFeedback: false),
                       WeeklyReport(id: "r1", weekStart: "2025-09-29", weekEnd: "2025-10-05",
                                    feedback: WeeklyFeedbackBody(summary: "Хорошая неделя: норма пять дней из семи."), hasFeedback: true)]
        let reportContent = ClientCardContent(detail: detail, streak: 12, tab: .constant(.reports), today: today,
                                              taskFilter: .constant(.active), reports: reports, calendar: calendar)
        assertScreenSnapshot(reportContent, named: "reports")
    }

    /// Макет CuratorChat.png: шапка с КБЖУ клиента, фото с «Ввести КБЖУ».
    func testCuratorChat() {
        let messages = [
            ChatMessage(id: "k1", senderID: 11, content: "Была на дне рождения, не удержалась...", createdAt: at("20:14")),
            ChatMessage(id: "k2", senderID: 11, kind: .image, content: nil, createdAt: at("20:14")),
            ChatMessage(id: "k3", senderID: 7, content: "Ничего страшного, это один день. Завтра вернёмся к плану — запишите завтрак, "
                        + "я посмотрю.", createdAt: at("20:31")),
            ChatMessage(id: "k4", senderID: 11, content: "Спасибо!", createdAt: at("20:33")),
        ]
        let content = CuratorConversationContent(name: "Мария К.", subtitle: "сегодня 2\u{00A0}960 из 2\u{00A0}240 ккал",
                                                 items: ChatTimeline.items(messages, calendar: calendar, now: at("20:40")),
                                                 curatorID: 7, calendar: calendar, text: .constant(""))
        assertScreenSnapshot(content, named: "light")
    }

    /// Макет CuratorKbju.png: лист «Ввести КБЖУ», приём по времени фото.
    func testCuratorKbju() {
        var draft = FoodEntryDraft(photoTime: at("20:14"), calendar: calendar)
        draft.name = "Торт «Наполеон»"
        draft.weight = "180"
        draft.calories = "684"
        draft.protein = "9"
        draft.fat = "45"
        draft.carbs = "61"
        let content = FoodEntryContent(clientName: "Мария К.", photoURL: nil, draft: .constant(draft))
        assertScreenSnapshot(content, named: "light")
    }

    /// Макет CuratorLeads.png: очередь, нет согласия, «Переписка».
    func testCuratorLeads() {
        let leads = [
            Lead(id: "l1", email: "k***@mail.ru", name: "Екатерина",
                 parameters: Lead.Parameters(heightCm: 168, weightKg: 74, goal: "loss"), calories: 1780, lastStep: "result",
                 attribution: Lead.Attribution(utmSource: "yandex", utmMedium: "cpc", utmCampaign: "kbzhu_autumn"), ageDays: 3,
                 reminderSent: true),
            Lead(id: "l2", email: "a***@gmail.com", lastStep: "bot", attribution: Lead.Attribution(referrer: "https://t.me/burcev_bot"),
                 ageDays: 1, contactAllowed: false, conversationID: "s1"),
            Lead(id: "l3", email: "s***@yandex.ru", name: "Сергей", lastStep: "registration", ageDays: 0, contactAllowed: false),
        ]
        let content = LeadsContent(leads: leads, waiting: 3, loaded: true, includeHandled: .constant(false)) { EmptyView() }
        assertScreenSnapshot(content, named: "light")
    }

    /// Макет CuratorSupport.png: заявка, причина, недоставленный ответ, подпись канала.
    func testCuratorSupport() {
        let now = at("13:00")
        let conversation = SupportConversation(id: "s1", channel: "telegram", status: "escalated", username: "nina_run",
                                               escalationReason: "вопрос про медицинские противопоказания",
                                               escalatedAt: now.addingTimeInterval(-12 * 60))
        let thread = SupportThread(
            conversation: conversation,
            messages: [
                SupportMessage(id: "u1", author: "user", text: "Можно ли мне дефицит, если у меня гастрит?", createdAt: at("12:48")),
                SupportMessage(id: "b1", author: "bot", text: "На такой вопрос лучше ответит человек. Я позвала куратора.",
                               createdAt: at("12:48")),
                SupportMessage(id: "o1", author: "operator", text: "Здравствуйте! Дефицит возможен, но сначала...", createdAt: at("12:59"),
                               delivered: false),
            ],
            lead: SupportThread.LinkedLead(id: "l9", email: "n***@mail.ru", lastStep: "contact", summary: "снижение, 1\u{00A0}650 ккал"))
        let content = SupportThreadContent(thread: thread, now: now, text: .constant(""))
        assertScreenSnapshot(content, named: "light")
    }
}
