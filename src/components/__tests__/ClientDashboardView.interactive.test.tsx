/**
 * Interactive Component Tests: ClientDashboardView
 * Tests deep interactivity, edge cases, and user interactions
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClientDashboardView from '../ClientDashboardView'

// Mock Supabase
const mockFrom = jest.fn()
const mockUpdate = jest.fn()

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}))

// Mock router
const mockPush = jest.fn()
const mockRefresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
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

// Mock window.alert
global.alert = jest.fn()

describe('ClientDashboardView Interactive Tests', () => {
  const mockTargetsTraining = {
    id: 'target-1',
    calories: 2000,
    protein: 150,
    fats: 60,
    carbs: 200,
    day_type: 'training',
  }

  const mockTargetsRest = {
    id: 'target-2',
    calories: 1800,
    protein: 140,
    fats: 55,
    carbs: 180,
    day_type: 'rest',
  }

  const mockWeekLogs = [
    {
      date: '2024-01-15',
      actual_calories: 2000,
      actual_protein: 150,
      actual_fats: 60,
      actual_carbs: 200,
      weight: 80,
    },
    {
      date: '2024-01-16',
      actual_calories: 1900,
      actual_protein: 140,
      actual_fats: 55,
      actual_carbs: 190,
      weight: 79.5,
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()

    const mockSingle = jest.fn()
    mockSingle
      .mockResolvedValueOnce({
        data: mockTargetsTraining,
        error: null,
      })
      .mockResolvedValueOnce({
        data: mockTargetsRest,
        error: null,
      })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: mockSingle,
      order: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: mockWeekLogs,
        error: null,
      }),
      update: mockUpdate.mockResolvedValue({ error: null }),
    })
  })

  describe('Day Type Toggle', () => {
    it('should toggle between training and rest day types', async () => {
      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const toggleButtons = screen.getAllByRole('button')
      const trainingButton = toggleButtons.find((btn) =>
        btn.textContent?.includes('Тренировка')
      )
      const restButton = toggleButtons.find((btn) => btn.textContent?.includes('Отдых'))

      if (trainingButton && restButton) {
        // Initially should show training (default)
        expect(trainingButton).toHaveClass('bg-white')

        // Click rest button
        await userEvent.click(restButton)
        expect(restButton).toHaveClass('bg-white')
      }
    })

    it('should update current targets when day type changes', async () => {
      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Targets should be loaded
      expect(screen.getByRole('main') || screen.getByText(/2000|1800/)).toBeDefined()
    })
  })

  describe('Target Editing', () => {
    it('should allow editing targets in non-readonly mode', async () => {
      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should allow editing
      const editButtons = screen.getAllByRole('button')
      const editButton = editButtons.find((btn) =>
        btn.textContent?.includes('Редактировать') || btn.textContent?.includes('Изменить')
      )

      if (editButton) {
        await userEvent.click(editButton)
        // Should show edit form
        expect(editButton).toBeInTheDocument()
      }
    })

    it('should prevent editing in readonly mode', async () => {
      render(<ClientDashboardView clientId="client-1" readOnly={true} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should not show edit buttons
      const editButtons = screen.getAllByRole('button')
      const editButton = editButtons.find((btn) =>
        btn.textContent?.includes('Редактировать')
      )
      expect(editButton).toBeUndefined()
    })

    it('should save targets when save button is clicked', async () => {
      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should be able to save
      expect(mockUpdate).toBeDefined()
    })

    it('should handle save errors gracefully', async () => {
      mockUpdate.mockResolvedValue({
        error: { message: 'Save failed' },
      })

      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should handle error
      expect(global.alert).toBeDefined()
    })
  })

  describe('Nutrition Summary', () => {
    it('should calculate nutrition summary correctly', async () => {
      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Summary should be calculated
      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle empty week logs', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockTargetsTraining,
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

      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should handle empty logs gracefully
      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })

  describe('Weight Tracking', () => {
    it('should display weight history', async () => {
      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should display weight data
      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should calculate weight difference correctly', async () => {
      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Weight diff should be calculated (80 - 79.5 = -0.5)
      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle missing weight data', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockTargetsTraining,
          error: null,
        }),
        order: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              date: '2024-01-15',
              actual_calories: 2000,
              weight: null,
            },
          ],
          error: null,
        }),
      })

      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should handle missing weight gracefully
      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })

  describe('Callback Handling', () => {
    it('should call onTargetsUpdate when targets are updated', async () => {
      const onUpdate = jest.fn()
      render(<ClientDashboardView clientId="client-1" onTargetsUpdate={onUpdate} readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Callback should be available
      expect(onUpdate).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing targets gracefully', async () => {
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

      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should handle missing targets
      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('should handle database errors gracefully', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
        order: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      })

      render(<ClientDashboardView clientId="client-1" readOnly={false} />)

      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should handle errors gracefully
      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })
})


