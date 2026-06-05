import { requestPasswordReset, resetPassword, validateResetToken } from '../passwordReset'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        post: jest.fn(),
        get: jest.fn(),
    },
}))

import { apiClient } from '@/shared/utils/api-client'

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('passwordReset API', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('requestPasswordReset', () => {
        it('sends POST request with email to forgot-password endpoint', async () => {
            mockApiClient.post.mockResolvedValueOnce({ message: 'Email sent' })

            const result = await requestPasswordReset('user@example.com')

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/auth/forgot-password',
                { email: 'user@example.com' }
            )
            expect(result).toEqual({ message: 'Email sent' })
        })

        it('throws error on failure', async () => {
            mockApiClient.post.mockRejectedValueOnce(new Error('User not found'))

            await expect(requestPasswordReset('bad@example.com')).rejects.toThrow('User not found')
        })
    })

    describe('resetPassword', () => {
        it('sends POST request with token and password to reset-password endpoint', async () => {
            mockApiClient.post.mockResolvedValueOnce({ success: true, message: 'Password reset' })

            const result = await resetPassword('reset-token-123', 'newPassword123')

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/auth/reset-password',
                { token: 'reset-token-123', password: 'newPassword123' }
            )
            expect(result).toEqual({ success: true, message: 'Password reset' })
        })

        it('throws error on failure', async () => {
            mockApiClient.post.mockRejectedValueOnce(new Error('Invalid token'))

            await expect(
                resetPassword('bad-token', 'password')
            ).rejects.toThrow('Invalid token')
        })
    })

    describe('validateResetToken', () => {
        it('sends GET request with encoded token to validate-reset-token endpoint', async () => {
            mockApiClient.get.mockResolvedValueOnce({
                valid: true,
                expires_at: '2026-04-01T00:00:00Z',
            })

            const result = await validateResetToken('my-token')

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/api/v1/auth/validate-reset-token?token=my-token'
            )
            expect(result).toEqual({
                valid: true,
                expires_at: '2026-04-01T00:00:00Z',
            })
        })

        it('encodes special characters in token', async () => {
            mockApiClient.get.mockResolvedValueOnce({ valid: true, expires_at: '' })

            await validateResetToken('token with spaces & special=chars')

            expect(mockApiClient.get).toHaveBeenCalledWith(
                expect.stringContaining('token%20with%20spaces')
            )
        })

        it('throws error on invalid token', async () => {
            mockApiClient.get.mockRejectedValueOnce(new Error('Token expired'))

            await expect(validateResetToken('expired-token')).rejects.toThrow('Token expired')
        })
    })
})
