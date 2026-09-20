import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from '@testing-library/react'
import { SupportWidget } from '../SupportWidget'
import { useWidgetStore } from '../../store/widgetStore'
import { widgetApi, widgetToken } from '../../api/widget'
import { ApiError } from '@/shared/errors/apiErrors'

// widgetErrorMessage is deliberately NOT mocked: several tests here exist to
// pin that the widget shows the server's own sentence, not a generic one —
// mocking the function away would hide exactly the regression they guard.
jest.mock('../../api/widget', () => {
    const actual = jest.requireActual('../../api/widget')
    return {
        ...actual,
        widgetApi: {
            start: jest.fn(),
            send: jest.fn(),
            messages: jest.fn(),
            human: jest.fn(),
            contact: jest.fn(),
        },
        widgetToken: jest.fn(),
    }
})

const api = widgetApi as jest.Mocked<typeof widgetApi>
const tokenMock = widgetToken as jest.Mock

function resetStore() {
    act(() => {
        useWidgetStore.setState({
            open: false,
            token: null,
            messages: [],
            status: null,
            sending: false,
            error: null,
        })
    })
}

/** Opens the widget and sends one question — the shared setup for scenarios
 * that only start after the first message. */
async function openAndAsk(text: string) {
    await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))
    const input = await screen.findByRole('textbox', { name: /вопрос/i })
    await userEvent.type(input, text)
    await userEvent.click(screen.getByRole('button', { name: /отправить/i }))
}

