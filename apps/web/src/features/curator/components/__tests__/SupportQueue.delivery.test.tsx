/**
 * Недоставленный ответ и подпись канала в очереди обращений.
 * Спека support-delivery-indicator.
 *
 * Подменён транспорт, curatorApi настоящий: проверяется адрес повтора.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { SupportQueue } from '../SupportQueue'
import { apiClient } from '@/shared/utils/api-client'
import { ApiError } from '@/shared/errors/apiErrors'
import type { SupportConversation, SupportMessage, SupportThread } from '../../api/curatorApi'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn() },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

let searchParams = new URLSearchParams('conversation=conv-1')
jest.mock('next/navigation', () => ({
    useSearchParams: () => searchParams,
}))

const mockGet = apiClient.get as jest.Mock
const mockPost = apiClient.post as jest.Mock

const RETRY_URL = '/api/v1/curator/support/conversations/conv-1/messages/m3/retry'

function conversation(overrides: Partial<SupportConversation> = {}): SupportConversation {
    return {
        id: 'conv-1',
        channel: 'telegram',
        chat_id: 555,
        status: 'escalated',
        telegram_name: 'Гость',
        last_message_at: '2026-10-01T10:00:00Z',
        created_at: '2026-10-01T09:00:00Z',
        ...overrides,
    }
}

const question: SupportMessage = { id: 'm1', author: 'user', text: 'сколько стоит куратор?', created_at: '' }
const undelivered: SupportMessage = {
    id: 'm3',
    author: 'operator',
    text: 'Куратор входит в подписку',
    created_at: '',
    delivered: false,
}

function serve(thread: SupportThread) {
    mockGet.mockImplementation((url: string) => {
        if (url.startsWith('/api/v1/curator/support/conversations/conv-1')) return Promise.resolve(thread)
        return Promise.resolve({ items: [thread.conversation], total: 1, limit: 20, offset: 0 })
    })
}

/** Пункт треда с этим текстом. */
async function messageItem(text: string) {
    return (await screen.findByText(text)).closest('li') as HTMLElement
}

beforeEach(() => {
    jest.clearAllMocks()
    searchParams = new URLSearchParams('conversation=conv-1')
})

describe('недоставленный ответ', () => {
    // «Telegram не принял ответ»
    it('под ответом с delivered: false — «Не доставлено в Telegram» и «Повторить»', async () => {
        serve({ conversation: conversation(), messages: [question, undelivered] })
        render(<SupportQueue />)

        const item = await messageItem('Куратор входит в подписку')
        expect(within(item).getByText('Не доставлено в Telegram')).toBeInTheDocument()
        expect(within(item).getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
        // У вопроса признака нет.
        expect(within(await messageItem('сколько стоит куратор?')).queryByText('Не доставлено в Telegram')).toBeNull()
    })

    // «Обращение с сайта»: поля delivered нет — признака нет.
    it('у ответа без поля delivered признака доставки нет', async () => {
        const { delivered: _omitted, ...withoutField } = undelivered
        void _omitted
        serve({ conversation: conversation({ channel: 'web' }), messages: [question, withoutField] })
        render(<SupportQueue />)

        await messageItem('Куратор входит в подписку')
        expect(screen.queryByText('Не доставлено в Telegram')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    })

    it('у доставленного ответа признака нет', async () => {
        serve({ conversation: conversation(), messages: [{ ...undelivered, delivered: true }] })
        render(<SupportQueue />)

        await messageItem('Куратор входит в подписку')
        expect(screen.queryByText('Не доставлено в Telegram')).not.toBeInTheDocument()
    })

    it('«Повторить» зовёт retry и после успеха снимает признак', async () => {
        serve({ conversation: conversation(), messages: [question, undelivered] })
        mockPost.mockResolvedValue({ message: { ...undelivered, delivered: true } })
        render(<SupportQueue />)

        const item = await messageItem('Куратор входит в подписку')
        await userEvent.click(within(item).getByRole('button', { name: 'Повторить' }))

        await waitFor(() => expect(screen.queryByText('Не доставлено в Telegram')).not.toBeInTheDocument())
        expect(mockPost).toHaveBeenCalledTimes(1)
        expect(mockPost).toHaveBeenCalledWith(RETRY_URL, {})
        // Повтор не пишет новой строки в тред.
        expect(screen.getAllByText('Куратор входит в подписку')).toHaveLength(1)
    })

    it('на 502 оставляет признак и показывает ошибку', async () => {
        serve({ conversation: conversation(), messages: [question, undelivered] })
        mockPost.mockRejectedValue(
            new ApiError(502, { code: 'delivery_failed', message: 'Telegram снова не принял сообщение. Попробуйте позже.' })
        )
        render(<SupportQueue />)

        const item = await messageItem('Куратор входит в подписку')
        await userEvent.click(within(item).getByRole('button', { name: 'Повторить' }))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Telegram не принял сообщение. Попробуйте позже.')
        )
        expect(within(item).getByText('Не доставлено в Telegram')).toBeInTheDocument()
        expect(within(item).getByRole('button', { name: 'Повторить' })).toBeEnabled()
    })
})

describe('подпись поля ответа по каналу', () => {
    it('Telegram: «Ответ уйдёт в Telegram» и «Отправить в Telegram»', async () => {
        serve({ conversation: conversation({ channel: 'telegram' }), messages: [question] })
        render(<SupportQueue />)

        expect(await screen.findByLabelText('Ответ уйдёт в Telegram')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Отправить в Telegram' })).toBeInTheDocument()
    })

    // «Обращение с сайта»
    it('сайт: «Ответ увидит посетитель сайта» и просто «Отправить»', async () => {
        serve({ conversation: conversation({ channel: 'web' }), messages: [question] })
        render(<SupportQueue />)

        expect(await screen.findByLabelText('Ответ увидит посетитель сайта')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Отправить в Telegram' })).not.toBeInTheDocument()
        expect(screen.queryByText('Ответ уйдёт в Telegram')).not.toBeInTheDocument()
    })
})
