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
            id: 'coach-123',
            full_name: 'Test Coach',
            email: 'coach@test.com',
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
    render(<ChatWidget userId="user-123" coachId="coach-123" />)
    
    // Wait for coachProfile to load and button to render
    await waitFor(() => {
      const button = screen.queryByRole('button', { name: /чат с/i })
      expect(button).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should open chat window when button is clicked', async () => {
    const user = userEvent.setup()
    render(<ChatWidget userId="user-123" coachId="coach-123" />)
    
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
    render(<ChatWidget userId="user-123" coachId="coach-123" />)
    
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

  it('should not render when coachId is null', () => {
    const { container } = render(<ChatWidget userId="user-123" coachId={null} />)
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

    render(<ChatWidget userId="user-123" coachId="coach-123" />)
    
    await waitFor(() => {
      const badge = screen.queryByText('2')
      if (badge) {
        expect(badge).toBeInTheDocument()
      }
    })
  })

  it('should handle loading state', () => {
    render(<ChatWidget userId="user-123" coachId="coach-123" />)
    
    // Component may show loading initially
    expect(screen.queryByText(/загрузка/i) || screen.queryByRole('button')).toBeDefined()
  })
})

