import { apiClient } from '@/shared/utils/api-client'
import type { ContentNotificationPreferences, UpdatePreferencesRequest } from '../types'

const BASE = '/backend-api/v1/notifications/preferences'

export async function getNotificationPreferences(): Promise<ContentNotificationPreferences> {
    return apiClient.get<ContentNotificationPreferences>(BASE)
}

export async function updateNotificationPreferences(req: UpdatePreferencesRequest): Promise<void> {
    await apiClient.put(BASE, req)
}
