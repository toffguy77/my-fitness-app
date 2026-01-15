/**
 * Component Tests: Settings Page
 * Tests settings page functionality
 */

import { render, screen } from '@testing-library/react'
import SettingsPage from '../page'

// Mock Next.js modules
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}))

// Mock Supabase
const mockGetUser = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    from: mockFrom,
  })),
}))

// Setup default mocks
beforeEach(() => {
  jest.clearAllMocks()

  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-123' } },
    error: null,
  })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'nutrition_targets') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }, // Not found
        }),
      }
    }
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'user-123',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'client',
          subscription_status: 'free',
        },
        error: null,
      }),
      update: jest.fn().mockResolvedValue({ error: null }),
    }
  })
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

// Mock getUserProfile and checkSubscriptionStatus
jest.mock('@/utils/supabase/profile', () => ({
  getUserProfile: jest.fn().mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'client',
    subscription_status: 'free',
  }),
  hasActiveSubscription: jest.fn().mockReturnValue(false),
}))

jest.mock('@/utils/supabase/subscription', () => ({
  checkSubscriptionStatus: jest.fn().mockResolvedValue({
    status: 'free',
    isExpired: false,
    endDate: null,
  }),
}))

describe('Settings Page', () => {
  it('should render settings page', async () => {
    render(<SettingsPage />)

    // Should show settings title
    await screen.findByText(/настройки|settings/i, {}, { timeout: 5000 })
  })

  it('should display user profile information', async () => {
    render(<SettingsPage />)

    // Should show email or name
    await screen.findByText(/test@example.com|Test User/i, {}, { timeout: 5000 })
  })
})
