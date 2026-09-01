import { providersApi, providerLabel, needsLinkConfirmation } from '../api/providers'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}))

const client = apiClient as jest.Mocked<typeof apiClient>

describe('The providers API', () => {
    beforeEach(() => jest.clearAllMocks())

    // A screen must never show a bare slug to somebody choosing how to sign in.
    it('names providers in words', () => {
        expect(providerLabel('yandex')).toBe('Яндекс ID')
        expect(providerLabel('vk')).toBe('VK ID')
        // An unknown provider still renders as something rather than nothing.
        expect(providerLabel('newcomer')).toBe('newcomer')
    })

    it('returns an empty list when the server names no providers', async () => {
        ;(client.get as jest.Mock).mockResolvedValue({})

        await expect(providersApi.list()).resolves.toEqual([])
    })

    it('lists what the server offers', async () => {
        ;(client.get as jest.Mock).mockResolvedValue({ providers: ['yandex', 'vk'] })

        await expect(providersApi.list()).resolves.toEqual(['yandex', 'vk'])
    })

    // A full navigation, not a fetch: the flow continues at the provider.
    it('points at the start of the flow', () => {
        expect(providersApi.startUrl('yandex')).toBe('/api/v1/auth/oauth/yandex')
    })

    it('completes a session from the callback cookie', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ token: 'access' })

        await providersApi.complete()

        expect(client.post).toHaveBeenCalledWith('/api/v1/auth/refresh', {})
    })

    it('sends the password that claims an account', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ token: 'access' })

        await providersApi.confirmLink('correct horse')

        expect(client.post).toHaveBeenCalledWith('/api/v1/auth/oauth/link', {
            password: 'correct horse',
        })
    })

    it('sends the address a provider did not give', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ token: 'access' })

        await providersApi.completeWithEmail('user@example.com')

        expect(client.post).toHaveBeenCalledWith('/api/v1/auth/oauth/email', {
            email: 'user@example.com',
        })
    })

    it('reads and removes links', async () => {
        ;(client.get as jest.Mock).mockResolvedValue({ linked: [], has_password: true })
        ;(client.delete as jest.Mock).mockResolvedValue({ unlinked: true })

        await providersApi.linked()
        await providersApi.unlink('yandex')

        expect(client.get).toHaveBeenCalledWith('/api/v1/auth/providers/linked')
        expect(client.delete).toHaveBeenCalledWith('/api/v1/auth/providers/yandex')
    })

    // The two shapes this endpoint can return decide whether somebody is signed
    // in or asked for a password, so telling them apart cannot be guesswork.
    it('tells a session apart from a demand for proof', () => {
        expect(
            needsLinkConfirmation({ result: 'needs_link_confirmation', email: 'a@b.c' })
        ).toBe(true)
        expect(
            needsLinkConfirmation({
                user: { id: '1' },
                token: 'access',
                refresh_token: 'refresh',
            } as never)
        ).toBe(false)
    })
})
