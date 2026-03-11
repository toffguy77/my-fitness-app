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
    getMyTasks: async (): Promise<{ tasks: ClientTaskView[]; count: number; week: number }> => {
        const data = await apiClient.get<{ tasks: any[]; count: number; week: number }>(getApiUrl('/dashboard/tasks'))
        return {
            ...data,
            tasks: (data.tasks || []).map((t: any) => ({
                id: t.id,
                title: t.title ?? '',
                type: t.type ?? 'habit',
                description: t.description,
                deadline: t.deadline ?? t.due_date ?? t.dueDate ?? '',
                recurrence: t.recurrence ?? 'once',
                recurrence_days: t.recurrence_days,
                status: t.status ?? 'active',
                completions: Array.isArray(t.completions)
                    ? t.completions.map((c: any) => typeof c === 'string' ? c : c.completed_date ?? c.completedDate ?? '')
                    : [],
            })),
        }
    },

    /**
     * Mark a task as completed
     */
    completeTask: (taskId: string, workoutData?: { workout_type: string; workout_duration?: number }) =>
        apiClient.post<{ task: ClientTaskView; metric_synced: boolean }>(getApiUrl('/dashboard/tasks/' + taskId + '/complete'), workoutData ?? {}),

    /**
     * Fetch curator feedback for a specific weekly report
     */
    getReportFeedback: (reportId: string) =>
        apiClient.get<CuratorFeedback>(getApiUrl('/dashboard/weekly-reports/' + reportId + '/feedback')),
}
