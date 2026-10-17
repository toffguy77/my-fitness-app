/**
 * Переписка куратора открывается по клиенту.
 *
 * Страница тянула весь список переписок и искала в нём клиента; не нашла —
 * заголовок навсегда оставался «Загрузка…». Спека curator-chat-states.
 *
 * Подменён транспорт, chatApi настоящий: проверяется, какие запросы уходят.
 */

import { render, screen, waitFor } from '@testing-library/react'

import { apiClient } from '@/shared/utils/api-client'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useParams: () => ({ clientId: '7' }),
}))

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn() },
}))

jest.mock('@/features/chat/store/chatStore', () => ({
    useChatStore: Object.assign(() => ({ resetUnread: jest.fn() }), {
        getState: () => ({ resetUnread: jest.fn() }),
    }),
}))

// Сообщения грузит useChat; здесь он о другом.
jest.mock('@/features/chat/hooks/useChat', () => ({
    useChat: () => ({
        messages: [],
        isLoading: false,
        hasMore: false,
        loadMore: jest.fn(),
        sendMessage: jest.fn(),
        sendFile: jest.fn(),
        sendTyping: jest.fn(),
        lastEvent: null,
    }),
}))
jest.mock('@/features/chat/components/MessageList', () => ({
    MessageList: () => <div data-testid="message-list" />,
}))
jest.mock('@/features/chat/components/ChatInput', () => ({
    ChatInput: () => <div data-testid="chat-input" />,
}))
jest.mock('@/features/chat/components/TypingIndicator', () => ({
    TypingIndicator: () => <div />,
}))
jest.mock('@/features/chat/components/FoodEntryForm', () => ({
    FoodEntryForm: () => <div />,
}))

import CuratorChatPage from '../page'

const mockGet = apiClient.get as jest.Mock

const conversation = {
    id: 'conv-1',
    client_id: 7,
    curator_id: 2,
    unread_count: 0,
    participant: { id: 7, name: 'Анна Клиентова' },
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
}

beforeEach(() => {
    jest.clearAllMocks()
})

// «Переписка есть»
it('получает переписку одним запросом by-participant, а не списком', async () => {
    mockGet.mockResolvedValue(conversation)

    render(<CuratorChatPage />)

    expect(await screen.findByRole('heading', { name: 'Анна Клиентова' })).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/conversations/by-participant/7')
    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/conversations')
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
})

// «Переписки нет»
it('на 404 показывает «Переписка с клиентом не найдена» и ссылку на карточку клиента', async () => {
    mockGet.mockRejectedValue(new ApiError(404, { code: 'not_found', message: 'Переписка не найдена' }))

    render(<CuratorChatPage />)

    expect(await screen.findByText('Переписка с клиентом не найдена')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Открыть карточку клиента' })
    expect(link).toHaveAttribute('href', '/curator/clients/7')
    expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument()
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument()
})

// Не 404 — не «не найдена»: переписка может быть, её просто не загрузили.
it('на сбой сервера говорит, что не загрузилось, а не что переписки нет', async () => {
    mockGet.mockRejectedValue(new ApiError(500, { code: 'internal' }))

    render(<CuratorChatPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить переписку')
    expect(screen.queryByText('Переписка с клиентом не найдена')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Открыть карточку клиента' })).toBeInTheDocument())
})
