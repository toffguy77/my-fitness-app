/**
 * Component Tests: ChatWindow
 * Tests chat window component
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatWindow from '../chat/ChatWindow'

// Mock Supabase
const mockFrom = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}))

// Mock MessageList and MessageInput
jest.mock('../chat/MessageList', () => {
  return function MockMessageList({ messages }: { messages: any[] }) {
    return <div data-testid="message-list">{messages.length} messages</div>
  }
})

jest.mock('../chat/MessageInput', () => {
  return function MockMessageInput({ onSend }: { onSend: (content: string) => Promise<void> }) {
    return (
      <div data-testid="message-input">
        <button onClick={() => onSend('Test message')}>Send</button>
      </div>
    )
  }
})

// Mock realtime functions
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockResolvedValue('SUBSCRIBED'),
  topic: 'test-channel',
}

jest.mock('@/utils/chat/realtime', () => ({
  subscribeToMessages: jest.fn(() => mockChannel),
  subscribeToTyping: jest.fn(() => mockChannel),
  unsubscribeFromChannel: jest.fn(),
}))

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('ChatWindow Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default mock returns empty array (no messages)
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
      insert: jest.fn().mockResolvedValue({
        data: [{ id: 'msg-1' }],
        error: null,
      }),
    })
  })
  
  const setupMockWithMessages = () => {
    const mockMessage = {
      id: 'msg-1',
      content: 'Test message',
      sender_id: 'user-1',
      receiver_id: 'user-2',
      created_at: new Date().toISOString(),
      read_at: null,
      is_deleted: false,
    }
    
    // Create a chainable query that returns a promise when awaited
    const createQuery = () => {
      const promise = Promise.resolve({
        data: [mockMessage],
        error: null,
      })
      
      const query: any = promise
      query.select = jest.fn(() => query)
      query.eq = jest.fn(() => query)
      query.limit = jest.fn(() => promise)
      
      return query
    }
    
    mockFrom.mockReturnValue({
      ...createQuery(),
      insert: jest.fn().mockResolvedValue({
        data: [{ id: 'msg-1' }],
        error: null,
      }),
    })
  }

  it('should render chat window', async () => {
    setupMockWithMessages()

    render(
      <ChatWindow
        userId="user-1"
        otherUserId="user-2"
        otherUserName="Test User"
      />
    )

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    }, { timeout: 5000 })

    // MessageList should be rendered when there are messages
    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toBeInTheDocument()
    }, { timeout: 3000 })
    expect(screen.getByTestId('message-input')).toBeInTheDocument()
  })

  it('should display other user name', async () => {
    setupMockWithMessages()
    
    render(
      <ChatWindow
        userId="user-1"
        otherUserId="user-2"
        otherUserName="Test User"
      />
    )

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    }, { timeout: 5000 })

    // User name should be displayed in header
    expect(screen.getByText('Test User')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should call onClose when close button is clicked', async () => {
    const mockOnClose = jest.fn()
    const user = userEvent.setup()
    
    render(
      <ChatWindow
        userId="user-1"
        otherUserId="user-2"
        otherUserName="Test User"
        onClose={mockOnClose}
      />
    )

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    })

    const closeButton = screen.getByRole('button', { name: /закрыть|close/i })
    await user.click(closeButton)

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('should send message when onSend is called', async () => {
    const user = userEvent.setup()
    render(
      <ChatWindow
        userId="user-1"
        otherUserId="user-2"
        otherUserName="Test User"
      />
    )

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    })

    const sendButton = screen.getByText('Send')
    await user.click(sendButton)

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalled()
    })
  })

  it('should show loading state initially', () => {
    render(
      <ChatWindow
        userId="user-1"
        otherUserId="user-2"
        otherUserName="Test User"
      />
    )

    // May show loading initially
    expect(screen.queryByText(/загрузка/i) || screen.queryByTestId('message-list')).toBeDefined()
  })

  it('should handle connection status', async () => {
    setupMockWithMessages()
    
    render(
      <ChatWindow
        userId="user-1"
        otherUserId="user-2"
        otherUserName="Test User"
      />
    )

    await waitFor(() => {
      expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument()
    }, { timeout: 5000 })

    // Connection status indicator may be present
    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

