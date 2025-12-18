/**
 * Component Tests: Reports Page
 * Tests reports page (Premium feature)
 */

import { render, screen } from '@testing-library/react'
import ReportsPage from '../page'

// Mock Next.js modules
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
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
jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
      single: jest.fn().mockResolvedValue({
        data: {
          role: 'client',
          subscription_status: 'free',
          subscription_tier: 'basic',
        },
        error: null,
      }),
    })),
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

describe('Reports Page', () => {
  it('should render reports page', async () => {
    render(<ReportsPage />)
    
    // Should show reports or paywall
    await screen.findByText(/отчеты|reports|premium|премиум/i, {}, { timeout: 3000 })
  })

  it('should show paywall for free users', async () => {
    render(<ReportsPage />)
    
    // Should show paywall message (from custom title prop)
    await screen.findByText(/Отчеты доступны с Premium подпиской/i, {}, { timeout: 3000 })
  })
})

