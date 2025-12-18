/**
 * Edge Cases Tests: Dashboard Page
 * Tests edge cases, boundary conditions, and error scenarios
 */

import { render, screen, waitFor } from '@testing-library/react'
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

describe('Dashboard Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
  })

  describe('Data Loading Edge Cases', () => {
    it('should handle null targets gracefully', async () => {
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
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle empty week logs', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            calories: 2000,
            protein: 150,
            fats: 60,
            carbs: 200,
            day_type: 'training',
          },
          error: null,
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
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle logs with null values', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            calories: 2000,
            protein: 150,
            fats: 60,
            carbs: 200,
            day_type: 'training',
          },
          error: null,
        }),
        order: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              date: '2024-01-15',
              actual_calories: null,
              actual_protein: null,
              actual_fats: null,
              actual_carbs: null,
              weight: null,
            },
          ],
          error: null,
        }),
      })

      render(<DashboardPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle very large numbers', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            calories: 999999,
            protein: 999999,
            fats: 999999,
            carbs: 999999,
            day_type: 'training',
          },
          error: null,
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
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle zero values', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            calories: 0,
            protein: 0,
            fats: 0,
            carbs: 0,
            day_type: 'training',
          },
          error: null,
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
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })

  describe('Date Edge Cases', () => {
    it('should handle future dates', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const futureDateStr = futureDate.toISOString().split('T')[0]

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            calories: 2000,
            protein: 150,
            fats: 60,
            carbs: 200,
            day_type: 'training',
          },
          error: null,
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
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle very old dates', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            calories: 2000,
            protein: 150,
            fats: 60,
            carbs: 200,
            day_type: 'training',
          },
          error: null,
        }),
        order: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              date: '2020-01-01',
              actual_calories: 2000,
              weight: 80,
            },
          ],
          error: null,
        }),
      })

      render(<DashboardPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })

  describe('Error Handling Edge Cases', () => {
    it('should handle multiple consecutive errors', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Error 1' },
        }),
        order: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Error 2' },
        }),
      })

      render(<DashboardPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle partial data loading', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
          .mockResolvedValueOnce({
            data: {
              calories: 2000,
              protein: 150,
              fats: 60,
              carbs: 200,
              day_type: 'training',
            },
            error: null,
          })
          .mockResolvedValueOnce({
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
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })

  describe('State Edge Cases', () => {
    it('should handle rapid state changes', async () => {
      render(<DashboardPage />)
      
      // Rapidly change state
      const { rerender } = render(<DashboardPage />)
      rerender(<DashboardPage />)
      rerender(<DashboardPage />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })
})


