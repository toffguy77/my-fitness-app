import { apiClient } from '@/shared/utils/api-client'
import type {
    ClientCard,
    ClientDetail,
    WeeklyPlanView,
    CreateWeeklyPlanRequest,
    UpdateWeeklyPlanRequest,
    TaskView,
    CreateTaskRequest,
    WeeklyReportView,
    SubmitFeedbackRequest,
    AnalyticsSummary,
    AttentionItem,
    DailySnapshot,
    WeeklySnapshot,
    BenchmarkData,
} from '../types'
import type { Page, PageRequest } from '@/shared/types/pagination'
import { pageQuery } from '@/shared/types/pagination'

const BASE = '/api/v1/curator'

export const curatorApi = {
    getClients: () => apiClient.get<ClientCard[]>(`${BASE}/clients`),
    getClientDetail: (id: number, days?: number) =>
        apiClient.get<ClientDetail>(`${BASE}/clients/${id}?days=${days ?? 7}`),
    setTargetWeight: (clientId: number, targetWeight: number | null) =>
        apiClient.put(`${BASE}/clients/${clientId}/target-weight`, { target_weight: targetWeight }),
    setWaterGoal: (clientId: number, waterGoal: number | null) =>
        apiClient.put(`${BASE}/clients/${clientId}/water-goal`, { water_goal: waterGoal }),

    // Weekly plans
    getWeeklyPlans: (clientId: number) =>
        apiClient.get<WeeklyPlanView[]>(`${BASE}/clients/${clientId}/weekly-plans`),
    createWeeklyPlan: (clientId: number, req: CreateWeeklyPlanRequest) =>
        apiClient.post<WeeklyPlanView>(`${BASE}/clients/${clientId}/weekly-plan`, req),
    updateWeeklyPlan: (clientId: number, planId: string, req: UpdateWeeklyPlanRequest) =>
        apiClient.put<WeeklyPlanView>(`${BASE}/clients/${clientId}/weekly-plan/${planId}`, req),
    deleteWeeklyPlan: (clientId: number, planId: string) =>
        apiClient.delete(`${BASE}/clients/${clientId}/weekly-plan/${planId}`),

    // Tasks
    getTasks: (clientId: number, status?: string) =>
        apiClient.get<TaskView[]>(`${BASE}/clients/${clientId}/tasks${status ? `?status=${status}` : ''}`),
    createTask: (clientId: number, req: CreateTaskRequest) =>
        apiClient.post<TaskView>(`${BASE}/clients/${clientId}/tasks`, req),
    updateTask: (clientId: number, taskId: string, req: { title?: string; description?: string; deadline?: string; status?: string }) =>
        apiClient.put<TaskView>(`${BASE}/clients/${clientId}/tasks/${taskId}`, req),
    deleteTask: (clientId: number, taskId: string) =>
        apiClient.delete(`${BASE}/clients/${clientId}/tasks/${taskId}`),

    // What the client has been told, and how it reached them.
    getClientNotices: (clientId: number) =>
        apiClient.get<ClientNotice[]>(`${BASE}/clients/${clientId}/notices`),

    // Weekly reports & feedback
    getWeeklyReports: (clientId: number) =>
        apiClient.get<WeeklyReportView[]>(`${BASE}/clients/${clientId}/weekly-reports`),
    submitFeedback: (clientId: number, reportId: string, req: SubmitFeedbackRequest) =>
        apiClient.put(`${BASE}/clients/${clientId}/weekly-reports/${reportId}/feedback`, req),

    // Analytics
    getAnalytics: () => apiClient.get<AnalyticsSummary>(`${BASE}/analytics`),
    getAttentionList: () => apiClient.get<AttentionItem[]>(`${BASE}/attention`),
    getAnalyticsHistory: (period: 'daily' | 'weekly', count: number) =>
        apiClient.get<DailySnapshot[] | WeeklySnapshot[]>(`${BASE}/analytics/history?period=${period}&${period === 'daily' ? 'days' : 'weeks'}=${count}`),
    getBenchmark: (weeks: number) =>
        apiClient.get<BenchmarkData>(`${BASE}/analytics/benchmark?weeks=${weeks}`),

    // Onboarding attempts that stopped short of registration, as a work
    // queue: the backend orders them longest-waiting-first among the
    // unhandled ones and clamps its own offset (task 3) — this only adds the
    // include_handled flag onto the same pagination query string.
    getLeads: (options?: PageRequest & { includeHandled?: boolean }) => {
        const { includeHandled, ...page } = options ?? {}
        const query = pageQuery(page)
        const separator = query ? '&' : '?'
        return apiClient.get<Page<Lead>>(
            `${BASE}/leads${query}${includeHandled ? `${separator}include_handled=true` : ''}`
        )
    },

    markLeadHandled: (leadId: string) =>
        apiClient.post<{ handled: boolean }>(`${BASE}/leads/${leadId}/handled`, {}),

    // Support conversations from the Telegram bot. Escalated ones come first:
    // somebody is waiting on the other end of those.
    getSupportConversations: (status?: string, page?: PageRequest) => {
        const query = pageQuery(page)
        const separator = query ? '&' : '?'
        return apiClient.get<Page<SupportConversation>>(
            `${BASE}/support/conversations${query}${status ? `${separator}status=${status}` : ''}`
        )
    },

    getSupportThread: (conversationId: string) =>
        apiClient.get<SupportThread>(`${BASE}/support/conversations/${conversationId}`),

    replyToSupport: (conversationId: string, text: string) =>
        apiClient.post<{ sent: boolean }>(`${BASE}/support/conversations/${conversationId}/reply`, { text }),

    closeSupport: (conversationId: string) =>
        apiClient.post<{ closed: boolean }>(`${BASE}/support/conversations/${conversationId}/close`, {}),
}

