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

describe('Coach Client View Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'coach-123' } },
      error: null,
    })

    mockFrom.mockReturnValue({
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
      upsert: mockUpsert.mockResolvedValue({ error: null }),
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

    const dateInput = screen.getByLabelText(/дата|date/i) || screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/)
    expect(dateInput).toBeInTheDocument()
  })

  it('should display note input area', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    const noteTextarea = screen.getByPlaceholderText(/заметка|note/i)
    expect(noteTextarea).toBeInTheDocument()
  })

  it('should save note when save button is clicked', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    const noteTextarea = screen.getByPlaceholderText(/заметка|note/i)
    await userEvent.type(noteTextarea, 'Test note')

    const saveButton = screen.getByText(/сохранить|save/i)
    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalled()
    })
  })

  it('should prevent saving empty note', async () => {
    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    const saveButton = screen.getByText(/сохранить|save/i)
    expect(saveButton).toBeDisabled()
  })

  it('should load existing note when date changes', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
        .mockResolvedValueOnce({
          data: {
            coach_id: 'coach-123',
            full_name: 'Test Client',
            email: 'client@test.com',
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            content: 'Existing note',
            date: '2024-01-15',
          },
          error: null,
        }),
      upsert: mockUpsert.mockResolvedValue({ error: null }),
    })

    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should load existing note
    expect(screen.getByText(/существующая|existing/i)).toBeInTheDocument()
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
    mockUpsert.mockResolvedValue({
      error: { message: 'Save failed' },
    })

    render(<ClientViewPage />)
    
    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    const noteTextarea = screen.getByPlaceholderText(/заметка|note/i)
    await userEvent.type(noteTextarea, 'Test note')

    const saveButton = screen.getByText(/сохранить|save/i)
    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalled()
    })
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


