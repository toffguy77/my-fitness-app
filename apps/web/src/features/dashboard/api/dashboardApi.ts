/**
 * Dashboard API client
 *
 * Client-side API functions for dashboard-specific endpoints:
 * - Curator-assigned tasks (fetch + complete)
 * - Weekly report feedback
 */

import { apiClient } from '@/shared/utils/api-client'
import { getApiUrl } from '@/config/api'
import type { ClientTaskView, CuratorFeedback } from '../types'

export const dashboardApi = {
    /**
     * Fetch current user's active tasks assigned by curator
     */
    getMyTasks: () =>
        apiClient.get<{ tasks: ClientTaskView[]; count: number; week: number }>(getApiUrl('/dashboard/tasks')),

    /**
     * Mark a task as completed
     */
    completeTask: (taskId: string) =>
        apiClient.post(getApiUrl('/dashboard/tasks/' + taskId + '/complete'), {}),

    /**
     * Fetch curator feedback for a specific weekly report
     */
    getReportFeedback: (reportId: string) =>
        apiClient.get<CuratorFeedback>(getApiUrl('/dashboard/weekly-reports/' + reportId + '/feedback')),
}
