import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ConversationList } from '../ConversationList'
import { chatApi } from '../../api/chatApi'
import type { Conversation } from '../../types'

jest.mock('../../api/chatApi', () => ({
    chatApi: {
        getConversations: jest.fn(),
    },
}))

const mockChatApi = chatApi as jest.Mocked<typeof chatApi>

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
    return {
        id: 'conv-1',
        client_id: 1,
        curator_id: 2,
        unread_count: 0,
        participant: { id: 1, name: 'Иван Петров' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        ...overrides,
    }
}

describe('ConversationList', () => {
    const mockOnSelect = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading state', () => {
        mockChatApi.getConversations.mockReturnValue(new Promise(() => {})) // never resolves
        render(<ConversationList onSelectConversation={mockOnSelect} />)
        expect(screen.getByText('Загрузка чатов...')).toBeInTheDocument()
    })

    it('renders conversations after loading', async () => {
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({ id: 'c1', participant: { id: 1, name: 'Анна' } }),
            makeConversation({ id: 'c2', participant: { id: 2, name: 'Борис' } }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
            expect(screen.getByText('Борис')).toBeInTheDocument()
        })
    })

    it('sorts unread conversations first', async () => {
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({
                id: 'read',
                participant: { id: 1, name: 'Read User' },
                unread_count: 0,
                updated_at: '2025-06-01T12:00:00Z',
            }),
            makeConversation({
                id: 'unread',
                participant: { id: 2, name: 'Unread User' },
                unread_count: 3,
                updated_at: '2025-01-01T00:00:00Z',
            }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('Unread User')).toBeInTheDocument()
        })

        // Unread should appear first in DOM order
        const buttons = screen.getAllByRole('button')
        expect(buttons[0]).toHaveTextContent('Unread User')
        expect(buttons[1]).toHaveTextContent('Read User')
    })

    it('calls onSelectConversation when clicked', async () => {
        const conv = makeConversation({ id: 'c1', participant: { id: 1, name: 'Анна' } })
        mockChatApi.getConversations.mockResolvedValue([conv])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('Анна')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button'))
        expect(mockOnSelect).toHaveBeenCalledWith(conv)
    })

    it('shows relative time "только что" for recent messages', async () => {
        const now = new Date().toISOString()
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({
                id: 'c1',
                participant: { id: 1, name: 'Тест' },
                last_message: {
                    id: 'msg-1',
                    conversation_id: 'c1',
                    sender_id: 1,
                    type: 'text',
                    content: 'hi',
                    created_at: now,
                },
            }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('только что')).toBeInTheDocument()
        })
    })

    it('shows message preview for text type', async () => {
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({
                id: 'c1',
                participant: { id: 1, name: 'User' },
                last_message: {
                    id: 'msg-1',
                    conversation_id: 'c1',
                    sender_id: 1,
                    type: 'text',
                    content: 'Hello there',
                    created_at: '2025-01-01T00:00:00Z',
                },
            }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('Hello there')).toBeInTheDocument()
        })
    })

    it('shows "Фото" for image type preview', async () => {
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({
                id: 'c1',
                participant: { id: 1, name: 'User' },
                last_message: {
                    id: 'msg-1',
                    conversation_id: 'c1',
                    sender_id: 1,
                    type: 'image',
                    created_at: '2025-01-01T00:00:00Z',
                },
            }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('Фото')).toBeInTheDocument()
        })
    })

    it('shows "Файл" for file type preview', async () => {
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({
                id: 'c1',
                participant: { id: 1, name: 'User' },
                last_message: {
                    id: 'msg-1',
                    conversation_id: 'c1',
                    sender_id: 1,
                    type: 'file',
                    created_at: '2025-01-01T00:00:00Z',
                },
            }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('Файл')).toBeInTheDocument()
        })
    })

    it('shows "КБЖУ запись" for food_entry type preview', async () => {
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({
                id: 'c1',
                participant: { id: 1, name: 'User' },
                last_message: {
                    id: 'msg-1',
                    conversation_id: 'c1',
                    sender_id: 1,
                    type: 'food_entry',
                    created_at: '2025-01-01T00:00:00Z',
                },
            }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('КБЖУ запись')).toBeInTheDocument()
        })
    })

    it('shows "Нет сообщений" when no last_message', async () => {
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({ id: 'c1', participant: { id: 1, name: 'User' } }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('Нет сообщений')).toBeInTheDocument()
        })
    })

    it('shows unread badge count', async () => {
        mockChatApi.getConversations.mockResolvedValue([
            makeConversation({ id: 'c1', participant: { id: 1, name: 'User' }, unread_count: 5 }),
        ])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('5')).toBeInTheDocument()
        })
    })

    // Способность chat-list-activity: время в строке означает последнее
    // сообщение, и у пустого разговора его нет.
    describe('время в строке', () => {
        it('показывает время последнего сообщения, когда сообщения есть', async () => {
            mockChatApi.getConversations.mockResolvedValue([
                makeConversation({
                    id: 'c1',
                    participant: { id: 1, name: 'Анна' },
                    last_message: {
                        id: 'm1',
                        conversation_id: 'c1',
                        sender_id: 1,
                        type: 'text',
                        content: 'привет',
                        created_at: new Date().toISOString(),
                    },
                }),
            ])

            render(<ConversationList onSelectConversation={mockOnSelect} />)

            expect(await screen.findByText('только что')).toBeInTheDocument()
        })

        it('у разговора без сообщений времени нет — раньше там стояла дата создания', async () => {
            // Запись о разговоре создана вчера; сообщений нет ни одного.
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            mockChatApi.getConversations.mockResolvedValue([
                makeConversation({
                    id: 'c1',
                    participant: { id: 1, name: 'Анна' },
                    created_at: yesterday,
                    updated_at: yesterday,
                }),
            ])

            render(<ConversationList onSelectConversation={mockOnSelect} />)

            expect(await screen.findByText('Нет сообщений')).toBeInTheDocument()
            expect(screen.queryByText('вчера')).not.toBeInTheDocument()
            expect(screen.queryByText(/назад/)).not.toBeInTheDocument()
        })

        it('после первого сообщения время появляется', async () => {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            mockChatApi.getConversations.mockResolvedValue([
                makeConversation({
                    id: 'c1',
                    participant: { id: 1, name: 'Анна' },
                    created_at: yesterday,
                    updated_at: new Date().toISOString(),
                    last_message: {
                        id: 'm1',
                        conversation_id: 'c1',
                        sender_id: 1,
                        type: 'text',
                        content: 'первое',
                        created_at: new Date().toISOString(),
                    },
                }),
            ])

            render(<ConversationList onSelectConversation={mockOnSelect} />)

            expect(await screen.findByText('только что')).toBeInTheDocument()
        })
    })

    describe('порядок списка', () => {
        function names() {
            return screen.getAllByRole('button').map((b) => b.textContent || '')
        }

        it('пустой разговор, созданный позже переписки, стоит ниже её', async () => {
            const now = Date.now()
            mockChatApi.getConversations.mockResolvedValue([
                // Пустой, создан только что — по updated_at был бы первым.
                makeConversation({
                    id: 'empty',
                    participant: { id: 1, name: 'Пустой' },
                    created_at: new Date(now).toISOString(),
                    updated_at: new Date(now).toISOString(),
                }),
                makeConversation({
                    id: 'talked',
                    participant: { id: 2, name: 'Переписка' },
                    updated_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    last_message: {
                        id: 'm1',
                        conversation_id: 'talked',
                        sender_id: 2,
                        type: 'text',
                        content: 'позавчера',
                        created_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    },
                }),
            ])

            render(<ConversationList onSelectConversation={mockOnSelect} />)
            await screen.findByText('Переписка')

            const order = names()
            expect(order[0]).toContain('Переписка')
            expect(order[1]).toContain('Пустой')
        })

        it('несколько пустых разговоров идут после всех, в устойчивом порядке', async () => {
            const now = Date.now()
            mockChatApi.getConversations.mockResolvedValue([
                makeConversation({ id: 'e2', participant: { id: 1, name: 'Яков' } }),
                makeConversation({
                    id: 'talked',
                    participant: { id: 3, name: 'Переписка' },
                    last_message: {
                        id: 'm1',
                        conversation_id: 'talked',
                        sender_id: 3,
                        type: 'text',
                        content: 'было',
                        created_at: new Date(now - 60_000).toISOString(),
                    },
                }),
                makeConversation({ id: 'e1', participant: { id: 2, name: 'Алла' } }),
            ])

            render(<ConversationList onSelectConversation={mockOnSelect} />)
            await screen.findByText('Переписка')

            const order = names()
            expect(order[0]).toContain('Переписка')
            expect(order[1]).toContain('Алла')
            expect(order[2]).toContain('Яков')
        })

        it('непрочитанные остаются первыми, в том числе выше пустых', async () => {
            const now = Date.now()
            mockChatApi.getConversations.mockResolvedValue([
                makeConversation({ id: 'empty', participant: { id: 1, name: 'Пустой' } }),
                makeConversation({
                    id: 'unread',
                    participant: { id: 2, name: 'Непрочитанный' },
                    unread_count: 2,
                    last_message: {
                        id: 'm1',
                        conversation_id: 'unread',
                        sender_id: 2,
                        type: 'text',
                        content: 'давно',
                        created_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
                    },
                }),
                makeConversation({
                    id: 'recent',
                    participant: { id: 3, name: 'Свежий' },
                    last_message: {
                        id: 'm2',
                        conversation_id: 'recent',
                        sender_id: 3,
                        type: 'text',
                        content: 'только что',
                        created_at: new Date(now).toISOString(),
                    },
                }),
            ])

            render(<ConversationList onSelectConversation={mockOnSelect} />)
            await screen.findByText('Непрочитанный')

            const order = names()
            expect(order[0]).toContain('Непрочитанный')
            expect(order[1]).toContain('Свежий')
            expect(order[2]).toContain('Пустой')
        })
    })

    it('shows empty state when no conversations', async () => {
        mockChatApi.getConversations.mockResolvedValue([])

        render(<ConversationList onSelectConversation={mockOnSelect} />)

        await waitFor(() => {
            expect(screen.getByText('Нет чатов')).toBeInTheDocument()
        })
    })
})
