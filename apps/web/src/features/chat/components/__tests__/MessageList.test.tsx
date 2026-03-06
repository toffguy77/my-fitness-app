import { render, screen, fireEvent } from '@testing-library/react'
import { MessageList } from '../MessageList'
import type { Message } from '../../types'

// Mock child components
jest.mock('../MessageBubble', () => ({
    MessageBubble: ({ message, isOwn }: { message: Message; isOwn: boolean }) => (
        <div data-testid={`message-${message.id}`} data-own={isOwn}>
            {message.content}
        </div>
    ),
}))

jest.mock('../DateSeparator', () => ({
    DateSeparator: ({ date }: { date: string }) => (
        <div data-testid="date-separator">{date}</div>
    ),
}))

function makeMessage(id: string, createdAt: string, content = 'test'): Message {
    return {
        id,
        conversation_id: 'conv-1',
        sender_id: 1,
        type: 'text',
        content,
        created_at: createdAt,
    }
}

describe('MessageList', () => {
    const defaultProps = {
        messages: [] as Message[],
        isLoading: false,
        hasMore: false,
        onLoadMore: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
        // Set up user in localStorage for isOwn detection
        localStorage.setItem('user', JSON.stringify({ id: 1 }))
    })

    afterEach(() => {
        localStorage.clear()
    })

    it('renders messages with MessageBubble', () => {
        const messages = [
            makeMessage('msg-1', '2025-01-01T12:00:00Z', 'Hello'),
            makeMessage('msg-2', '2025-01-01T13:00:00Z', 'World'),
        ]

        render(<MessageList {...defaultProps} messages={messages} />)

        expect(screen.getByTestId('message-msg-1')).toBeInTheDocument()
        expect(screen.getByTestId('message-msg-2')).toBeInTheDocument()
    })

    it('shows "load more" button when hasMore is true', () => {
        render(<MessageList {...defaultProps} hasMore={true} />)
        expect(screen.getByText('Загрузить ещё')).toBeInTheDocument()
    })

    it('does not show "load more" button when hasMore is false', () => {
        render(<MessageList {...defaultProps} hasMore={false} />)
        expect(screen.queryByText('Загрузить ещё')).not.toBeInTheDocument()
    })

    it('calls onLoadMore when "load more" is clicked', () => {
        const onLoadMore = jest.fn()
        render(<MessageList {...defaultProps} hasMore={true} onLoadMore={onLoadMore} />)

        fireEvent.click(screen.getByText('Загрузить ещё'))
        expect(onLoadMore).toHaveBeenCalled()
    })

    it('shows loading text when loading', () => {
        render(<MessageList {...defaultProps} isLoading={true} hasMore={true} />)
        expect(screen.getByText('Загрузка...')).toBeInTheDocument()
    })

    it('shows empty state when no messages and not loading', () => {
        render(<MessageList {...defaultProps} isLoading={false} messages={[]} />)
        expect(screen.getByText('Нет сообщений')).toBeInTheDocument()
    })

    it('shows loading state when loading and no messages', () => {
        render(<MessageList {...defaultProps} isLoading={true} messages={[]} />)
        expect(screen.getByText('Загрузка сообщений...')).toBeInTheDocument()
    })

    it('renders date separators between messages from different days', () => {
        const messages = [
            makeMessage('msg-1', '2025-01-01T12:00:00Z'),
            makeMessage('msg-2', '2025-01-02T12:00:00Z'),
        ]

        render(<MessageList {...defaultProps} messages={messages} />)

        const separators = screen.getAllByTestId('date-separator')
        expect(separators.length).toBe(2)
    })
})
