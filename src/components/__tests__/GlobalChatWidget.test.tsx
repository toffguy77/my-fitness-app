/**
 * Component Tests: GlobalChatWidget
 * Tests global chat widget component
 */

import { render, screen, waitFor } from '@testing-library/react'
import GlobalChatWidget from '../chat/GlobalChatWidget'

// Mock Supabase
const mockGetUser = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}))

// Mock profile utils
jest.mock('@/utils/supabase/profile', () => ({
  getUserProfile: jest.fn(),
  hasActiveSubscription: jest.fn(),
}))

// Mock subscription utils
jest.mock('@/utils/supabase/subscription', () => ({
  checkSubscriptionStatus: jest.fn(),
}))

// Mock ChatWidget
jest.mock('../chat/ChatWidget', () => {
  return function MockChatWidget() {
    return <div data-testid="chat-widget">Chat Widget</div>
  }
})

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('GlobalChatWidget Component', () => {
  const { getUserProfile } = require('@/utils/supabase/profile')
  const { checkSubscriptionStatus } = require('@/utils/supabase/subscription')
  const { hasActiveSubscription } = require('@/utils/supabase/profile')

  beforeEach(() => {
    jest.clearAllMocks()

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
  })

  it('should not render when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const { container } = render(<GlobalChatWidget />)

    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('should not render when user is not premium', async () => {
    getUserProfile.mockResolvedValue({
      id: 'user-123',
      curator_id: 'curator-123',
      role: 'client',
    })

    hasActiveSubscription.mockReturnValue(false)

    const { container } = render(<GlobalChatWidget />)

    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('should not render when user has no curator', async () => {
    getUserProfile.mockResolvedValue({
      id: 'user-123',
      curator_id: null,
      role: 'client',
    })

    hasActiveSubscription.mockReturnValue(true)

    const { container } = render(<GlobalChatWidget />)

    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('should render ChatWidget for premium user with curator', async () => {
    getUserProfile.mockResolvedValue({
      id: 'user-123',
      curator_id: 'curator-123',
      role: 'client',
    })

    checkSubscriptionStatus.mockResolvedValue({
      status: 'active',
      tier: 'premium',
    })

    hasActiveSubscription.mockReturnValue(true)

    render(<GlobalChatWidget />)

    await waitFor(() => {
      expect(screen.getByTestId('chat-widget')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle loading state', () => {
    mockGetUser.mockImplementation(() => new Promise(() => { })) // Never resolves

    const { container } = render(<GlobalChatWidget />)

    // Should not render while loading
    expect(container.firstChild).toBeNull()
  })

  it('should handle errors gracefully', async () => {
    mockGetUser.mockRejectedValue(new Error('Auth error'))

    getUserProfile.mockResolvedValue(null)
    hasActiveSubscription.mockReturnValue(false)

    const { container } = render(<GlobalChatWidget />)

    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })
})
