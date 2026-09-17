import { apiClient } from '@/shared/utils/api-client'

export interface DeletionStatus {
    requested: boolean
    requested_at?: string
    scheduled_for?: string
}

export interface DataExport {
    id: string
    status: 'pending' | 'building' | 'ready' | 'failed'
    requested_at: string
    completed_at?: string
    expires_at?: string
    downloaded: boolean
}

const BASE = '/api/v1/users/me'

export const accountApi = {
    getDeletionStatus: () => apiClient.get<DeletionStatus>(`${BASE}/deletion`),

    // A password account proves it is them with the password; a passwordless
    // one (signed up through a provider or a magic link) has none to give, so
    // it proves the same thing with a code mailed to its own address instead —
    // see requestDeletionCode. Exactly one of the two is ever non-empty.
    requestDeletion: (currentPassword: string, code: string = '') =>
        apiClient.post<DeletionStatus>(`${BASE}/deletion`, { current_password: currentPassword, code }),

    // The code a passwordless account needs before it can call
    // requestDeletion at all.
    requestDeletionCode: () => apiClient.post<{ sent: boolean }>(`${BASE}/deletion/code`, {}),

    cancelDeletion: () => apiClient.delete<{ cancelled: boolean }>(`${BASE}/deletion`),

    listExports: () => apiClient.get<{ exports: DataExport[] }>(`${BASE}/export`),

    requestExport: () => apiClient.post<DataExport>(`${BASE}/export`, {}),

    downloadExportUrl: (exportId: string) => `${BASE}/export/${exportId}`,
}
