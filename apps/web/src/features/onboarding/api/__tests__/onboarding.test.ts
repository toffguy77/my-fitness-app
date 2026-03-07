import { apiClient } from '@/shared/utils/api-client'
import { completeOnboarding } from '../onboarding'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        put: jest.fn(),
    },
}))

const mockPut = apiClient.put as jest.MockedFunction<typeof apiClient.put>

describe('completeOnboarding', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockPut.mockResolvedValue(undefined as never)
    })

    it('calls PUT /api/v1/users/onboarding/complete with empty body', async () => {
        await completeOnboarding()

        expect(mockPut).toHaveBeenCalledWith(
            '/api/v1/users/onboarding/complete',
            {}
        )
        expect(mockPut).toHaveBeenCalledTimes(1)
    })

    it('propagates API errors', async () => {
        const error = new Error('Server error')
        mockPut.mockRejectedValueOnce(error)

        await expect(completeOnboarding()).rejects.toThrow('Server error')
    })
})
