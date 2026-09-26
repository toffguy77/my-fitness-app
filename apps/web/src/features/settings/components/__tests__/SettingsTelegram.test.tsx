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
        groupInvite: jest.fn(),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const api = telegramApi as jest.Mocked<typeof telegramApi>

beforeEach(() => {
    jest.clearAllMocks()
    // По умолчанию приглашения нет: оно положено кураторам и только при
    // настроенной группе. Тесты, которым оно нужно, говорят об этом сами.
    api.groupInvite.mockRejectedValue(new ApiError(503, {}))
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

describe('SettingsTelegram: ссылка в рабочую группу', () => {
    // Обработчик существует ровно для них: боту некуда им написать — он не
    // пишет первым, — и увидеть ссылку больше негде. В профиле её не было:
    // поиск `curator-group` по фронтенду не находил ничего.
    it('показывает ссылку тому, у кого Telegram не привязан', async () => {
        api.status.mockResolvedValue({ linked: false })
        api.groupInvite.mockResolvedValue({ invite_link: 'https://t.me/+abc' })

        render(<SettingsTelegram />)

        const link = await screen.findByRole('link', { name: 'Войти в рабочую группу' })
        expect(link).toHaveAttribute('href', 'https://t.me/+abc')
    })

    it('не показывает ссылку и не спрашивает её, когда Telegram привязан', async () => {
        api.status.mockResolvedValue({ linked: true, username: 'ivanov' })

        render(<SettingsTelegram />)
        await screen.findByText(/Подключён/)

        expect(api.groupInvite).not.toHaveBeenCalled()
        expect(screen.queryByRole('link', { name: 'Войти в рабочую группу' })).not.toBeInTheDocument()
    })

    // Группа не настроена в окружении или приглашение не положено — обработчик
    // отвечает 503 в обоих случаях. Показывать нечего, и раздел не ломается.
    it('переживает выключенную способность', async () => {
        api.status.mockResolvedValue({ linked: false })

        render(<SettingsTelegram />)
        await screen.findByText('Не подключён')

        await waitFor(() => expect(api.groupInvite).toHaveBeenCalled())
        expect(screen.queryByRole('link', { name: 'Войти в рабочую группу' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Подключить Telegram' })).toBeInTheDocument()
    })
})
