import { magicLinkApi } from '../magicLink'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        post: jest.fn(),
    },
}))

import { apiClient } from '@/shared/utils/api-client'

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('magicLinkApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('request', () => {
        it('sends email and consents to the request endpoint', async () => {
            mockApiClient.post.mockResolvedValueOnce(undefined)

            await magicLinkApi.request('user@example.com', {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            })

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/auth/magic-link/request',
                {
                    email: 'user@example.com',
                    consents: {
                        terms_of_service: true,
                        privacy_policy: true,
                        data_processing: true,
                        marketing: false,
                    },
                }
            )
        })

        it('propagates a failed request instead of swallowing it', async () => {
            mockApiClient.post.mockRejectedValueOnce(new Error('nope'))

            await expect(
                magicLinkApi.request('user@example.com', {
                    terms_of_service: true,
                    privacy_policy: true,
                    data_processing: true,
                    marketing: false,
                })
            ).rejects.toThrow('nope')
        })
    })

    describe('consume', () => {
        // The backend answers {user, created} with no token in the body — the
        // session travels in the refresh cookie, same as the rest of sign-in.
        // The page that redeems the link (task 8) needs `user` to say whose
        // account it just entered, so it must not be dropped on the way out.
        it('returns both user and created from the server response', async () => {
            const user = {
                id: '42',
                email: 'user@example.com',
                role: 'client' as const,
                created_at: '2026-09-19T00:00:00Z',
                email_verified: true,
                onboarding_completed: false,
            }
            mockApiClient.post.mockResolvedValueOnce({ user, created: true })

            const result = await magicLinkApi.consume('plain-token', 'lead-token')

            expect(result).toEqual({ user, created: true })
        })

        it('sends the token and lead token to the consume endpoint', async () => {
            mockApiClient.post.mockResolvedValueOnce({
                user: { id: '1', email: 'a@example.com', role: 'client', created_at: '', email_verified: true, onboarding_completed: true },
                created: false,
            })

            await magicLinkApi.consume('plain-token', 'lead-token')

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/auth/magic-link/consume',
                { token: 'plain-token', lead_token: 'lead-token' }
            )
        })

        it('omits lead_token from the body when there is no lead to claim', async () => {
            mockApiClient.post.mockResolvedValueOnce({
                user: { id: '1', email: 'a@example.com', role: 'client', created_at: '', email_verified: true, onboarding_completed: true },
                created: false,
            })

            await magicLinkApi.consume('plain-token', null)

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/api/v1/auth/magic-link/consume',
                { token: 'plain-token', lead_token: undefined }
            )
        })

        it('defaults created to false when the server omits it', async () => {
            const user = { id: '1', email: 'a@example.com', role: 'client' as const, created_at: '', email_verified: true, onboarding_completed: true }
            mockApiClient.post.mockResolvedValueOnce({ user })

            const result = await magicLinkApi.consume('plain-token', null)

            expect(result).toEqual({ user, created: false })
        })

        // A 204, a truncated proxy response, or any other empty body on a
        // 200 OK is not an HTTP error status — apiClient does not throw for
        // it, so consume() has to guard for itself. Without the guard the
        // next line (`data.user`) throws a bare TypeError and the redeem
        // page (task 8) would show a blank screen instead of "Ссылка не
        // подходит — запросите новую".
        it('throws a clear error instead of crashing when the body is empty', async () => {
            mockApiClient.post.mockResolvedValueOnce(undefined)

            await expect(magicLinkApi.consume('plain-token', null)).rejects.toThrow(
                /пуст|не содержит пользователя/
            )
        })

        it('throws a clear error when the body has no user', async () => {
            mockApiClient.post.mockResolvedValueOnce({ created: true })

            await expect(magicLinkApi.consume('plain-token', null)).rejects.toThrow(
                /пуст|не содержит пользователя/
            )
        })
    })
})
