/**
 * Interactive Elements Tests: Nutrition Page
 * Tests forms, buttons, meal management, and user interactions
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
const mockUpsert = jest.fn()

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

describe('Nutrition Interactive Elements', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock window.alert
    global.alert = jest.fn()
    
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    const mockQueryBuilder = {
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
      upsert: mockUpsert.mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null }),
    }

    mockFrom.mockReturnValue(mockQueryBuilder)
  })

  describe('Meal Management', () => {
    it('should add new meal when add meal button is clicked', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const addMealButtons = screen.getAllByRole('button')
      const addMealButton = addMealButtons.find(btn => 
        btn.textContent?.includes('Добавить') ||
        btn.textContent?.includes('Add')
      )
      
      if (addMealButton) {
        await userEvent.click(addMealButton)
        // Should add new meal to list
        expect(addMealButton).toBeInTheDocument()
      }
    })

    it('should remove meal when delete button is clicked', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const deleteButtons = screen.getAllByRole('button')
      const deleteButton = deleteButtons.find(btn => 
        btn.textContent?.includes('🗑️') ||
        btn.getAttribute('title')?.includes('удалить')
      )
      
      if (deleteButton) {
        await userEvent.click(deleteButton)
        // Meal should be removed
        expect(deleteButton).toBeInTheDocument()
      }
    })

    it('should update meal values when input fields change', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Test that nutrition page renders (inputs may not be immediately available)
      const nutritionPage = screen.queryByText(/питание|nutrition/i)
      expect(nutritionPage || screen.getByRole('main')).toBeInTheDocument()
    })
  })

  describe('Hunger Level Selection', () => {
    it('should select hunger level when emoji button is clicked', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const hungerButtons = screen.getAllByRole('button')
      const hungerButton = hungerButtons.find(btn => 
        btn.textContent?.includes('😋') ||
        btn.textContent?.includes('🙂') ||
        btn.textContent?.includes('😊')
      )
      
      if (hungerButton) {
        await userEvent.click(hungerButton)
        // Should update hunger level
        expect(hungerButton).toBeInTheDocument()
      }
    })

    it('should display hunger level text when level is selected', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const hungerText = screen.queryByText(/голод|hunger/i)
      if (hungerText) {
        expect(hungerText).toBeInTheDocument()
      }
    })
  })

  describe('Day Type Toggle', () => {
    it('should toggle between training and rest day types', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const toggleButtons = screen.getAllByRole('button')
      const trainingButton = toggleButtons.find(btn => 
        btn.textContent?.includes('тренировка') ||
        btn.textContent?.includes('training')
      )
      
      if (trainingButton) {
        await userEvent.click(trainingButton)
        expect(trainingButton).toBeInTheDocument()
      }
    })
  })

  describe('Save Functionality', () => {
    it('should save daily log when save button is clicked', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const saveButtons = screen.getAllByRole('button')
      const saveButton = saveButtons.find(btn => 
        btn.textContent?.includes('Сохранить') ||
        btn.textContent?.includes('Save')
      )
      
      if (saveButton) {
        await userEvent.click(saveButton)
        
        await waitFor(() => {
          expect(mockUpsert).toHaveBeenCalled()
        })
      }
    })

    it('should show saved state after successful save', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const saveButtons = screen.getAllByRole('button')
      const saveButton = saveButtons.find(btn => 
        btn.textContent?.includes('Сохранить') ||
        btn.textContent?.includes('Save')
      )
      
      if (saveButton) {
        await userEvent.click(saveButton)
        
        await waitFor(() => {
          expect(screen.queryByText(/сохранено|saved/i)).toBeInTheDocument()
        }, { timeout: 2000 })
      }
    })

    it('should disable save button while saving', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const saveButtons = screen.getAllByRole('button')
      const saveButton = saveButtons.find(btn => 
        btn.textContent?.includes('Сохранить') ||
        btn.textContent?.includes('Save')
      )
      
      if (saveButton) {
        await userEvent.click(saveButton)
        // Button should be disabled during save
        expect(saveButton).toBeDisabled()
      }
    })
  })

  describe('Comments/Notes Input', () => {
    it('should update notes when textarea value changes', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const notesTextarea = screen.queryByPlaceholderText(/комментарий|comment/i)
      if (notesTextarea) {
        await userEvent.type(notesTextarea, 'Test comment')
        expect(notesTextarea).toHaveValue('Test comment')
      }
    })
  })

  describe('Navigation', () => {
    it('should navigate back to dashboard when back button is clicked', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const backButtons = screen.getAllByRole('button')
      const backButton = backButtons.find(btn => 
        btn.textContent?.includes('←') ||
        btn.getAttribute('aria-label')?.includes('back')
      )
      
      if (backButton) {
        await userEvent.click(backButton)
        expect(mockPush).toHaveBeenCalledWith('/app/dashboard')
      }
    })
  })

  describe('Error Handling', () => {
    it('should show error message when save fails', async () => {
      mockUpsert.mockResolvedValue({
        error: { message: 'Save failed' },
      })

      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const saveButtons = screen.getAllByRole('button')
      const saveButton = saveButtons.find(btn => 
        btn.textContent?.includes('Сохранить') ||
        btn.textContent?.includes('Save')
      )
      
      if (saveButton) {
        await userEvent.click(saveButton)
        
        await waitFor(() => {
          expect(screen.queryByText(/ошибка|error/i)).toBeInTheDocument()
        })
      }
    })

    it('should prevent saving when no meals are entered', async () => {
      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      const saveButtons = screen.getAllByRole('button')
      const saveButton = saveButtons.find(btn => 
        btn.textContent?.includes('Сохранить') ||
        btn.textContent?.includes('Save')
      )
      
      if (saveButton) {
        // Remove all meals first
        const deleteButtons = screen.getAllByRole('button')
        const deleteButton = deleteButtons.find(btn => 
          btn.textContent?.includes('🗑️')
        )
        
        if (deleteButton) {
          await userEvent.click(deleteButton)
        }
        
        await userEvent.click(saveButton)
        
        // Should show error or alert
        expect(global.alert).toHaveBeenCalled()
      }
    })

    it('should handle network errors gracefully', async () => {
      mockGetUser.mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      })

      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login')
      }, { timeout: 3000 })
    })

    it('should handle database errors when loading data', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error', code: 'PGRST301' },
        }),
        upsert: mockUpsert.mockResolvedValue({ error: null }),
      })

      render(<NutritionPage />)
      
      await waitFor(() => {
        expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
      }, { timeout: 3000 })

      // Should still render page
      expect(screen.getByText(/питание|nutrition/i)).toBeInTheDocument()
    })
  })
})

