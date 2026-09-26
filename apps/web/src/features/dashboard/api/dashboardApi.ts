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

/**
 * A task as the API sends it.
 *
 * Both spellings of the two renamed fields are listed because both have been
 * seen on the wire, and the mapping below reads whichever is present. Naming
 * the shape is the point: with `any` here, a field the server stops sending
 * turned into `undefined` at the far end of the mapping instead of a type
 * error at this end.
 */
interface BackendTask {
    id: string
    title?: string
    type?: ClientTaskView['type']
    description?: string
    deadline?: string
    due_date?: string
    dueDate?: string
    recurrence?: ClientTaskView['recurrence']
    recurrence_days?: number[]
    status?: ClientTaskView['status']
    completions?: Array<string | { completed_date?: string; completedDate?: string }>
}

export const dashboardApi = {
    /**
     * Fetch current user's active tasks assigned by curator
     */
    getMyTasks: async (): Promise<{ tasks: ClientTaskView[]; count: number; week: number }> => {
        const data = await apiClient.get<{ tasks: BackendTask[]; count: number; week: number }>(getApiUrl('/dashboard/tasks'))
        return {
            ...data,
            tasks: (data.tasks || []).map((t) => ({
                id: t.id,
                title: t.title ?? '',
                type: t.type ?? 'habit',
                description: t.description,
                deadline: t.deadline ?? t.due_date ?? t.dueDate ?? '',
                recurrence: t.recurrence ?? 'once',
                recurrence_days: t.recurrence_days,
                status: t.status ?? 'active',
                completions: Array.isArray(t.completions)
                    ? t.completions.map((c) => typeof c === 'string' ? c : c.completed_date ?? c.completedDate ?? '')
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

    /**
     * Отправить недельный отчёт куратору.
     *
     * Сервер сам проверяет полноту недели и отказывает с перечнем того, чего
     * не хватает; куратор получает уведомление уже из службы дашборда.
     */
    submitWeeklyReport: (weekStart: string, weekEnd: string) =>
        apiClient.post<{ id: string; week_number: number }>(getApiUrl('/dashboard/weekly-report'), {
            week_start: weekStart,
            week_end: weekEnd,
        }),
}
