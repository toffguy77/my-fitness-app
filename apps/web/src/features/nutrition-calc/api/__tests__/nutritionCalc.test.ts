import { apiClient } from '@/shared/utils/api-client'
import { getTargets, getHistory, recalculate, getClientHistory } from '../nutritionCalc'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
    },
}))

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>
const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>

describe('nutritionCalc API', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getTargets', () => {
        it('returns targets when response has calories field', async () => {
            const targets = {
                calories: 2000,
                protein: 150,
                fat: 70,
                carbs: 230,
                bmr: 1700,
                tdee: 2300,
                workout_bonus: 300,
                weight_used: 80,
                source: 'calculated' as const,
            }
            mockGet.mockResolvedValueOnce(targets as never)

            const result = await getTargets()

            expect(mockGet).toHaveBeenCalledWith('/api/v1/nutrition-calc/targets')
            expect(result).toEqual(targets)
        })

        it('returns null when response is { targets: null }', async () => {
            mockGet.mockResolvedValueOnce({ targets: null } as never)

            const result = await getTargets()

            expect(result).toBeNull()
        })

        it('passes date as query param', async () => {
            mockGet.mockResolvedValueOnce({ calories: 2000 } as never)

            await getTargets('2026-03-01')

            expect(mockGet).toHaveBeenCalledWith(
                '/api/v1/nutrition-calc/targets?date=2026-03-01'
            )
        })

        it('returns nested targets when response wraps in targets field', async () => {
            const inner = {
                calories: 1800,
                protein: 120,
                fat: 60,
                carbs: 200,
                bmr: 1500,
                tdee: 2100,
                workout_bonus: 0,
                weight_used: 70,
                source: 'curator_override' as const,
            }
            mockGet.mockResolvedValueOnce({ targets: inner } as never)

            const result = await getTargets()

            expect(result).toEqual(inner)
        })
    })

    describe('getHistory', () => {
        it('fetches with default 7 days', async () => {
            const response = { days: [] }
            mockGet.mockResolvedValueOnce(response as never)

            const result = await getHistory()

            expect(mockGet).toHaveBeenCalledWith(
                '/api/v1/nutrition-calc/history?days=7'
            )
            expect(result).toEqual(response)
        })

        it('passes custom days parameter', async () => {
            mockGet.mockResolvedValueOnce({ days: [] } as never)

            await getHistory(14)

            expect(mockGet).toHaveBeenCalledWith(
                '/api/v1/nutrition-calc/history?days=14'
            )
        })
    })

    describe('recalculate', () => {
        it('posts to recalculate endpoint and returns direct response', async () => {
            const targets = {
                calories: 2200,
                protein: 160,
                fat: 75,
                carbs: 250,
                bmr: 1800,
                tdee: 2500,
                workout_bonus: 200,
                weight_used: 85,
                source: 'calculated' as const,
            }
            mockPost.mockResolvedValueOnce(targets as never)

            const result = await recalculate()

            expect(mockPost).toHaveBeenCalledWith(
                '/api/v1/nutrition-calc/recalculate',
                {}
            )
            expect(result).toEqual(targets)
        })

        it('returns nested targets when response wraps in targets field', async () => {
            const inner = {
                calories: 2200,
                protein: 160,
                fat: 75,
                carbs: 250,
                bmr: 1800,
                tdee: 2500,
                workout_bonus: 200,
                weight_used: 85,
                source: 'calculated' as const,
            }
            mockPost.mockResolvedValueOnce({ targets: inner } as never)

            const result = await recalculate()

            expect(result).toEqual(inner)
        })
    })

    describe('getClientHistory', () => {
        it('calls curator endpoint with clientId and default days', async () => {
            const response = { days: [] }
            mockGet.mockResolvedValueOnce(response as never)

            const result = await getClientHistory(42)

            expect(mockGet).toHaveBeenCalledWith(
                '/api/v1/curator/clients/42/targets/history?days=7'
            )
            expect(result).toEqual(response)
        })

        it('passes custom days parameter', async () => {
            mockGet.mockResolvedValueOnce({ days: [] } as never)

            await getClientHistory(42, 30)

            expect(mockGet).toHaveBeenCalledWith(
                '/api/v1/curator/clients/42/targets/history?days=30'
            )
        })
    })
})
