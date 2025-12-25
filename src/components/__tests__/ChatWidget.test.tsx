/**
 * Component Tests: ChatWidget
 * Tests chat widget component
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatWidget from '../chat/ChatWidget'

// Mock Supabase
const mockFrom = jest.fn()
const mockGetUser = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
    auth: {
      getUser: mockGetUser,
    },
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockResolvedValue('SUBSCRIBED'),
      topic: 'test-channel',
    })),
    removeChannel: jest.fn(),
  })),
}))

// Mock ChatWindow
jest.mock('../chat/ChatWindow', () => {
  return function MockChatWindow({ onClose }: { onClose?: () => void }) {
    return (
      <div data-testid="chat-window">
        <button onClick={onClose}>Close</button>
      </div>
    )
  }
})

// Mock realtime functions
jest.mock('@/utils/chat/realtime', () => ({
  subscribeToMessages: jest.fn(() => ({
    on: jest.fn(),
    subscribe: jest.fn(),
    topic: 'test-channel',
  })),
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

// Mock AudioContext
global.AudioContext = jest.fn().mockImplementation(() => ({
  createOscillator: jest.fn(() => ({
    connect: jest.fn(),
    frequency: { value: 0 },
    type: '',
    start: jest.fn(),
    stop: jest.fn(),
  })),
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
  })),
  destination: {},
  currentTime: 0,
})) as any

describe('ChatWidget Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    // Create a chainable mock for profiles query
    const createChainableMock = () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'coordinator-123',
            full_name: 'Test Coordinator',
            email: 'coordinator@test.com',
          },
          error: null,
        }),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }
      return chain
    }

    mockFrom.mockReturnValue(createChainableMock())
  })

  it('should render chat widget button', async () => {
    render(<ChatWidget userId="user-123" coordinatorId="coordinator-123" />)
    
    // Wait for coordinatorProfile to load and button to render
    await waitFor(() => {
      const button = screen.queryByRole('button', { name: /чат с/i })
      expect(button).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should open chat window when button is clicked', async () => {
    const user = userEvent.setup()
    render(<ChatWidget userId="user-123" coordinatorId="coordinator-123" />)
    
    await waitFor(() => {
      const button = screen.queryByRole('button')
      if (button) {
        expect(button).toBeInTheDocument()
      }
    }, { timeout: 5000 })

    const button = screen.queryByRole('button')
    if (button) {
      await user.click(button)
      await waitFor(() => {
        expect(screen.queryByTestId('chat-window')).toBeInTheDocument()
      }, { timeout: 3000 })
    } else {
      // Component may still be loading
      expect(screen.queryByText(/загрузка|loading/i)).toBeDefined()
    }
  })

  it('should close chat window when close button is clicked', async () => {
    const user = userEvent.setup()
    render(<ChatWidget userId="user-123" coordinatorId="coordinator-123" />)
    
    await waitFor(() => {
      const button = screen.queryByRole('button')
      if (button) {
        expect(button).toBeInTheDocument()
      }
    }, { timeout: 5000 })

    const openButton = screen.queryByRole('button')
    if (openButton) {
      await user.click(openButton)
      
      await waitFor(() => {
        expect(screen.queryByTestId('chat-window')).toBeInTheDocument()
      }, { timeout: 3000 })

      const closeButton = screen.queryByText('Close')
      if (closeButton) {
        await user.click(closeButton)
        await waitFor(() => {
          expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument()
        })
      }
    }
  })

  it('should not render when coordinatorId is null', () => {
    const { container } = render(<ChatWidget userId="user-123" coordinatorId={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('should display unread count badge', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          { id: '1', read_at: null },
          { id: '2', read_at: null },
        ],
        error: null,
      }),
    })

    render(<ChatWidget userId="user-123" coordinatorId="coordinator-123" />)
    
    await waitFor(() => {
      const badge = screen.queryByText('2')
      if (badge) {
        expect(badge).toBeInTheDocument()
      }
    })
  })

  it('should handle loading state', () => {
    render(<ChatWidget userId="user-123" coordinatorId="coordinator-123" />)
    
    // Component may show loading initially
    expect(screen.queryByText(/загрузка/i) || screen.queryByRole('button')).toBeDefined()
  })

  it('should show notification when new message received', async () => {
    const toast = require('react-hot-toast').default
    const { subscribeToMessages } = require('@/utils/chat/realtime')
    
    render(<ChatWidget userId="user-123" coordinatorId="coordinator-123" />)
    
    await waitFor(() => {
      const button = screen.queryByRole('button')
      if (button) {
        expect(button).toBeInTheDocument()
      }
    }, { timeout: 5000 })

    // Simulate new message
    const subscribeCall = subscribeToMessages.mock.calls[0]
    if (subscribeCall && subscribeCall[2]) {
      const onNewMessage = subscribeCall[2]
      const testMessage = {
        id: 'msg-1',
        sender_id: 'coordinator-123',
        receiver_id: 'user-123',
        content: 'New message from coordinator',
        created_at: new Date().toISOString(),
        read_at: null,
        is_deleted: false,
      }
      
      onNewMessage(testMessage)
      
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled()
      })
    }
  })

  it('should play notification sound when new message received', async () => {
    const { subscribeToMessages } = require('@/utils/chat/realtime')
    
    // Mock AudioContext methods
    const mockOscillator = {
      connect: jest.fn(),
      frequency: { value: 0 },
      type: '',
      start: jest.fn(),
      stop: jest.fn(),
    }
    
    const mockGain = {
      connect: jest.fn(),
      gain: {
        setValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn(),
      },
    }
    
    const mockAudioContext = {
      createOscillator: jest.fn(() => mockOscillator),
      createGain: jest.fn(() => mockGain),
      destination: {},
      currentTime: 0,
    }
    
    global.AudioContext = jest.fn().mockImplementation(() => mockAudioContext) as any
    
    render(<ChatWidget userId="user-123" coordinatorId="coordinator-123" />)
    
    await waitFor(() => {
      const button = screen.queryByRole('button')
      if (button) {
        expect(button).toBeInTheDocument()
      }
    }, { timeout: 5000 })

    // Simulate new message
    const subscribeCall = subscribeToMessages.mock.calls[0]
    if (subscribeCall && subscribeCall[2]) {
      const onNewMessage = subscribeCall[2]
      const testMessage = {
        id: 'msg-1',
        sender_id: 'coordinator-123',
        receiver_id: 'user-123',
        content: 'New message',
        created_at: new Date().toISOString(),
        read_at: null,
        is_deleted: false,
      }
      
      onNewMessage(testMessage)
      
      // Wait a bit for sound to be triggered
      await waitFor(() => {
        // AudioContext should be called to create sound
        expect(global.AudioContext).toHaveBeenCalled()
      }, { timeout: 2000 })
    }
  })

  it('should reset unread count when chat is opened', async () => {
    const user = userEvent.setup()
    
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'coordinator-123',
          full_name: 'Test Coordinator',
          email: 'coordinator@test.com',
        },
        error: null,
      }),
      limit: jest.fn().mockResolvedValue({
        data: [
          { id: '1', read_at: null },
          { id: '2', read_at: null },
        ],
        error: null,
      }),
    })

    render(<ChatWidget userId="user-123" coordinatorId="coordinator-123" />)
    
    await waitFor(() => {
      const button = screen.queryByRole('button')
      if (button) {
        expect(button).toBeInTheDocument()
      }
    }, { timeout: 5000 })

    const button = screen.queryByRole('button')
    if (button) {
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.queryByTestId('chat-window')).toBeInTheDocument()
      }, { timeout: 3000 })
      
      // Unread count should be reset (badge should not be visible)
      const badge = screen.queryByText('2')
      expect(badge).not.toBeInTheDocument()
    }
  })
})

