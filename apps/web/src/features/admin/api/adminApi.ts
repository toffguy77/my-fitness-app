import { apiClient } from '@/shared/utils/api-client'
import type { AdminUser, CuratorLoad, AdminConversation, AdminMessage } from '../types'
import type { Page, PageRequest } from '@/shared/types/pagination'
import { pageQuery } from '@/shared/types/pagination'

const BASE = '/api/v1/admin'

export const adminApi = {
    // Paginated: the list used to be unbounded and joined an aggregate over
    // every refresh token ever issued.
    getUsers: (page?: PageRequest) =>
        apiClient.get<Page<AdminUser>>(`${BASE}/users${pageQuery(page)}`),

    // Fetching one user by id. The detail screen used to load the whole list
    // and search it client-side, which stops working once the list is paged.
    getUser: (userId: number) => apiClient.get<AdminUser>(`${BASE}/users/${userId}`),

    getCurators: () => apiClient.get<CuratorLoad[]>(`${BASE}/curators`),

    changeRole: (userId: number, role: string) =>
        apiClient.post<void>(`${BASE}/users/${userId}/role`, { role }),

    assignCurator: (clientId: number, curatorId: number) =>
        apiClient.post<void>(`${BASE}/assignments`, { client_id: clientId, curator_id: curatorId }),

    getConversations: () => apiClient.get<AdminConversation[]>(`${BASE}/conversations`),

    getConversationMessages: (conversationId: string, cursor?: string, limit?: number) => {
        const params = new URLSearchParams()
        if (cursor) params.set('cursor', cursor)
        if (limit) params.set('limit', String(limit))
        const qs = params.toString()
        return apiClient.get<AdminMessage[]>(`${BASE}/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`)
    },

    // Onboarding attempts that stopped short of registration. The contact and
    // the step they stopped at are the whole point: without them there is
    // nothing to follow up on.
    getLeads: (page?: PageRequest) =>
        apiClient.get<Page<Lead>>(`${BASE}/leads${pageQuery(page)}`),

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

/** An onboarding attempt saved before registration. */
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
    source?: string
    consents: { data_processing: boolean; contact: boolean }
    handled_at?: string
    created_at: string
}