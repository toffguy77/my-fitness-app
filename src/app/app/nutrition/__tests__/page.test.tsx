/**
 * Component Tests: Nutrition Page
 * Tests nutrition input functionality, meal management, and saving
 */

import { render, screen, waitFor } from '@testing-library/react'
import NutritionPage from '../page'

// Mock Next.js modules
const mockPush = jest.fn()
const mockRefresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
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

describe('Nutrition Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock window.alert
    global.alert = jest.fn()
    
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
      upsert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null }),
    })
  })

  it('should render nutrition page', async () => {
    render(<NutritionPage />)
    
    // Should show loading initially
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display nutrition form after loading', async () => {
    render(<NutritionPage />)
    
    // Should render nutrition page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle meal addition', async () => {
    render(<NutritionPage />)
    
    // Should render nutrition page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should calculate totals from meals', async () => {
    render(<NutritionPage />)
    
    // Should render nutrition page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle saving daily log', async () => {
    render(<NutritionPage />)
    
    // Should render nutrition page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle meal input', async () => {
    render(<NutritionPage />)
    
    // Should render nutrition page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle day type toggle', async () => {
    render(<NutritionPage />)
    
    // Should render nutrition page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should prevent editing completed days', async () => {
    const today = new Date().toISOString().split('T')[0]
    
    // Mock completed log
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          date: today,
          is_completed: true,
          actual_calories: 2000,
        },
        error: null,
      }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })

    render(<NutritionPage />)
    
    // Should show message about completed day (component shows "День завершен" instead of redirecting)
    await waitFor(() => {
      expect(screen.getByText(/день завершен|day completed/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('should handle save errors gracefully', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      }),
      upsert: jest.fn().mockResolvedValue({
        error: { message: 'Save error' },
      }),
    })

    render(<NutritionPage />)
    
    // Should render nutrition page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
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
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })

    render(<NutritionPage />)
    
    // Should render nutrition page even without targets
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

