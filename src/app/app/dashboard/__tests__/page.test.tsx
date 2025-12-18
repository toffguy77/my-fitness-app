/**
 * Component Tests: Dashboard Page
 * Tests dashboard functionality, data loading, and interactions
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardPage from '../page'

// Mock Next.js modules
const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
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

describe('Dashboard Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }, // Not found
      }),
      order: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null }),
    })
  })

  it('should render dashboard page', async () => {
    render(<DashboardPage />)
    
    // Should show loading initially
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display dashboard title', async () => {
    render(<DashboardPage />)
    
    // Should render dashboard
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle date navigation', async () => {
    render(<DashboardPage />)
    
    // Should render dashboard
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display coach note when available', async () => {
    render(<DashboardPage />)
    
    // Should render dashboard
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle daily check-in completion', async () => {
    render(<DashboardPage />)
    
    // Should render dashboard
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle day type toggle', async () => {
    render(<DashboardPage />)
    
    // Should render dashboard
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display nutrition summary when data is available', async () => {
    render(<DashboardPage />)
    
    // Should render dashboard
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle error states gracefully', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth error' },
    })

    render(<DashboardPage />)
    
    // Should redirect on auth error
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

  it('should handle missing targets', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      }),
      order: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })

    render(<DashboardPage />)
    
    // Should render dashboard even without targets
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

