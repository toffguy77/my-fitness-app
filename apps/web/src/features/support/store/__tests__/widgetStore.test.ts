import { act } from '@testing-library/react'
import { useWidgetStore } from '../widgetStore'
import { widgetApi, widgetToken, widgetErrorMessage } from '../../api/widget'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('../../api/widget', () => ({
    widgetApi: {
        start: jest.fn(),
        send: jest.fn(),
        messages: jest.fn(),
        human: jest.fn(),
        contact: jest.fn(),
    },
    widgetToken: jest.fn(),
    widgetErrorMessage: jest.fn((err: unknown) => (err instanceof Error ? err.message : 'ошибка')),
}))

const api = widgetApi as jest.Mocked<typeof widgetApi>
const tokenMock = widgetToken as jest.Mock
const errorMessageMock = widgetErrorMessage as jest.Mock

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

describe('useWidgetStore', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        errorMessageMock.mockImplementation((err: unknown) => (err instanceof Error ? err.message : 'ошибка'))
        resetStore()
    })

    describe('openWidget', () => {
        it('заводит новый разговор, если сохранённого токена нет', async () => {
            tokenMock.mockReturnValue(null)
            api.start.mockResolvedValue({ token: 'new-token', conversationId: 'c-1' })

            await act(async () => {
                await useWidgetStore.getState().openWidget()
            })

            expect(api.start).toHaveBeenCalledTimes(1)
            expect(useWidgetStore.getState().open).toBe(true)
            expect(useWidgetStore.getState().token).toBe('new-token')
        })

        // The mutation this guards against: an implementation that always
        // calls widgetApi.start() regardless of a stored token would give
        // every reopen a brand-new conversation, losing the transcript.
        it('переиспользует сохранённый токен вместо нового разговора', async () => {
            tokenMock.mockReturnValue('existing-token')
            api.messages.mockResolvedValue({
                messages: [{ id: 'm-1', author: 'user', text: 'Привет', created_at: '2026-09-20T10:00:00Z' }],
                status: 'open',
            })

            await act(async () => {
                await useWidgetStore.getState().openWidget()
            })

            expect(api.start).not.toHaveBeenCalled()
            expect(api.messages).toHaveBeenCalledWith('existing-token')
            expect(useWidgetStore.getState().token).toBe('existing-token')
        })

        it('не перечитывает хранилище, если токен уже есть в памяти', async () => {
            act(() => {
                useWidgetStore.setState({ token: 'in-memory-token' })
            })
            api.messages.mockResolvedValue({ messages: [], status: 'open' })

            await act(async () => {
                await useWidgetStore.getState().openWidget()
            })

            expect(tokenMock).not.toHaveBeenCalled()
            expect(api.start).not.toHaveBeenCalled()
        })

        it('показывает причину отказа, если разговор не удалось завести', async () => {
            tokenMock.mockReturnValue(null)
            const error = new ApiError(500, { message: 'Не удалось открыть чат' })
            api.start.mockRejectedValue(error)
            errorMessageMock.mockReturnValue('Не удалось открыть чат')

            await act(async () => {
                await useWidgetStore.getState().openWidget()
            })

            expect(useWidgetStore.getState().error).toBe('Не удалось открыть чат')
            expect(useWidgetStore.getState().token).toBeNull()
        })
    })

    describe('refreshMessages', () => {
        it('ничего не делает без токена', async () => {
            await act(async () => {
                await useWidgetStore.getState().refreshMessages()
            })

            expect(api.messages).not.toHaveBeenCalled()
        })

        // Content, not shape: a stub returning an empty transcript would pass
        // a test that only checked the array existed or had a length field.
        it('записывает настоящую переписку, а не пустой список', async () => {
            act(() => {
                useWidgetStore.setState({ token: 't-1' })
            })
            const transcript = [
                { id: 'm-1', author: 'user', text: 'Как отменить подписку?', created_at: '2026-09-20T10:00:00Z' },
                { id: 'm-2', author: 'bot', text: 'В настройках профиля.', created_at: '2026-09-20T10:00:05Z' },
            ]
            api.messages.mockResolvedValue({ messages: transcript, status: 'open' })

            await act(async () => {
                await useWidgetStore.getState().refreshMessages()
            })

            const state = useWidgetStore.getState()
            expect(state.messages).toHaveLength(2)
            expect(state.messages).toEqual(transcript)
            expect(state.messages[1].text).toBe('В настройках профиля.')
            expect(state.status).toBe('open')
        })

        it('показывает причину отказа при неудачной загрузке', async () => {
            act(() => {
                useWidgetStore.setState({ token: 't-1' })
            })
            const error = new ApiError(404, { message: 'Чат не найден — откройте его заново' })
            api.messages.mockRejectedValue(error)
            errorMessageMock.mockReturnValue('Чат не найден — откройте его заново')

            await act(async () => {
                await useWidgetStore.getState().refreshMessages()
            })

            expect(useWidgetStore.getState().error).toBe('Чат не найден — откройте его заново')
        })
    })

    describe('sendMessage', () => {
        beforeEach(() => {
            act(() => {
                useWidgetStore.setState({ token: 't-1' })
            })
        })

        it('ничего не делает без токена', async () => {
            act(() => {
                useWidgetStore.setState({ token: null })
            })

            await act(async () => {
                await useWidgetStore.getState().sendMessage('Привет')
            })

            expect(api.send).not.toHaveBeenCalled()
        })

        it('игнорирует пустой текст', async () => {
            await act(async () => {
                await useWidgetStore.getState().sendMessage('   ')
            })

            expect(api.send).not.toHaveBeenCalled()
        })

        it('не отправляет второе сообщение, пока первое в пути', async () => {
            act(() => {
                useWidgetStore.setState({ sending: true })
            })

            await act(async () => {
                await useWidgetStore.getState().sendMessage('Ещё вопрос')
            })

            expect(api.send).not.toHaveBeenCalled()
        })

        it('отправляет текст и обновляет переписку', async () => {
            api.send.mockResolvedValue(undefined)
            api.messages.mockResolvedValue({
                messages: [
                    { id: 'm-1', author: 'user', text: 'Сколько стоит?', created_at: '2026-09-20T10:00:00Z' },
                    { id: 'm-2', author: 'bot', text: 'От 490 ₽.', created_at: '2026-09-20T10:00:01Z' },
                ],
                status: 'open',
            })

            await act(async () => {
                await useWidgetStore.getState().sendMessage('Сколько стоит?')
            })

            expect(api.send).toHaveBeenCalledWith('t-1', 'Сколько стоит?')
            const state = useWidgetStore.getState()
            expect(state.sending).toBe(false)
            expect(state.messages).toHaveLength(2)
            expect(state.error).toBeNull()
        })

        // The mutation this guards against: showing the shared dictionary's
        // generic rate_limited text ("подождите немного") instead of the
        // conversation-cap-specific reason the server actually sent.
        it('показывает причину отказа по потолку сообщений, а не общую фразу', async () => {
            const capError = new ApiError(429, {
                code: 'rate_limited',
                message: 'В этом чате слишком много сообщений — позовите человека',
            })
            api.send.mockRejectedValue(capError)
            errorMessageMock.mockReturnValue('В этом чате слишком много сообщений — позовите человека')

            await act(async () => {
                await useWidgetStore.getState().sendMessage('Ещё один вопрос')
            })

            const state = useWidgetStore.getState()
            expect(state.error).toBe('В этом чате слишком много сообщений — позовите человека')
            expect(state.error).not.toBe('Слишком много запросов. Подождите немного.')
            expect(state.sending).toBe(false)
        })
    })

    describe('callHuman', () => {
        it('ничего не делает без токена', async () => {
            await act(async () => {
                await useWidgetStore.getState().callHuman()
            })

            expect(api.human).not.toHaveBeenCalled()
        })

        it('зовёт человека и обновляет статус разговора', async () => {
            act(() => {
                useWidgetStore.setState({ token: 't-1' })
            })
            api.human.mockResolvedValue(undefined)
            api.messages.mockResolvedValue({ messages: [], status: 'escalated' })

            await act(async () => {
                await useWidgetStore.getState().callHuman()
            })

            expect(api.human).toHaveBeenCalledWith('t-1')
            expect(useWidgetStore.getState().status).toBe('escalated')
        })

        it('показывает причину отказа', async () => {
            act(() => {
                useWidgetStore.setState({ token: 't-1' })
            })
            const error = new ApiError(404, { message: 'Чат не найден — откройте его заново' })
            api.human.mockRejectedValue(error)
            errorMessageMock.mockReturnValue('Чат не найден — откройте его заново')

            await act(async () => {
                await useWidgetStore.getState().callHuman()
            })

            expect(useWidgetStore.getState().error).toBe('Чат не найден — откройте его заново')
        })
    })

    describe('submitContact', () => {
        const consents = { data_processing: true, contact: false }

        it('ничего не делает без токена', async () => {
            let ok: boolean | undefined
            await act(async () => {
                ok = await useWidgetStore.getState().submitContact('visitor@example.com', consents)
            })

            expect(api.contact).not.toHaveBeenCalled()
            expect(ok).toBe(false)
        })

        it('сохраняет контакт', async () => {
            act(() => {
                useWidgetStore.setState({ token: 't-1' })
            })
            api.contact.mockResolvedValue({ token: 'lead-token' })

            let ok: boolean | undefined
            await act(async () => {
                ok = await useWidgetStore.getState().submitContact('visitor@example.com', consents)
            })

            expect(api.contact).toHaveBeenCalledWith('t-1', 'visitor@example.com', consents)
            expect(ok).toBe(true)
            expect(useWidgetStore.getState().error).toBeNull()
        })

        it('показывает причину отказа, когда контакт уже сохранён', async () => {
            act(() => {
                useWidgetStore.setState({ token: 't-1' })
            })
            const error = new ApiError(409, { message: 'Контакт для этого разговора уже сохранён' })
            api.contact.mockRejectedValue(error)
            errorMessageMock.mockReturnValue('Контакт для этого разговора уже сохранён')

            let ok: boolean | undefined
            await act(async () => {
                ok = await useWidgetStore.getState().submitContact('visitor@example.com', consents)
            })

            expect(ok).toBe(false)
            expect(useWidgetStore.getState().error).toBe('Контакт для этого разговора уже сохранён')
        })
    })

    describe('closeWidget, clearError', () => {
        it('закрывает виджет, не забывая токен и переписку', () => {
            act(() => {
                useWidgetStore.setState({ open: true, token: 't-1', messages: [{ id: 'm-1', author: 'user', text: 'x', created_at: 'now' }] })
                useWidgetStore.getState().closeWidget()
            })

            const state = useWidgetStore.getState()
            expect(state.open).toBe(false)
            expect(state.token).toBe('t-1')
            expect(state.messages).toHaveLength(1)
        })

        it('сбрасывает ошибку', () => {
            act(() => {
                useWidgetStore.setState({ error: 'что-то' })
                useWidgetStore.getState().clearError()
            })

            expect(useWidgetStore.getState().error).toBeNull()
        })
    })
})
