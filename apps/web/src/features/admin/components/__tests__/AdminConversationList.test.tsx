import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AdminConversationList } from '../AdminConversationList'
import { adminApi } from '../../api/adminApi'
import type { AdminConversation } from '../../types'

jest.mock('../../api/adminApi', () => ({
    adminApi: {
        getConversations: jest.fn(),
    },
}))

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

const mockAdminApi = adminApi as jest.Mocked<typeof adminApi>

function makeConversation(overrides: Partial<AdminConversation> = {}): AdminConversation {
    return {
        id: 'conv-1',
        client_id: 1,
        client_name: 'Клиент Один',
        curator_id: 2,
        curator_name: 'Куратор Один',
        message_count: 10,
        updated_at: '2025-06-01T12:00:00Z',
        ...overrides,
    }
}

describe('AdminConversationList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading state', () => {
        mockAdminApi.getConversations.mockReturnValue(new Promise(() => {}))
        render(<AdminConversationList />)

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('shows error state', async () => {
        mockAdminApi.getConversations.mockRejectedValue(new Error('fail'))
        render(<AdminConversationList />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить чаты')).toBeInTheDocument()
        })
    })

    it('shows empty state', async () => {
        mockAdminApi.getConversations.mockResolvedValue([])
        render(<AdminConversationList />)

        await waitFor(() => {
            expect(screen.getByText('Нет чатов')).toBeInTheDocument()
        })
    })

    it('renders conversation list with client-curator names', async () => {
        mockAdminApi.getConversations.mockResolvedValue([
            makeConversation({
                id: 'conv-1',
                client_name: 'Анна',
                curator_name: 'Мария',
                message_count: 15,
            }),
        ])

        render(<AdminConversationList />)

        await waitFor(() => {
            expect(screen.getByText('Анна — Мария')).toBeInTheDocument()
            expect(screen.getByText('15 сообщений')).toBeInTheDocument()
        })
    })

    it('shows date for each conversation', async () => {
        mockAdminApi.getConversations.mockResolvedValue([
            makeConversation({ updated_at: '2025-06-01T12:00:00Z' }),
        ])

        render(<AdminConversationList />)

        await waitFor(() => {
            // Date is rendered in ru-RU locale format
            const dateText = new Date('2025-06-01T12:00:00Z').toLocaleDateString('ru-RU')
            expect(screen.getByText(dateText)).toBeInTheDocument()
        })
    })

    it('navigates to /admin/chats/:id on click', async () => {
        mockAdminApi.getConversations.mockResolvedValue([
            makeConversation({ id: 'conv-42' }),
        ])

        render(<AdminConversationList />)

        await waitFor(() => {
            expect(screen.getByText('Клиент Один — Куратор Один')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button'))
        expect(mockPush).toHaveBeenCalledWith('/admin/chats/conv-42')
    })

    it('renders multiple conversations', async () => {
        mockAdminApi.getConversations.mockResolvedValue([
            makeConversation({ id: 'c1', client_name: 'Анна', curator_name: 'Мария' }),
            makeConversation({ id: 'c2', client_name: 'Борис', curator_name: 'Света' }),
        ])

        render(<AdminConversationList />)

        await waitFor(() => {
            expect(screen.getByText('Анна — Мария')).toBeInTheDocument()
            expect(screen.getByText('Борис — Света')).toBeInTheDocument()
        })
    })
})
