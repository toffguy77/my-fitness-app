import { apiClient } from '@/shared/utils/api-client'
import type { AdminUser, CuratorLoad, AdminConversation, AdminMessage } from '../types'

const BASE = '/backend-api/v1/admin'

export const adminApi = {
    getUsers: () => apiClient.get<AdminUser[]>(`${BASE}/users`),

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
