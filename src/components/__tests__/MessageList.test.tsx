/**
 * Component Tests: MessageList
 * Tests message list component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageList from '../chat/MessageList'
import type { Message } from '@/types/chat'

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn()

describe('MessageList Component', () => {
  const mockMessages: Message[] = [
    {
      id: '1',
      sender_id: 'user-1',
      receiver_id: 'user-2',
      content: 'Hello',
      created_at: new Date().toISOString(),
      read_at: null,
      is_deleted: false,
    },
    {
      id: '2',
      sender_id: 'user-2',
      receiver_id: 'user-1',
      content: 'Hi there',
      created_at: new Date().toISOString(),
      read_at: null,
      is_deleted: false,
    },
  ]

  it('should render messages', () => {
    render(
      <MessageList
        messages={mockMessages}
        currentUserId="user-1"
      />
    )

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there')).toBeInTheDocument()
  })

  it('should group messages by date', () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const messagesWithDates: Message[] = [
      {
        id: '1',
        sender_id: 'user-1',
        receiver_id: 'user-2',
        content: 'Today message',
        created_at: today.toISOString(),
        read_at: null,
        is_deleted: false,
      },
      {
        id: '2',
        sender_id: 'user-1',
        receiver_id: 'user-2',
        content: 'Yesterday message',
        created_at: yesterday.toISOString(),
        read_at: null,
        is_deleted: false,
      },
    ]

    render(
      <MessageList
        messages={messagesWithDates}
        currentUserId="user-1"
      />
    )

    expect(screen.getByText('Today message')).toBeInTheDocument()
    expect(screen.getByText('Yesterday message')).toBeInTheDocument()
  })

  it('should show load more button when hasMore is true', () => {
    render(
      <MessageList
        messages={mockMessages}
        currentUserId="user-1"
        hasMore={true}
      />
    )

    expect(screen.getByText(/загрузить предыдущие/i)).toBeInTheDocument()
  })

  it('should not show load more button when hasMore is false', () => {
    render(
      <MessageList
        messages={mockMessages}
        currentUserId="user-1"
        hasMore={false}
      />
    )

    expect(screen.queryByText(/загрузить предыдущие/i)).not.toBeInTheDocument()
  })

  it('should disable load more button when loading', () => {
    render(
      <MessageList
        messages={mockMessages}
        currentUserId="user-1"
        hasMore={true}
        loading={true}
      />
    )

    const button = screen.getByText(/загрузка/i)
    expect(button).toBeDisabled()
  })

  it('should call onLoadMore when load more button is clicked', async () => {
    const mockOnLoadMore = jest.fn()
    const user = userEvent.setup()

    render(
      <MessageList
        messages={mockMessages}
        currentUserId="user-1"
        hasMore={true}
        onLoadMore={mockOnLoadMore}
      />
    )

    const button = screen.getByText(/загрузить предыдущие/i)
    await user.click(button)

    expect(mockOnLoadMore).toHaveBeenCalled()
  })

  it('should show read indicator for own messages', () => {
    const messagesWithRead: Message[] = [
      {
        id: '1',
        sender_id: 'user-1',
        receiver_id: 'user-2',
        content: 'Read message',
        created_at: new Date().toISOString(),
        read_at: new Date().toISOString(),
        is_deleted: false,
      },
    ]

    render(
      <MessageList
        messages={messagesWithRead}
        currentUserId="user-1"
      />
    )

    expect(screen.getByText('Read message')).toBeInTheDocument()
    // Read indicator should be present
    const messageContainer = screen.getByText('Read message').closest('div')
    expect(messageContainer?.textContent).toContain('✓')
  })

  it('should handle empty messages array', () => {
    render(
      <MessageList
        messages={[]}
        currentUserId="user-1"
      />
    )

    expect(screen.queryByText(/hello/i)).not.toBeInTheDocument()
  })
})

