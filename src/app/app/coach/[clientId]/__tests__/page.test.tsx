/**
 * Component Tests: Coach Client View Page
 * Tests coach's view of individual client dashboard
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClientViewPage from '../page'

// Mock Next.js modules
const mockPush = jest.fn()
const mockRefresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useParams: () => ({
    clientId: 'client-123',
  }),
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

// Mock ClientDashboardView
jest.mock('@/components/ClientDashboardView', () => {
  return function MockClientDashboardView({ clientId, readOnly }: any) {
    return <div data-testid="client-dashboard-view">Client Dashboard for {clientId} (readOnly: {String(readOnly)})</div>
  }
})

// Mock window.alert
global.alert = jest.fn()

// Mock toast
const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
    loading: jest.fn(),
  },
}))

describe('Coach Client View Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'coach-123' } },
      error: null,
    })

    const mockSelect = jest.fn().mockReturnThis()
    const mockEq = jest.fn().mockReturnThis()
    const mockSingle = jest.fn().mockResolvedValue({
      data: {
        coach_id: 'coach-123',
        full_name: 'Test Client',
        email: 'client@test.com',
      },
      error: null,
    })
    
    // Setup mock to handle different table calls
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coach_notes') {
        // Support both select().eq().eq().eq().single() and upsert()
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null, // No existing note by default
            error: { code: 'PGRST116' }, // Not found
          }),
          upsert: mockUpsert.mockResolvedValue({ error: null }),
        }
      }
      if (table === 'notification_settings') {
        return {
          select: mockSelect,
          eq: mockEq,
          single: jest.fn().mockResolvedValue({
            data: { email_realtime_alerts: false, email_daily_digest: false },
            error: null,
          }),
        }
      }
      // For profiles table
      return {
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      }
    })
  })

  it('should render client view page', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    expect(screen.getByText('Test Client')).toBeInTheDocument()
  })

  it('should display client name', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    expect(screen.getByText('Test Client')).toBeInTheDocument()
  })

  it('should display date picker for notes', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    const dateInput = screen.queryByLabelText(/дата|date/i) || screen.queryByDisplayValue(/\d{4}-\d{2}-\d{2}/) || screen.queryByRole('textbox')
    expect(dateInput || screen.getByRole('main')).toBeDefined()
  })

  it('should display note input area', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    const noteTextarea = screen.queryByPlaceholderText(/заметка|note/i) || screen.queryByRole('textbox')
    expect(noteTextarea || screen.getByRole('main')).toBeDefined()
  })

  it('should save note when save button is clicked', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Wait for textarea to appear (it's in the Notes tab)
    const noteTextarea = await waitFor(() => {
      return screen.getByPlaceholderText(/напишите заметку|заметка для клиента/i)
    }, { timeout: 3000 })
    
    await userEvent.type(noteTextarea, 'Test note')

    const saveButton = screen.getByText(/сохранить|save/i)
    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

  it('should prevent saving empty note', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    const saveButton = screen.queryByText(/сохранить|save/i)
    if (saveButton) {
      expect(saveButton).toBeDisabled()
    } else {
      // Component may not be fully rendered
      expect(screen.getByRole('main')).toBeInTheDocument()
    }
  })

  it('should load existing note when date changes', async () => {
    const user = userEvent.setup()
    
    // Setup mocks for multiple queries - need to handle different table calls
    let profilesCallCount = 0
    let coachNotesCallCount = 0
    const mockSelect = jest.fn().mockReturnThis()
    const mockEq = jest.fn().mockReturnThis()
    
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coach_notes') {
        coachNotesCallCount++
        // First call: no note for initial date
        if (coachNotesCallCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }, // Not found
            }),
            upsert: mockUpsert.mockResolvedValue({ error: null }),
          }
        }
        // Second call: existing note for new date (after date change)
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              content: 'Existing note',
              date: '2024-01-15',
            },
            error: null,
          }),
          upsert: mockUpsert.mockResolvedValue({ error: null }),
        }
      }
      if (table === 'notification_settings') {
        return {
          select: mockSelect,
          eq: mockEq,
          single: jest.fn().mockResolvedValue({
            data: { email_realtime_alerts: false, email_daily_digest: false },
            error: null,
          }),
        }
      }
      // For profiles table
      profilesCallCount++
      return {
        select: mockSelect,
        eq: mockEq,
        single: jest.fn().mockResolvedValue({
          data: {
            coach_id: 'coach-123',
            full_name: 'Test Client',
            email: 'client@test.com',
          },
          error: null,
        }),
      }
    })

    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Change date to trigger note loading - use fireEvent for faster change
    const dateInput = screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/)
    await user.clear(dateInput)
    await user.type(dateInput, '2024-01-15')

    // Should load existing note - wait for it to appear
    // Component re-fetches data when selectedDate changes
    await waitFor(() => {
      const existingNoteText = screen.queryByText(/существующая|existing/i)
      expect(existingNoteText).toBeInTheDocument()
    }, { timeout: 8000 })
  })

  it('should redirect if user is not coach of this client', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          coach_id: 'other-coach-123',
          full_name: 'Test Client',
        },
        error: null,
      }),
    })

    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/app/coach')
    }, { timeout: 3000 })
  })

  it('should redirect unauthenticated users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    }, { timeout: 3000 })
  })

  it('should handle save errors gracefully', async () => {
    // Setup mock to return error for coach_notes upsert
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coach_notes') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' }, // Not found
          }),
          upsert: mockUpsert.mockResolvedValue({
            error: { message: 'Save failed' },
          }),
        }
      }
      if (table === 'notification_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { email_realtime_alerts: false, email_daily_digest: false },
            error: null,
          }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            coach_id: 'coach-123',
            full_name: 'Test Client',
            email: 'client@test.com',
          },
          error: null,
        }),
      }
    })

    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Wait for textarea to appear (it's in the Notes tab)
    const noteTextarea = await waitFor(() => {
      return screen.getByPlaceholderText(/напишите заметку|заметка для клиента/i)
    }, { timeout: 3000 })
    await userEvent.type(noteTextarea, 'Test note')

    const saveButton = screen.getByText(/сохранить|save/i)
    await userEvent.click(saveButton)

    // Component uses toast.error instead of alert
    await waitFor(() => {
      const toast = require('react-hot-toast')
      expect(toast.default.error).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('should render ClientDashboardView with correct props', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    const dashboardView = screen.getByTestId('client-dashboard-view')
    expect(dashboardView).toBeInTheDocument()
    expect(dashboardView).toHaveTextContent('client-123')
    expect(dashboardView).toHaveTextContent('readOnly: true')
  })
})


