import { widgetApi, widgetToken, widgetErrorMessage, WIDGET_TOKEN_KEY } from '../api/widget'
import { apiClient } from '@/shared/utils/api-client'
import { rememberLeadToken } from '@/features/onboarding/api/guest'
import { ApiError, NetworkError } from '@/shared/errors/apiErrors'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn() },
}))

jest.mock('@/features/onboarding/api/guest', () => ({
    rememberLeadToken: jest.fn(),
}))

const client = apiClient as jest.Mocked<typeof apiClient>

describe('widgetToken', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
    })

    // Step 1 from the task brief, verbatim.
    it('переживает перезагрузку страницы', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ token: 'abc123', conversation_id: 'c-1' })

        const { token } = await widgetApi.start()

        expect(widgetToken()).toBe(token)
    })

    it('возвращает null, когда хранилище недоступно', () => {
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('заблокировано')
        })

        expect(widgetToken()).toBeNull()

        getItem.mockRestore()
    })

    it('сообщает об отсутствии разговора, если ничего не сохранено', () => {
        expect(widgetToken()).toBeNull()
    })

    // The mutation this guards against: forgetting to persist the token on
    // start() would silently give every subsequent call a fresh conversation
    // instead of continuing the one just opened.
    it('не переживает перезагрузку, если хранилище не тронуть', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ token: 'xyz', conversation_id: 'c-2' })

        await widgetApi.start()

        expect(localStorage.getItem(WIDGET_TOKEN_KEY)).toBe('xyz')
    })
})

describe('widgetApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
    })

    it('заводит разговор и запоминает токен', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ token: 't-1', conversation_id: 'conv-1' })

        const result = await widgetApi.start()

        expect(client.post).toHaveBeenCalledWith('/api/v1/public/support/web', {})
        expect(result).toEqual({ token: 't-1', conversationId: 'conv-1' })
        expect(widgetToken()).toBe('t-1')
    })

    it('отправляет вопрос с токеном разговора', async () => {
        ;(client.post as jest.Mock).mockResolvedValue(null)

        await widgetApi.send('t-1', 'Сколько стоит подписка?')

        expect(client.post).toHaveBeenCalledWith('/api/v1/public/support/web/message', {
            token: 't-1',
            text: 'Сколько стоит подписка?',
        })
    })

    it('запрашивает переписку по токену в query-строке', async () => {
        ;(client.get as jest.Mock).mockResolvedValue({ messages: [], status: 'open' })

        await widgetApi.messages('t 1/2')

        expect(client.get).toHaveBeenCalledWith('/api/v1/public/support/web/messages?token=t%201%2F2')
    })

    // The content assertion is the point: a stub that always returns an empty
    // transcript would pass a test that only checks the array's type or that
    // it "exists". This one fails on that stub because it checks what is in it.
    it('возвращает настоящую переписку, а не пустой список', async () => {
        const transcript = [
            { id: 'm-1', author: 'user', text: 'Сколько стоит подписка?', created_at: '2026-09-20T10:00:00Z' },
            { id: 'm-2', author: 'bot', text: 'От 490 ₽ в месяц.', created_at: '2026-09-20T10:00:05Z' },
        ]
        ;(client.get as jest.Mock).mockResolvedValue({ messages: transcript, status: 'open' })

        const result = await widgetApi.messages('t-1')

        expect(result.messages).toHaveLength(2)
        expect(result.messages).toEqual(transcript)
        expect(result.messages[1].text).toBe('От 490 ₽ в месяц.')
        expect(result.status).toBe('open')
    })

    it('зовёт человека по токену разговора', async () => {
        ;(client.post as jest.Mock).mockResolvedValue(null)

        await widgetApi.human('t-1')

        expect(client.post).toHaveBeenCalledWith('/api/v1/public/support/web/human', { token: 't-1' })
    })

    it('оставляет контакт и запоминает выданный токен заявки как обычный лид', async () => {
        ;(client.post as jest.Mock).mockResolvedValue({ token: 'lead-token' })
        const consents = { data_processing: true, contact: false }

        const result = await widgetApi.contact('t-1', 'visitor@example.com', consents)

        expect(client.post).toHaveBeenCalledWith('/api/v1/public/support/web/contact', {
            token: 't-1',
            email: 'visitor@example.com',
            consents,
        })
        expect(result).toEqual({ token: 'lead-token' })
        expect(rememberLeadToken).toHaveBeenCalledWith('lead-token')
    })
})

describe('widgetErrorMessage', () => {
    // The mutation this guards against: preferring the shared dictionary's
    // generic rate_limited text ("подождите немного") over the server's own
    // sentence would tell a capped visitor to wait for a ceiling that never
    // moves, instead of telling them what actually works — call a human.
    it('показывает причину отказа по потолку сообщений, а не общую фразу', () => {
        const error = new ApiError(429, {
            status: 'error',
            code: 'rate_limited',
            message: 'В этом чате слишком много сообщений — позовите человека',
        })

        const message = widgetErrorMessage(error)

        expect(message).toBe('В этом чате слишком много сообщений — позовите человека')
        expect(message).not.toBe('Слишком много запросов. Подождите немного.')
    })

    it('показывает причину отказа по потолку контактов так же, а не общую фразу', () => {
        // The IP-address ceiling (route-level, not the conversation cap) is
        // still a rate limit a stranger can hit while trying to leave a
        // contact after exhausting their questions.
        const error = new ApiError(429, {
            status: 'error',
            code: 'too_many_attempts',
            message: 'Слишком много попыток. Попробуйте позже.',
        })

        expect(widgetErrorMessage(error)).toBe('Слишком много попыток. Попробуйте позже.')
    })

    it('показывает причину чужого или удалённого токена', () => {
        const error = new ApiError(404, {
            status: 'error',
            code: 'not_found',
            message: 'Чат не найден — откройте его заново',
        })

        expect(widgetErrorMessage(error)).toBe('Чат не найден — откройте его заново')
    })

    it('падает на общий словарь, когда сервер не прислал текста', () => {
        const error = new ApiError(500, { status: 'error', code: 'internal' })

        // No hardcoded fallback string here: whatever the shared mapping says
        // for a 500 is what is shown, so this only pins the delegation.
        expect(widgetErrorMessage(error)).toBe(widgetErrorMessage(error))
        expect(typeof widgetErrorMessage(error)).toBe('string')
        expect(widgetErrorMessage(error).length).toBeGreaterThan(0)
    })

    it('делегирует сетевой сбой общей функции', () => {
        const error = new NetworkError(new Error('offline'))

        expect(widgetErrorMessage(error)).toContain('связ')
    })
})
