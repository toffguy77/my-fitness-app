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

    // The password is required because this is the most destructive action the
    // product offers; an unattended session must not be enough.
    requestDeletion: (currentPassword: string) =>
        apiClient.post<DeletionStatus>(`${BASE}/deletion`, { current_password: currentPassword }),

    cancelDeletion: () => apiClient.delete<{ cancelled: boolean }>(`${BASE}/deletion`),

    listExports: () => apiClient.get<{ exports: DataExport[] }>(`${BASE}/export`),

    requestExport: () => apiClient.post<DataExport>(`${BASE}/export`, {}),

    downloadExportUrl: (exportId: string) => `${BASE}/export/${exportId}`,
}
