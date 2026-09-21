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

    // Paginated: the list joins an aggregate over every message ever sent, so
    // an unbounded version gets slower with every conversation the product has.
    getConversations: (page?: PageRequest) =>
        apiClient.get<Page<AdminConversation>>(`${BASE}/conversations${pageQuery(page)}`),

    getConversationMessages: (conversationId: string, cursor?: string, limit?: number) => {
        const params = new URLSearchParams()
        if (cursor) params.set('cursor', cursor)
        if (limit) params.set('limit', String(limit))
        const qs = params.toString()
        return apiClient.get<AdminMessage[]>(`${BASE}/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`)
    },

    // Периодические задачи: расписание, последний запуск и ручной запуск.
    // Единственное место, где видно, что задача вообще существует и работает —
    // до этого ответ на «выполняется ли она и успешно ли» приходилось искать в
    // логах контейнера.
    getJobs: () => apiClient.get<{ jobs: Job[] }>(`${BASE}/jobs`),

    runJob: (name: string) =>
        apiClient.post<{ job: string; started: boolean }>(
            `${BASE}/jobs/${encodeURIComponent(name)}/run`, {}),
}

/** A periodic job as the admin area sees it. */
export interface JobRun {
    started_at: string
    finished_at?: string
    status: string
    error?: string
    items_processed: number
}

export interface Job {
    name: string
    /** Human-readable schedule, or "manual only" for jobs nobody schedules. */
    schedule: string
    last_run?: JobRun | null
}
