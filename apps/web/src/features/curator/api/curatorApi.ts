import { apiClient } from '@/shared/utils/api-client'
import type {
    ClientCard,
    ClientDetail,
    WeeklyPlanView,
    CreateWeeklyPlanRequest,
    UpdateWeeklyPlanRequest,
    TaskView,
    CreateTaskRequest,
    WeeklyReportView,
    SubmitFeedbackRequest,
    AnalyticsSummary,
    AttentionItem,
    DailySnapshot,
    WeeklySnapshot,
    BenchmarkData,
} from '../types'

const BASE = '/api/v1/curator'

export const curatorApi = {
    getClients: () => apiClient.get<ClientCard[]>(`${BASE}/clients`),
    getClientDetail: (id: number, days?: number) =>
        apiClient.get<ClientDetail>(`${BASE}/clients/${id}?days=${days ?? 7}`),
    setTargetWeight: (clientId: number, targetWeight: number | null) =>
        apiClient.put(`${BASE}/clients/${clientId}/target-weight`, { target_weight: targetWeight }),
    setWaterGoal: (clientId: number, waterGoal: number | null) =>
        apiClient.put(`${BASE}/clients/${clientId}/water-goal`, { water_goal: waterGoal }),

    // Weekly plans
    getWeeklyPlans: (clientId: number) =>
        apiClient.get<WeeklyPlanView[]>(`${BASE}/clients/${clientId}/weekly-plans`),
    createWeeklyPlan: (clientId: number, req: CreateWeeklyPlanRequest) =>
        apiClient.post<WeeklyPlanView>(`${BASE}/clients/${clientId}/weekly-plan`, req),
    updateWeeklyPlan: (clientId: number, planId: string, req: UpdateWeeklyPlanRequest) =>
        apiClient.put<WeeklyPlanView>(`${BASE}/clients/${clientId}/weekly-plan/${planId}`, req),
    deleteWeeklyPlan: (clientId: number, planId: string) =>
        apiClient.delete(`${BASE}/clients/${clientId}/weekly-plan/${planId}`),

    // Tasks
    getTasks: (clientId: number, status?: string) =>
        apiClient.get<TaskView[]>(`${BASE}/clients/${clientId}/tasks${status ? `?status=${status}` : ''}`),
    createTask: (clientId: number, req: CreateTaskRequest) =>
        apiClient.post<TaskView>(`${BASE}/clients/${clientId}/tasks`, req),
    updateTask: (clientId: number, taskId: string, req: { title?: string; description?: string; deadline?: string; status?: string }) =>
        apiClient.put<TaskView>(`${BASE}/clients/${clientId}/tasks/${taskId}`, req),
    deleteTask: (clientId: number, taskId: string) =>
        apiClient.delete(`${BASE}/clients/${clientId}/tasks/${taskId}`),

    // Weekly reports & feedback
    getWeeklyReports: (clientId: number) =>
        apiClient.get<WeeklyReportView[]>(`${BASE}/clients/${clientId}/weekly-reports`),
    submitFeedback: (clientId: number, reportId: string, req: SubmitFeedbackRequest) =>
        apiClient.put(`${BASE}/clients/${clientId}/weekly-reports/${reportId}/feedback`, req),

    // Analytics
    getAnalytics: () => apiClient.get<AnalyticsSummary>(`${BASE}/analytics`),
    getAttentionList: () => apiClient.get<AttentionItem[]>(`${BASE}/attention`),
    getAnalyticsHistory: (period: 'daily' | 'weekly', count: number) =>
        apiClient.get<DailySnapshot[] | WeeklySnapshot[]>(`${BASE}/analytics/history?period=${period}&${period === 'daily' ? 'days' : 'weeks'}=${count}`),
    getBenchmark: (weeks: number) =>
        apiClient.get<BenchmarkData>(`${BASE}/analytics/benchmark?weeks=${weeks}`),
}
