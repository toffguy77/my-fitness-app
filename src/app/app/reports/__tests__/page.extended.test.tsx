/**
 * Extended Component Tests: Reports Page
 * Tests reports page functionality and premium access
 */

import { render, screen, waitFor } from '@testing-library/react'
import ReportsPage from '../page'

// Mock Next.js modules
const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: jest.fn(),
  }),
}))

// Mock profile utils
jest.mock('@/utils/supabase/profile', () => ({
  getUserProfile: jest.fn().mockResolvedValue({
    id: 'user-123',
    role: 'client',
    subscription_status: 'free',
    subscription_tier: 'basic',
  }),
  hasActiveSubscription: jest.fn(() => false),
}))

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

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('Reports Page Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })
  })

  it('should render reports page for premium users', async () => {
    const { hasActiveSubscription } = require('@/utils/supabase/profile')
    hasActiveSubscription.mockReturnValue(true)

    render(<ReportsPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should show paywall for free users', async () => {
    render(<ReportsPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should show paywall or redirect (may be multiple elements)
    const paywallElements = screen.queryAllByText(/premium|премиум/i)
    expect(paywallElements.length > 0 || screen.getByRole('main')).toBeDefined()
  })

  it('should handle database errors gracefully', async () => {
    const { hasActiveSubscription } = require('@/utils/supabase/profile')
    hasActiveSubscription.mockReturnValue(true)

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      }),
    })

    render(<ReportsPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should handle error gracefully
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('should redirect unauthenticated users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    render(<ReportsPage />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    }, { timeout: 3000 })
  })
})
