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
}
