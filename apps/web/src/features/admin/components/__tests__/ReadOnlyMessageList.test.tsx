import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ReadOnlyMessageList } from '../ReadOnlyMessageList'
import { adminApi } from '../../api/adminApi'
import type { AdminMessage } from '../../types'

jest.mock('../../api/adminApi', () => ({
    adminApi: {
        getConversationMessages: jest.fn(),
    },
}))

const mockAdminApi = adminApi as jest.Mocked<typeof adminApi>

function makeMessage(overrides: Partial<AdminMessage> = {}): AdminMessage {
    return {
        id: 'msg-1',
        sender_id: 1,
        sender_name: 'Анна',
        type: 'text',
        content: 'Привет!',
        created_at: '2025-06-01T14:30:00Z',
        ...overrides,
    }
}

describe('ReadOnlyMessageList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading state', () => {
        mockAdminApi.getConversationMessages.mockReturnValue(new Promise(() => {}))
        render(<ReadOnlyMessageList conversationId="conv-1" />)

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('shows error state', async () => {
        mockAdminApi.getConversationMessages.mockRejectedValue(new Error('fail'))
        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить сообщения')).toBeInTheDocument()
        })
    })

    it('shows empty state', async () => {
        mockAdminApi.getConversationMessages.mockResolvedValue([])
        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('Нет сообщений')).toBeInTheDocument()
        })
    })

    it('renders messages with sender name and content', async () => {
        mockAdminApi.getConversationMessages.mockResolvedValue([
            makeMessage({ id: 'msg-1', sender_name: 'Анна', content: 'Привет!' }),
            makeMessage({ id: 'msg-2', sender_name: 'Борис', content: 'Здравствуйте!' }),
        ])

        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
            expect(screen.getByText('Привет!')).toBeInTheDocument()
            expect(screen.getByText('Борис')).toBeInTheDocument()
            expect(screen.getByText('Здравствуйте!')).toBeInTheDocument()
        })
    })

    it('shows load more button when hasMore is true (>= 50 messages)', async () => {
        // Return exactly 50 messages so hasMore = true
        const messages = Array.from({ length: 50 }, (_, i) =>
            makeMessage({ id: `msg-${i}`, content: `Message ${i}` })
        )
        mockAdminApi.getConversationMessages.mockResolvedValue(messages)

        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('Загрузить ещё')).toBeInTheDocument()
        })
    })

    it('does not show load more button when fewer than 50 messages', async () => {
        mockAdminApi.getConversationMessages.mockResolvedValue([
            makeMessage({ id: 'msg-1' }),
        ])

        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('Привет!')).toBeInTheDocument()
        })

        expect(screen.queryByText('Загрузить ещё')).not.toBeInTheDocument()
    })

    it('handles food_entry type messages', async () => {
        mockAdminApi.getConversationMessages.mockResolvedValue([
            makeMessage({ id: 'msg-1', type: 'food_entry', content: 'Курица 200г' }),
        ])

        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('Курица 200г')).toBeInTheDocument()
        })
    })

    it('shows default text for food_entry without content', async () => {
        mockAdminApi.getConversationMessages.mockResolvedValue([
            makeMessage({ id: 'msg-1', type: 'food_entry', content: undefined }),
        ])

        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('Запись о питании')).toBeInTheDocument()
        })
    })

    it('shows attachment placeholder for messages without content', async () => {
        mockAdminApi.getConversationMessages.mockResolvedValue([
            makeMessage({ id: 'msg-1', type: 'image', content: undefined }),
        ])

        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('[вложение]')).toBeInTheDocument()
        })
    })

    it('loads more messages on button click', async () => {
        const initialMessages = Array.from({ length: 50 }, (_, i) =>
            makeMessage({ id: `msg-${i}`, content: `Message ${i}` })
        )
        mockAdminApi.getConversationMessages
            .mockResolvedValueOnce(initialMessages)
            .mockResolvedValueOnce([
                makeMessage({ id: 'msg-older', content: 'Older message' }),
            ])

        render(<ReadOnlyMessageList conversationId="conv-1" />)

        await waitFor(() => {
            expect(screen.getByText('Загрузить ещё')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Загрузить ещё'))

        await waitFor(() => {
            // The second call should use the first message id as cursor
            expect(mockAdminApi.getConversationMessages).toHaveBeenCalledTimes(2)
        })
    })
})
