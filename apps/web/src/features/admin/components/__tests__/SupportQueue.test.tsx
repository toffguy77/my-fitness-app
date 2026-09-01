import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SupportQueue } from '../SupportQueue'
import { adminApi, type SupportConversation, type SupportThread } from '../../api/adminApi'

jest.mock('../../api/adminApi', () => ({
    adminApi: {
        getSupportConversations: jest.fn(),
        getSupportThread: jest.fn(),
        replyToSupport: jest.fn(),
        closeSupport: jest.fn(),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const api = adminApi as jest.Mocked<typeof adminApi>

function conversation(overrides: Partial<SupportConversation> = {}): SupportConversation {
    return {
        id: 'conv-1',
        chat_id: 555,
        status: 'escalated',
        telegram_name: 'Гость',
        escalation_reason: 'ответа нет в документации',
        last_message_at: '2026-03-01T10:00:00Z',
        created_at: '2026-03-01T09:00:00Z',
        ...overrides,
    }
}

function thread(overrides: Partial<SupportThread> = {}): SupportThread {
    return {
        conversation: conversation(),
        messages: [
            { id: 'm1', author: 'user', text: 'сколько стоит куратор?', created_at: '' },
            { id: 'm2', author: 'bot', text: 'Не нашёл ответа в документации', created_at: '' },
        ],
        ...overrides,
    }
}

function listReturns(conversations: SupportConversation[]) {
    ;(api.getSupportConversations as jest.Mock).mockResolvedValue({
        items: conversations,
        total: conversations.length,
        limit: 20,
        offset: 0,
    })
}

describe('SupportQueue', () => {
    beforeEach(() => jest.clearAllMocks())

    // The bot refusing to invent an answer is only a good trade if somebody
    // reads what it refused, so a waiting chat has to be visibly waiting.
    it('marks a conversation waiting for a person and says why', async () => {
        listReturns([conversation()])

        render(<SupportQueue />)

        expect(await screen.findByText('Ждёт ответа')).toBeInTheDocument()
        expect(screen.getByText(/ответа нет в документации/)).toBeInTheDocument()
    })

    it('shows the conversation with who said what', async () => {
        listReturns([conversation()])
        ;(api.getSupportThread as jest.Mock).mockResolvedValue(thread())

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))

        expect(await screen.findByText('сколько стоит куратор?')).toBeInTheDocument()
        expect(screen.getByText('Пользователь')).toBeInTheDocument()
        expect(screen.getByText('Бот')).toBeInTheDocument()
    })

    // Where they got stuck is the reason to open this screen rather than
    // asking the person to explain themselves again.
    it('shows what the person was doing when they got stuck', async () => {
        listReturns([conversation()])
        ;(api.getSupportThread as jest.Mock).mockResolvedValue(
            thread({
                lead: {
                    id: 'lead-1',
                    email: 'guest@example.com',
                    last_step: 'registration',
                    summary: 'цель: loss, расчёт: 1800 ккал',
                },
            })
        )

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))

        expect(await screen.findByText('guest@example.com')).toBeInTheDocument()
        expect(screen.getByText(/форма регистрации/)).toBeInTheDocument()
        expect(screen.getByText(/1800 ккал/)).toBeInTheDocument()
    })

    it('sends an answer back to the same chat', async () => {
        listReturns([conversation()])
        ;(api.getSupportThread as jest.Mock).mockResolvedValue(thread())
        ;(api.replyToSupport as jest.Mock).mockResolvedValue({ sent: true })

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))
        await userEvent.type(await screen.findByLabelText('Ответ'), 'Куратор входит в подписку')
        await userEvent.click(screen.getByRole('button', { name: 'Отправить в Telegram' }))

        await waitFor(() =>
            expect(api.replyToSupport).toHaveBeenCalledWith('conv-1', 'Куратор входит в подписку')
        )
    })

    it('will not send an empty answer', async () => {
        listReturns([conversation()])
        ;(api.getSupportThread as jest.Mock).mockResolvedValue(thread())

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))

        expect(await screen.findByRole('button', { name: 'Отправить в Telegram' })).toBeDisabled()
    })

    it('closes a conversation once it has been dealt with', async () => {
        listReturns([conversation()])
        ;(api.getSupportThread as jest.Mock).mockResolvedValue(thread())
        ;(api.closeSupport as jest.Mock).mockResolvedValue({ closed: true })

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))
        await userEvent.click(await screen.findByRole('button', { name: 'Закрыть обращение' }))

        await waitFor(() => expect(api.closeSupport).toHaveBeenCalledWith('conv-1'))
    })

    it('says so when there is nothing waiting', async () => {
        listReturns([])

        render(<SupportQueue />)

        expect(await screen.findByText('Обращений пока нет')).toBeInTheDocument()
    })
})
