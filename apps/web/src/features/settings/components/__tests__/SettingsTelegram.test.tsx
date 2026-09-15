import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsTelegram } from '../SettingsTelegram'
import { telegramApi } from '@/features/settings/api/telegram'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('@/features/settings/api/telegram', () => ({
    telegramApi: {
        status: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const api = telegramApi as jest.Mocked<typeof telegramApi>

beforeEach(() => {
    jest.clearAllMocks()
})

describe('SettingsTelegram', () => {
    it('показывает «не подключён», когда привязки нет', async () => {
        api.status.mockResolvedValue({ linked: false })

        render(<SettingsTelegram />)

        expect(await screen.findByText('Не подключён')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Подключить Telegram' })).toBeInTheDocument()
    })

    it('показывает подключение и имя, когда привязка есть', async () => {
        api.status.mockResolvedValue({ linked: true, username: 'ivanov' })

        render(<SettingsTelegram />)

        expect(await screen.findByText(/Подключён/)).toBeInTheDocument()
        expect(screen.getByText(/@ivanov/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Отключить' })).toBeInTheDocument()
    })

    // Возможность выключена — это «недоступно», а не молчаливая кнопка,
    // которая ничего не делает.
    it('сообщает о недоступности, когда бот не настроен', async () => {
        api.status.mockResolvedValue({ linked: false })
        api.connect.mockRejectedValue(new ApiError(503, 'feature_unavailable', 'нет бота'))
        const open = jest.fn()
        Object.defineProperty(window, 'open', { value: open, writable: true })

        render(<SettingsTelegram />)
        await userEvent.click(await screen.findByRole('button', { name: 'Подключить Telegram' }))

        await waitFor(() =>
            expect(screen.getByText('Подключение Telegram сейчас недоступно.')).toBeInTheDocument()
        )
        expect(open).not.toHaveBeenCalled()
    })

    it('открывает бота по выданной ссылке', async () => {
        api.status.mockResolvedValue({ linked: false })
        api.connect.mockResolvedValue({ url: 'https://t.me/bot?start=БИЛЕТ', expires_in: 900 })
        const open = jest.fn()
        Object.defineProperty(window, 'open', { value: open, writable: true })

        render(<SettingsTelegram />)
        await userEvent.click(await screen.findByRole('button', { name: 'Подключить Telegram' }))

        await waitFor(() =>
            expect(open).toHaveBeenCalledWith(
                'https://t.me/bot?start=БИЛЕТ',
                '_blank',
                'noopener,noreferrer'
            )
        )
    })

    it('отвязывает и возвращает состояние «не подключён»', async () => {
        api.status.mockResolvedValue({ linked: true, username: 'ivanov' })
        api.disconnect.mockResolvedValue({ linked: false })

        render(<SettingsTelegram />)
        await userEvent.click(await screen.findByRole('button', { name: 'Отключить' }))

        expect(await screen.findByText('Не подключён')).toBeInTheDocument()
    })
})
