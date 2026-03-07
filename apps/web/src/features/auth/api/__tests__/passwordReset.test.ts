import { requestPasswordReset, resetPassword, validateResetToken } from '../passwordReset'

describe('passwordReset API', () => {
    beforeEach(() => {
        global.fetch = jest.fn()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('requestPasswordReset', () => {
        it('sends POST request with email', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ message: 'Email sent' }),
            })

            const result = await requestPasswordReset('user@example.com')

            expect(global.fetch).toHaveBeenCalledWith(
                '/api/v1/auth/forgot-password',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'user@example.com' }),
                })
            )
            expect(result).toEqual({ message: 'Email sent' })
        })

        it('throws error on failure with server message', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ error: 'User not found' }),
            })

            await expect(requestPasswordReset('bad@example.com')).rejects.toThrow('User not found')
        })

        it('throws default error when no server message', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({}),
            })

            await expect(requestPasswordReset('test@example.com')).rejects.toThrow(
                'Failed to send reset email'
            )
        })
    })

    describe('resetPassword', () => {
        it('sends POST request with token and password', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({ success: true, message: 'Password reset' }),
            })

            const result = await resetPassword('reset-token-123', 'newPassword123')

            expect(global.fetch).toHaveBeenCalledWith(
                '/api/v1/auth/reset-password',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        token: 'reset-token-123',
                        password: 'newPassword123',
                    }),
                })
            )
            expect(result).toEqual({ success: true, message: 'Password reset' })
        })

        it('throws error on failure', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ error: 'Invalid token' }),
            })

            await expect(
                resetPassword('bad-token', 'password')
            ).rejects.toThrow('Invalid token')
        })

        it('throws default error when no server message', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({}),
            })

            await expect(
                resetPassword('token', 'pass')
            ).rejects.toThrow('Failed to reset password')
        })
    })

    describe('validateResetToken', () => {
        it('sends GET request with encoded token', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        valid: true,
                        expires_at: '2026-04-01T00:00:00Z',
                    }),
            })

            const result = await validateResetToken('my-token')

            expect(global.fetch).toHaveBeenCalledWith(
                '/api/v1/auth/validate-reset-token?token=my-token'
            )
            expect(result).toEqual({
                valid: true,
                expires_at: '2026-04-01T00:00:00Z',
            })
        })

        it('encodes special characters in token', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ valid: true, expires_at: '' }),
            })

            await validateResetToken('token with spaces & special=chars')

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('token%20with%20spaces')
            )
        })

        it('throws error on invalid token', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ error: 'Token expired' }),
            })

            await expect(validateResetToken('expired-token')).rejects.toThrow(
                'Token expired'
            )
        })

        it('throws default error when no server message', async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({}),
            })

            await expect(validateResetToken('token')).rejects.toThrow('Invalid token')
        })
    })
})
