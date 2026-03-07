import { verifyEmail, resendVerificationCode } from '../verification'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        post: jest.fn(),
    },
}))

import { apiClient } from '@/shared/utils/api-client'

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('verification API', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('verifyEmail', () => {
        it('calls apiClient.post with correct endpoint and code', async () => {
            mockApiClient.post.mockResolvedValue(undefined)

            await verifyEmail('123456')

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/auth/verify-email',
                { code: '123456' }
            )
        })

        it('propagates errors from apiClient', async () => {
            mockApiClient.post.mockRejectedValue(new Error('Invalid code'))

            await expect(verifyEmail('000000')).rejects.toThrow('Invalid code')
        })
    })

    describe('resendVerificationCode', () => {
        it('calls apiClient.post with correct endpoint', async () => {
            mockApiClient.post.mockResolvedValue(undefined)

            await resendVerificationCode()

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/auth/resend-verification',
                {}
            )
        })

        it('propagates errors from apiClient', async () => {
            mockApiClient.post.mockRejectedValue(new Error('Too many requests'))

            await expect(resendVerificationCode()).rejects.toThrow('Too many requests')
        })
    })
})
