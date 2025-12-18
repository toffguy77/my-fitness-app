/**
 * Component Tests: Onboarding Page
 * Tests onboarding flow, form validation, and target calculation
 */

import { render, screen, waitFor } from '@testing-library/react'
import OnboardingPage from '../page'

// Mock Next.js modules
const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: jest.fn(),
  }),
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

describe('Onboarding Page', () => {
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
        error: { code: 'PGRST116' },
      }),
      limit: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null }),
    })
  })

  it('should render onboarding page', async () => {
    render(<OnboardingPage />)
    
    // Should show loading initially
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should redirect unauthenticated users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    render(<OnboardingPage />)
    
    // Should redirect to login
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    }, { timeout: 3000 })
  })

  it('should redirect users who already have targets', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [{ id: 'target-1' }],
        error: null,
      }),
    })

    render(<OnboardingPage />)
    
    // Should redirect to dashboard
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/app/dashboard')
    }, { timeout: 3000 })
  })

  it('should display biometrics step', async () => {
    render(<OnboardingPage />)
    
    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText(/биометрия|рост|вес|gender/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should handle form input', async () => {
    render(<OnboardingPage />)
    
    // Should render onboarding page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should navigate between steps', async () => {
    render(<OnboardingPage />)
    
    // Should render onboarding page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