/** A Telegram support chat. */
export interface SupportConversation {
    id: string
    chat_id: number
    lead_id?: string
    user_id?: number
    status: 'open' | 'escalated' | 'closed'
    telegram_username?: string
    telegram_name?: string
    escalation_reason?: string
    escalated_at?: string
    last_message_at: string
    created_at: string
}

export interface SupportMessage {
    id: string
    author: 'user' | 'bot' | 'operator'
    text: string
    created_at: string
}

export interface SupportThread {
    conversation: SupportConversation
    messages: SupportMessage[]
    /** What the person was doing when they got stuck, when the chat came from
     *  a saved onboarding attempt. */
    lead?: {
        id: string
        email: string
        name?: string
        last_step: string
        summary: string
    }
}

/**
 * An onboarding attempt saved before registration, as the curator queue
 * returns it: task 3's `/curator/leads` always answers with these fields
 * alongside the lead itself, never the bare record.
 */
export interface Lead {
    id: string
    email: string
    name?: string
    parameters: {
        sex?: string
        birth_date?: string
        height_cm?: number
        weight_kg?: number
        activity_level?: string
        goal?: string
    }
    result?: {
        calories: number
        protein: number
        fat: number
        carbs: number
        water_glasses: number
    }
    last_step: string
    /** Адрес источника перехода, который сообщил браузер. Почти всегда пуст —
     *  ради этого заведено `attribution`. Остаётся ради строк, записанных до
     *  него. */
    source?: string
    /** Которую рекламу человек открыл, чтобы сюда попасть. */
    attribution: {
        utm_source?: string
        utm_medium?: string
        utm_campaign?: string
        utm_content?: string
        utm_term?: string
        yandex_click_id?: string
        metrika_client_id?: string
    }
    consents: { data_processing: boolean; contact: boolean }
    handled_at?: string
    created_at: string
    /** How many days the person has waited, computed server-side. */
    age_days: number
    /** Whether the one automatic reminder has already gone out. */
    reminder_sent: boolean
    /**
     * Whether writing to this person is allowed at all (migration 051's
     * separate contact consent). A lead can be in the queue — it says
     * something about the funnel — without permission to write to them; a
     * human follow-up must not become a loophole around a withheld consent.
     */
    contact_allowed: boolean
    /**
     * The support conversation opened from this lead's resume link, when the
     * person also talked to the bot. Absent for most leads until the
     * public-support-widget plan starts linking conversations widely — the
     * queue must not offer a transition to a conversation that does not
     * exist.
     */
    conversation_id?: string
}

/** One channel's outcome for a notification. */
export interface NoticeDelivery {
    channel: string
    status: string
    sentAt?: string
}

/** One thing a client was told. */
export interface ClientNotice {
    id: string
    type: string
    title: string
    createdAt: string
    readAt?: string
    deliveries: NoticeDelivery[]
}
