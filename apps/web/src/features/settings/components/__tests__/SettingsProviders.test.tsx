import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsProviders } from '../SettingsProviders'
import { providersApi } from '@/features/auth/api/providers'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('@/features/auth/api/providers', () => {
    const actual = jest.requireActual('@/features/auth/api/providers')
    return {
        ...actual,
        providersApi: {
            list: jest.fn(),
            startUrl: (provider: string) => `/api/v1/auth/oauth/${provider}`,
            linked: jest.fn(),
            unlink: jest.fn(),
        },
    }
})

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const api = providersApi as jest.Mocked<typeof providersApi>

function link(provider: string) {
    return { provider, email: `${provider}@example.com`, linked_at: '2026-03-01T00:00:00Z' }
}

describe('SettingsProviders', () => {
    beforeEach(() => jest.clearAllMocks())

    it('separates linked services from ones that can still be added', async () => {
        api.linked.mockResolvedValue({ linked: [link('yandex')], has_password: true })
        api.list.mockResolvedValue(['yandex', 'vk'])

        render(<SettingsProviders />)

        expect(await screen.findByText('Яндекс ID')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Отвязать' })).toBeEnabled()
        expect(screen.getByRole('link', { name: 'Привязать' })).toHaveAttribute(
            'href',
            '/api/v1/auth/oauth/vk'
        )
    })

    // Removing the only way in would cost the user a year of data in one click.
    it('refuses to unlink the last sign-in method and says why', async () => {
        api.linked.mockResolvedValue({ linked: [link('yandex')], has_password: false })
        api.list.mockResolvedValue(['yandex'])

        render(<SettingsProviders />)

        await waitFor(() => expect(screen.getByRole('button', { name: 'Отвязать' })).toBeDisabled())
        expect(screen.getByText(/Единственный способ входа/)).toBeInTheDocument()
    })

    it('allows unlinking once a password exists', async () => {
        api.linked.mockResolvedValue({ linked: [link('yandex')], has_password: true })
        api.list.mockResolvedValue(['yandex'])
        api.unlink.mockResolvedValue({ unlinked: true })

        render(<SettingsProviders />)
        await userEvent.click(await screen.findByRole('button', { name: 'Отвязать' }))

        await waitFor(() => expect(api.unlink).toHaveBeenCalledWith('yandex'))
        await waitFor(() => expect(screen.getByRole('link', { name: 'Привязать' })).toBeInTheDocument())
    })

    // The server keeps its own count; a refusal there must reach the user.
    it('reports the server’s refusal', async () => {
        api.linked.mockResolvedValue({
            linked: [link('yandex'), link('vk')],
            has_password: false,
        })
        api.list.mockResolvedValue(['yandex', 'vk'])
        api.unlink.mockRejectedValue(new ApiError(409, {}))
        const toast = (await import('react-hot-toast')).default

        render(<SettingsProviders />)
        await userEvent.click((await screen.findAllByRole('button', { name: 'Отвязать' }))[0])

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                'Это единственный способ входа. Сначала задайте пароль.'
            )
        )
    })

    it('says so when no service is available at all', async () => {
        api.linked.mockResolvedValue({ linked: [], has_password: true })
        api.list.mockResolvedValue([])

        render(<SettingsProviders />)

        expect(await screen.findByText(/сейчас недоступен/)).toBeInTheDocument()
    })
})
