/**
 * Когда разговор считается прочитанным.
 *
 * Раньше `markAsRead` вызывался в момент, когда разговор нашёлся в списке, — до
 * загрузки сообщений и до их показа. Куратор заходил в чат, сообщения не
 * успевали прийти, он уходил, и непрочитанное было потеряно: сводка честно
 * показывала ноль над перепиской, которую никто не читал.
 */

import { render, waitFor } from '@testing-library/react'

import { chatApi } from '@/features/chat/api/chatApi'
import { useChat } from '@/features/chat/hooks/useChat'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useParams: () => ({ clientId: '7' }),
}))

jest.mock('@/features/chat/api/chatApi', () => ({
    chatApi: {
        getConversations: jest.fn(),
        markAsRead: jest.fn(),
    },
}))

const resetUnread = jest.fn()
jest.mock('@/features/chat/store/chatStore', () => ({
    useChatStore: Object.assign(
        () => ({ resetUnread }),
        { getState: () => ({ resetUnread }) },
    ),
}))

jest.mock('@/features/chat/hooks/useChat', () => ({
    useChat: jest.fn(),
}))

jest.mock('@/features/chat/components/MessageList', () => ({
    MessageList: () => <div data-testid="message-list" />,
}))
jest.mock('@/features/chat/components/ChatInput', () => ({
    ChatInput: () => <div data-testid="chat-input" />,
}))
jest.mock('@/features/chat/components/TypingIndicator', () => ({
    TypingIndicator: () => <div data-testid="typing-indicator" />,
}))
jest.mock('@/features/chat/components/FoodEntryForm', () => ({
    FoodEntryForm: () => <div data-testid="food-entry-form" />,
}))

import CuratorChatPage from '../page'

const mockChatApi = chatApi as jest.Mocked<typeof chatApi>
const mockUseChat = useChat as jest.Mock

const conversation = {
    id: 'conv-1',
    client_id: 7,
    curator_id: 2,
    unread_count: 3,
    participant: { id: 7, name: 'Клиент' },
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
}

const message = {
    id: 'm1',
    conversation_id: 'conv-1',
    sender_id: 7,
    type: 'text' as const,
    content: 'привет',
    created_at: '2026-09-01T00:00:00Z',
}

function chatState(overrides: Record<string, unknown> = {}) {
    mockUseChat.mockReturnValue({
        messages: [],
        isLoading: false,
        hasMore: false,
        loadMore: jest.fn(),
        sendMessage: jest.fn(),
        sendFile: jest.fn(),
        sendTyping: jest.fn(),
        lastEvent: null,
        ...overrides,
    })
}

beforeEach(() => {
    jest.clearAllMocks()
    mockChatApi.getConversations.mockResolvedValue([conversation] as never)
})

it('помечает прочитанным, когда сообщения показаны', async () => {
    chatState({ messages: [message] })

    render(<CuratorChatPage />)

    await waitFor(() => expect(mockChatApi.markAsRead).toHaveBeenCalledWith('conv-1'))
    expect(resetUnread).toHaveBeenCalledWith('conv-1')
})

it('не помечает прочитанным, пока сообщения загружаются', async () => {
    chatState({ isLoading: true })

    render(<CuratorChatPage />)

    await waitFor(() => expect(mockChatApi.getConversations).toHaveBeenCalled())
    expect(mockChatApi.markAsRead).not.toHaveBeenCalled()
})

it('не помечает прочитанным, если загрузка сообщений не удалась', async () => {
    // Разговор найден, но сообщений нет — загрузка не состоялась.
    // Непрочитанное по нему должно сохраниться.
    chatState({ messages: [], isLoading: false })

    render(<CuratorChatPage />)

    await waitFor(() => expect(mockChatApi.getConversations).toHaveBeenCalled())
    expect(mockChatApi.markAsRead).not.toHaveBeenCalled()
    expect(resetUnread).not.toHaveBeenCalled()
})

it('помечает прочитанным один раз, а не на каждую перерисовку', async () => {
    chatState({ messages: [message] })

    const { rerender } = render(<CuratorChatPage />)
    await waitFor(() => expect(mockChatApi.markAsRead).toHaveBeenCalledTimes(1))

    rerender(<CuratorChatPage />)
    expect(mockChatApi.markAsRead).toHaveBeenCalledTimes(1)
})
