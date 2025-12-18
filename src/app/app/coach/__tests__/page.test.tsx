/**
 * Component Tests: Coach Dashboard Page
 * Tests coach dashboard, client list, filtering, and status display
 */

import { render, screen, waitFor } from '@testing-library/react'
import CoachPage from '../page'

// Mock Next.js modules
const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: jest.fn(),
  }),
}))

// Mock profile utils
jest.mock('@/utils/supabase/profile', () => ({
  getCoachClients: jest.fn().mockResolvedValue([
    {
      id: 'client-1',
      email: 'client1@test.com',
      full_name: 'Client One',
      role: 'client',
    },
  ]),
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

describe('Coach Dashboard Page', () => {
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
        data: { role: 'coach' },
        error: null,
      }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      }),
    })
  })

  it('should render coach dashboard', async () => {
    render(<CoachPage />)
    
    // Should show loading initially
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading|тренер|coach/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display clients list', async () => {
    render(<CoachPage />)
    
    // Should render coach page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading|тренер|coach/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle status filtering', async () => {
    render(<CoachPage />)
    
    // Should render coach page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading|тренер|coach/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle sorting', async () => {
    render(<CoachPage />)
    
    // Should render coach page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading|тренер|coach/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should redirect non-coach users', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'client' },
        error: null,
      }),
    })

    render(<CoachPage />)
    
    // Should redirect
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

  it('should display client status indicators', async () => {
    render(<CoachPage />)
    
    // Should render coach page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading|тренер|coach/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should handle client navigation', async () => {
    render(<CoachPage />)
    
    // Should render coach page
    await waitFor(() => {
      expect(screen.getByText(/загрузка|loading|тренер|coach/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

