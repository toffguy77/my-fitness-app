import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProviderButtons } from '../components/ProviderButtons'
import { OAuthCompleteScreen } from '../components/OAuthCompleteScreen'
import { OAuthLinkScreen } from '../components/OAuthLinkScreen'
import { OAuthEmailScreen } from '../components/OAuthEmailScreen'
import { providersApi } from '../api/providers'
import { ApiError } from '@/shared/errors/apiErrors'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('../api/providers', () => {
    const actual = jest.requireActual('../api/providers')
    return {
        ...actual,
        providersApi: {
            list: jest.fn(),
            startUrl: (provider: string) => `/api/v1/auth/oauth/${provider}`,
            complete: jest.fn(),
            confirmLink: jest.fn(),
            completeWithEmail: jest.fn(),
            linked: jest.fn(),
            unlink: jest.fn(),
        },
    }
})

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { setToken: jest.fn(), post: jest.fn(), get: jest.fn(), delete: jest.fn() },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const replace = jest.fn()
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: jest.fn() }),
    useSearchParams: () => searchParams,
}))

const api = providersApi as jest.Mocked<typeof providersApi>

const session = {
    user: {
        id: '1',
        email: 'user@example.com',
        role: 'client' as const,
        created_at: '',
        email_verified: true,
        onboarding_completed: true,
    },
    token: 'access',
    refresh_token: 'refresh',
}

beforeEach(() => {
    jest.clearAllMocks()
    searchParams = new URLSearchParams()
    localStorage.clear()
})

describe('Provider buttons', () => {
    // A button that cannot work is worse than no button: it looks like the app
    // is broken rather than like the option was never offered.
    it('offers only the providers this deployment configured', async () => {
        api.list.mockResolvedValue(['yandex'])

        render(<ProviderButtons mode="login" />)

        expect(await screen.findByText('Яндекс ID')).toBeInTheDocument()
        expect(screen.queryByText('VK ID')).not.toBeInTheDocument()
    })

    it('shows nothing at all when none are configured', async () => {
        api.list.mockResolvedValue([])

        const { container } = render(<ProviderButtons mode="login" />)

        await waitFor(() => expect(api.list).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })

    it('leaves for the provider with a full navigation', async () => {
        api.list.mockResolvedValue(['yandex'])

        render(<ProviderButtons mode="login" />)

        const link = await screen.findByTestId('oauth-yandex')
        expect(link).toHaveAttribute('href', '/api/v1/auth/oauth/yandex')
    })
})

describe('Completing an external sign-in', () => {
    it('exchanges the callback cookie for a session exactly once', async () => {
        api.complete.mockResolvedValue(session)

        render(<OAuthCompleteScreen />)

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
        expect(api.complete).toHaveBeenCalledTimes(1)
        expect(apiClient.setToken).toHaveBeenCalledWith('access')
    })

    it('sends an unverified account to the verification screen', async () => {
        api.complete.mockResolvedValue({
            ...session,
            user: { ...session.user, email_verified: false },
        })

        render(<OAuthCompleteScreen />)

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/verify-email'))
    })

    // A stale attempt must say so rather than spinning forever.
    it('offers a way back when the attempt has expired', async () => {
        api.complete.mockRejectedValue(new ApiError(401, {}))

        render(<OAuthCompleteScreen />)

        expect(await screen.findByText('Не удалось завершить вход')).toBeInTheDocument()
    })
})

describe('Claiming an existing account', () => {
    beforeEach(() => {
        searchParams = new URLSearchParams({ provider: 'yandex', email: 'user@example.com' })
    })

    it('names the account being claimed', () => {
        render(<OAuthLinkScreen />)

        expect(screen.getByText('user@example.com')).toBeInTheDocument()
        expect(screen.getByText(/Яндекс ID/)).toBeInTheDocument()
    })

    it('links and signs in on the right password', async () => {
        api.confirmLink.mockResolvedValue(session)

        render(<OAuthLinkScreen />)
        await userEvent.type(screen.getByLabelText('Пароль'), 'correct horse')
        await userEvent.click(screen.getByRole('button', { name: 'Привязать и войти' }))

        await waitFor(() => expect(api.confirmLink).toHaveBeenCalledWith('correct horse'))
        expect(replace).toHaveBeenCalledWith('/dashboard')
    })

    it('reports a wrong password rather than a generic failure', async () => {
        api.confirmLink.mockRejectedValue(new ApiError(401, {}))
        const toast = (await import('react-hot-toast')).default

        render(<OAuthLinkScreen />)
        await userEvent.type(screen.getByLabelText('Пароль'), 'guess')
        await userEvent.click(screen.getByRole('button', { name: 'Привязать и войти' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Неверный пароль'))
        expect(replace).not.toHaveBeenCalled()
    })

    it('cannot be submitted empty', () => {
        render(<OAuthLinkScreen />)

        expect(screen.getByRole('button', { name: 'Привязать и войти' })).toBeDisabled()
    })
})

describe('Supplying a missing address', () => {
    beforeEach(() => {
        searchParams = new URLSearchParams({ provider: 'vk' })
    })

    it('signs in when the address is new', async () => {
        api.completeWithEmail.mockResolvedValue(session)

        render(<OAuthEmailScreen />)
        await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
        await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }))

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    })

    // Typing somebody else's address must not hand over their account.
    it('asks for the password when the address already has an account', async () => {
        api.completeWithEmail.mockResolvedValue({
            result: 'needs_link_confirmation',
            email: 'taken@example.com',
        })

        render(<OAuthEmailScreen />)
        await userEvent.type(screen.getByLabelText('Email'), 'taken@example.com')
        await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }))

        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith(
                '/auth/link?provider=vk&email=taken%40example.com'
            )
        )
    })
})
