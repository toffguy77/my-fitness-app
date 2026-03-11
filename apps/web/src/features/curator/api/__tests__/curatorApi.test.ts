import { curatorApi } from '../curatorApi'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        put: jest.fn(),
        post: jest.fn(),
        delete: jest.fn(),
    },
}))

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('curatorApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getClients', () => {
        it('calls GET /api/v1/curator/clients', async () => {
            const clients = [{ id: 1, name: 'Client 1' }]
            mockApiClient.get.mockResolvedValue(clients)

            const result = await curatorApi.getClients()

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/clients')
            expect(result).toEqual(clients)
        })
    })

    describe('getClientDetail', () => {
        it('calls GET with default days=7', async () => {
            const detail = { id: 1, name: 'Client 1', days: [] }
            mockApiClient.get.mockResolvedValue(detail)

            const result = await curatorApi.getClientDetail(1)

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/clients/1?days=7')
            expect(result).toEqual(detail)
        })

        it('calls GET with custom days parameter', async () => {
            mockApiClient.get.mockResolvedValue({})

            await curatorApi.getClientDetail(5, 14)

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/clients/5?days=14')
        })
    })

    describe('setTargetWeight', () => {
        it('calls PUT with target_weight payload', async () => {
            mockApiClient.put.mockResolvedValue(undefined)

            await curatorApi.setTargetWeight(10, 75.5)

            expect(mockApiClient.put).toHaveBeenCalledWith(
                '/api/v1/curator/clients/10/target-weight',
                { target_weight: 75.5 }
            )
        })

        it('sends null to clear target weight', async () => {
            mockApiClient.put.mockResolvedValue(undefined)

            await curatorApi.setTargetWeight(10, null)

            expect(mockApiClient.put).toHaveBeenCalledWith(
                '/api/v1/curator/clients/10/target-weight',
                { target_weight: null }
            )
        })
    })

    describe('setWaterGoal', () => {
        it('calls PUT with water_goal payload', async () => {
            mockApiClient.put.mockResolvedValue(undefined)

            await curatorApi.setWaterGoal(10, 10)

            expect(mockApiClient.put).toHaveBeenCalledWith(
                '/api/v1/curator/clients/10/water-goal',
                { water_goal: 10 }
            )
        })

        it('sends null to clear water goal', async () => {
            mockApiClient.put.mockResolvedValue(undefined)

            await curatorApi.setWaterGoal(10, null)

            expect(mockApiClient.put).toHaveBeenCalledWith(
                '/api/v1/curator/clients/10/water-goal',
                { water_goal: null }
            )
        })
    })

    describe('getWeeklyPlans', () => {
        it('calls GET /api/v1/curator/clients/:id/weekly-plans', async () => {
            const plans = [{ id: 'p1', week_start: '2026-03-02' }]
            mockApiClient.get.mockResolvedValue(plans)

            const result = await curatorApi.getWeeklyPlans(3)

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/clients/3/weekly-plans')
            expect(result).toEqual(plans)
        })
    })

    describe('createWeeklyPlan', () => {
        it('calls POST with plan payload', async () => {
            const req = { week_start: '2026-03-02', content: 'Plan content' }
            const created = { id: 'p1', ...req }
            mockApiClient.post.mockResolvedValue(created)

            const result = await curatorApi.createWeeklyPlan(3, req as any)

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/curator/clients/3/weekly-plan',
                req
            )
            expect(result).toEqual(created)
        })
    })

    describe('updateWeeklyPlan', () => {
        it('calls PUT with plan id and payload', async () => {
            const req = { content: 'Updated content' }
            const updated = { id: 'p1', ...req }
            mockApiClient.put.mockResolvedValue(updated)

            const result = await curatorApi.updateWeeklyPlan(3, 'p1', req as any)

            expect(mockApiClient.put).toHaveBeenCalledWith(
                '/api/v1/curator/clients/3/weekly-plan/p1',
                req
            )
            expect(result).toEqual(updated)
        })
    })

    describe('deleteWeeklyPlan', () => {
        it('calls DELETE with plan id', async () => {
            mockApiClient.delete.mockResolvedValue(undefined)

            await curatorApi.deleteWeeklyPlan(3, 'p1')

            expect(mockApiClient.delete).toHaveBeenCalledWith(
                '/api/v1/curator/clients/3/weekly-plan/p1'
            )
        })
    })

    describe('getTasks', () => {
        it('calls GET without status filter', async () => {
            const tasks = [{ id: 't1', title: 'Task 1' }]
            mockApiClient.get.mockResolvedValue(tasks)

            const result = await curatorApi.getTasks(3)

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/clients/3/tasks')
            expect(result).toEqual(tasks)
        })

        it('calls GET with status filter', async () => {
            mockApiClient.get.mockResolvedValue([])

            await curatorApi.getTasks(3, 'active')

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/clients/3/tasks?status=active')
        })
    })

    describe('createTask', () => {
        it('calls POST with task payload', async () => {
            const req = { title: 'New task', description: 'Do something' }
            const created = { id: 't1', ...req }
            mockApiClient.post.mockResolvedValue(created)

            const result = await curatorApi.createTask(3, req as any)

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/curator/clients/3/tasks',
                req
            )
            expect(result).toEqual(created)
        })
    })

    describe('updateTask', () => {
        it('calls PUT with task id and payload', async () => {
            const req = { title: 'Updated task' }
            const updated = { id: 't1', ...req }
            mockApiClient.put.mockResolvedValue(updated)

            const result = await curatorApi.updateTask(3, 't1', req as any)

            expect(mockApiClient.put).toHaveBeenCalledWith(
                '/api/v1/curator/clients/3/tasks/t1',
                req
            )
            expect(result).toEqual(updated)
        })
    })

    describe('deleteTask', () => {
        it('calls DELETE with task id', async () => {
            mockApiClient.delete.mockResolvedValue(undefined)

            await curatorApi.deleteTask(3, 't1')

            expect(mockApiClient.delete).toHaveBeenCalledWith(
                '/api/v1/curator/clients/3/tasks/t1'
            )
        })
    })

    describe('getWeeklyReports', () => {
        it('calls GET /api/v1/curator/clients/:id/weekly-reports', async () => {
            const reports = [{ id: 'r1', week_number: 10 }]
            mockApiClient.get.mockResolvedValue(reports)

            const result = await curatorApi.getWeeklyReports(3)

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/clients/3/weekly-reports')
            expect(result).toEqual(reports)
        })
    })

    describe('submitFeedback', () => {
        it('calls PUT with report id and feedback payload', async () => {
            const req = { summary: 'Good week', nutrition: { rating: 'good' } }
            mockApiClient.put.mockResolvedValue(undefined)

            await curatorApi.submitFeedback(3, 'r1', req as any)

            expect(mockApiClient.put).toHaveBeenCalledWith(
                '/api/v1/curator/clients/3/weekly-reports/r1/feedback',
                req
            )
        })
    })

    describe('getAnalytics', () => {
        it('calls GET /api/v1/curator/analytics', async () => {
            const analytics = { total_clients: 10 }
            mockApiClient.get.mockResolvedValue(analytics)

            const result = await curatorApi.getAnalytics()

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/analytics')
            expect(result).toEqual(analytics)
        })
    })

    describe('getAttentionList', () => {
        it('calls GET /api/v1/curator/attention', async () => {
            const items = [{ client_id: 1, reason: 'inactive' }]
            mockApiClient.get.mockResolvedValue(items)

            const result = await curatorApi.getAttentionList()

            expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/curator/attention')
            expect(result).toEqual(items)
        })
    })

    describe('getAnalyticsHistory', () => {
        it('calls GET with daily period and days count', async () => {
            mockApiClient.get.mockResolvedValue([])

            await curatorApi.getAnalyticsHistory('daily', 7)

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/api/v1/curator/analytics/history?period=daily&days=7'
            )
        })

        it('calls GET with weekly period and weeks count', async () => {
            mockApiClient.get.mockResolvedValue([])

            await curatorApi.getAnalyticsHistory('weekly', 4)

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/api/v1/curator/analytics/history?period=weekly&weeks=4'
            )
        })
    })

    describe('getBenchmark', () => {
        it('calls GET with weeks parameter', async () => {
            const benchmark = { avg_compliance: 0.85 }
            mockApiClient.get.mockResolvedValue(benchmark)

            const result = await curatorApi.getBenchmark(8)

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/api/v1/curator/analytics/benchmark?weeks=8'
            )
            expect(result).toEqual(benchmark)
        })
    })
})
