import { render, screen, waitFor } from '@testing-library/react'
import { ProviderButtons } from '../ProviderButtons'
import { providersApi } from '@/features/auth/api/providers'

jest.mock('@/features/auth/api/providers', () => {
    const actual = jest.requireActual('@/features/auth/api/providers')
    return { ...actual, providersApi: { ...actual.providersApi, list: jest.fn() } }
})

const list = providersApi.list as jest.Mock

describe('ProviderButtons', () => {
    beforeEach(() => list.mockReset())

    it('shows nothing when the deployment has no provider credentials', async () => {
        list.mockResolvedValue([])
        const { container } = render(<ProviderButtons mode="login" />)
        await waitFor(() => expect(list).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })

    it('shows nothing when the list cannot be fetched', async () => {
        list.mockRejectedValue(new Error('offline'))
        const { container } = render(<ProviderButtons mode="login" />)
        await waitFor(() => expect(list).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })

    // The sign-in must stay a link, not a form submission.
    //
    // The Content-Security-Policy in src/middleware.ts sets form-action 'self',
    // so a <form> posting to a provider's domain would be blocked by the
    // browser — and blocked silently, with the button simply doing nothing.
    // A plain navigation is not restricted by any directive we set, which is
    // why this flow needs no provider domains in the policy.
    it('starts the flow with a navigation, which form-action does not block', async () => {
        list.mockResolvedValue(['yandex', 'vk'])
        const { container } = render(<ProviderButtons mode="login" />)

        const yandex = await screen.findByTestId('oauth-yandex')
        expect(yandex.tagName).toBe('A')
        expect(yandex).toHaveAttribute('href', '/api/v1/auth/oauth/yandex')
        expect(screen.getByTestId('oauth-vk')).toHaveAttribute('href', '/api/v1/auth/oauth/vk')

        expect(container.querySelector('form')).toBeNull()
        expect(container.querySelector('button')).toBeNull()
    })
})
