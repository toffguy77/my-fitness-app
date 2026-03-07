import { curatorApi } from '../curatorApi'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        put: jest.fn(),
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
})