describe('SupportWidget', () => {
    const originalBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT

    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
        tokenMock.mockReturnValue(null)
        resetStore()
    })

    afterEach(() => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = originalBot
    })

    it('отвечает на вопрос без аккаунта', async () => {
        api.start.mockResolvedValue({ token: 'tok-1', conversationId: 'c-1' })
        api.send.mockResolvedValue(undefined)
        api.messages.mockResolvedValue({
            status: 'open',
            messages: [
                { id: 'm-1', author: 'user', text: 'что даст регистрация?', created_at: '2026-09-20T10:00:00Z' },
                {
                    id: 'm-2',
                    author: 'bot',
                    text: 'Регистрация сохраняет дневник питания и открывает куратора.',
                    created_at: '2026-09-20T10:00:05Z',
                },
            ],
        })

        render(<SupportWidget />)
        await openAndAsk('что даст регистрация?')

        expect(await screen.findByText(/дневник/i)).toBeInTheDocument()
    })

    it('не предлагает оставить контакт до первого вопроса', async () => {
        api.start.mockResolvedValue({ token: 'tok-2', conversationId: 'c-2' })

        render(<SupportWidget />)
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))
        await screen.findByRole('textbox', { name: /вопрос/i })

        expect(screen.queryByLabelText(/почт/i)).not.toBeInTheDocument()
    })

    it('предлагает оставить контакт, когда разговор ушёл к человеку', async () => {
        api.start.mockResolvedValue({ token: 'tok-3', conversationId: 'c-3' })
        api.send.mockResolvedValue(undefined)
        api.messages.mockResolvedValue({ status: 'escalated', messages: [] })

        render(<SupportWidget />)
        await openAndAsk('вопрос')

        expect(await screen.findByLabelText(/почт/i)).toBeInTheDocument()
    })

    it('не предлагает Telegram, когда бот не настроен', async () => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = ''
        api.start.mockResolvedValue({ token: 'tok-4', conversationId: 'c-4' })

        render(<SupportWidget />)
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))
        await screen.findByRole('textbox', { name: /вопрос/i })

        expect(screen.queryByTestId('support-link')).not.toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: /вопрос/i })).toBeInTheDocument()
    })

    it('предлагает Telegram, когда бот настроен', async () => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = 'burcev_support_bot'
        api.start.mockResolvedValue({ token: 'tok-4b', conversationId: 'c-4b' })

        render(<SupportWidget />)
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))

        expect(await screen.findByTestId('support-link')).toBeInTheDocument()
    })

    // Mutation guard: preferring a generic phrase over the server's own
    // sentence (widgetErrorMessage) must turn this test red on the text.
    it('показывает причину отказа сервера, а не общую фразу', async () => {
        api.start.mockResolvedValue({ token: 'tok-5', conversationId: 'c-5' })
        api.send.mockRejectedValue(
            new ApiError(429, {
                status: 'error',
                code: 'rate_limited',
                message: 'В этом чате слишком много сообщений — позовите человека',
            })
        )

        render(<SupportWidget />)
        await openAndAsk('ещё один вопрос')

        expect(
            await screen.findByText('В этом чате слишком много сообщений — позовите человека')
        ).toBeInTheDocument()
        expect(screen.queryByText('Слишком много запросов. Подождите немного и попробуйте снова.')).not.toBeInTheDocument()
    })

    // Mutation guard: a stub returning an empty transcript must not satisfy a
    // test that checks actual message content.
    it('показывает настоящую переписку, а не пустой список', async () => {
        api.start.mockResolvedValue({ token: 'tok-6', conversationId: 'c-6' })
        api.send.mockResolvedValue(undefined)
        api.messages.mockResolvedValue({
            status: 'open',
            messages: [
                { id: 'm-1', author: 'user', text: 'Как удалить аккаунт?', created_at: '2026-09-20T10:00:00Z' },
                { id: 'm-2', author: 'bot', text: 'Через настройки профиля.', created_at: '2026-09-20T10:00:05Z' },
            ],
        })

        render(<SupportWidget />)
        await openAndAsk('Как удалить аккаунт?')

        expect(await screen.findByText('Через настройки профиля.')).toBeInTheDocument()
        expect(screen.getByText('Как удалить аккаунт?')).toBeInTheDocument()
    })

    // Mutation guard: reopening must continue the conversation already under
    // way (widgetStore.openWidget's job) rather than the component quietly
    // starting a fresh one on every mount/open.
    it('переиспользует разговор при повторном открытии', async () => {
        api.start.mockResolvedValue({ token: 'tok-7', conversationId: 'c-7' })
        api.messages.mockResolvedValue({ status: 'open', messages: [] })

        render(<SupportWidget />)
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))
        await screen.findByRole('textbox', { name: /вопрос/i })

        expect(api.start).toHaveBeenCalledTimes(1)

        // Simulate the token the real client would have persisted to
        // localStorage on start(), since widgetApi is mocked here.
        tokenMock.mockReturnValue('tok-7')

        await userEvent.click(screen.getByRole('button', { name: /закрыть чат/i }))
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))
        await screen.findByRole('textbox', { name: /вопрос/i })

        expect(api.start).toHaveBeenCalledTimes(1)
        expect(api.messages).toHaveBeenCalledWith('tok-7')
    })

    it('зовёт человека по явному действию', async () => {
        api.start.mockResolvedValue({ token: 'tok-8', conversationId: 'c-8' })
        api.human.mockResolvedValue(undefined)
        api.messages.mockResolvedValue({ status: 'escalated', messages: [] })

        render(<SupportWidget />)
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))
        await screen.findByRole('textbox', { name: /вопрос/i })
        await userEvent.click(screen.getByRole('button', { name: /позвать человека/i }))

        await waitFor(() => expect(api.human).toHaveBeenCalledWith('tok-8'))
    })

    it('сохраняет контакт из формы и показывает подтверждение', async () => {
        api.start.mockResolvedValue({ token: 'tok-9', conversationId: 'c-9' })
        api.send.mockResolvedValue(undefined)
        api.messages.mockResolvedValue({ status: 'escalated', messages: [] })
        api.contact.mockResolvedValue({ token: 'lead-tok-9' })

        render(<SupportWidget />)
        await openAndAsk('вопрос про оплату')

        const emailInput = await screen.findByLabelText(/почт/i)
        await userEvent.type(emailInput, 'visitor@example.com')
        await userEvent.click(screen.getByLabelText(/обработку введённых данных/i))
        await userEvent.click(screen.getByRole('button', { name: /сохранить контакт/i }))

        await waitFor(() =>
            expect(api.contact).toHaveBeenCalledWith(
                'tok-9',
                'visitor@example.com',
                { data_processing: true, contact: false }
            )
        )
        expect(await screen.findByText(/контакт сохранён/i)).toBeInTheDocument()
    })

    it('не отправляет контакт без согласия на обработку данных', async () => {
        api.start.mockResolvedValue({ token: 'tok-10', conversationId: 'c-10' })
        api.send.mockResolvedValue(undefined)
        api.messages.mockResolvedValue({ status: 'escalated', messages: [] })

        render(<SupportWidget />)
        await openAndAsk('вопрос')

        const emailInput = await screen.findByLabelText(/почт/i)
        await userEvent.type(emailInput, 'visitor@example.com')

        expect(screen.getByRole('button', { name: /сохранить контакт/i })).toBeDisabled()
        expect(api.contact).not.toHaveBeenCalled()
    })
})
