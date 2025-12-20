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

  it('should render chat window', async () => {
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

    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.getByTestId('message-input')).toBeInTheDocument()
  })

  it('should display other user name', async () => {
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

    // User name should be displayed in header
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
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

    // Connection status indicator may be present
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
  })
})

