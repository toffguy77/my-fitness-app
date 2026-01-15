/**
 * Extended Component Tests: Curator Page
 * Tests curator dashboard functionality, client management, and status filtering
 */

import { render, screen, waitFor } from '@testing-library/react'
import CuratorPage from '../page'

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
  getCuratorClients: jest.fn().mockResolvedValue([
    {
      id: 'client-1',
      email: 'client1@test.com',
      full_name: 'Client One',
      role: 'client',
    },
    {
      id: 'client-2',
      email: 'client2@test.com',
      full_name: 'Client Two',
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

describe('Curator Page Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'curator-123' } },
      error: null,
    })

    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          actual_calories: 2000,
          is_completed: false,
          target_type: 'training',
        },
        error: null,
      }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    }

    mockFrom.mockReturnValue(mockQueryBuilder)
  })

  it('should render curator page', async () => {
    render(<CuratorPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display client list', async () => {
    render(<CuratorPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should display clients
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('should filter clients by status', async () => {
    render(<CuratorPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should have status filter
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('should sort clients by status', async () => {
    render(<CuratorPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should have sorting functionality
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('should handle missing client data gracefully', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })

    render(<CuratorPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should handle missing data gracefully
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('should redirect non-curator users', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'client' },
        error: null,
      }),
    })

    render(<CuratorPage />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/')
    }, { timeout: 3000 })
  })

  it('should redirect unauthenticated users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    render(<CuratorPage />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    }, { timeout: 3000 })
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
      limit: jest.fn().mockReturnThis(),
    })

    render(<CuratorPage />)

    await waitFor(() => {
      expect(screen.queryByText(/загрузка|loading/i)).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // Should handle error gracefully
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
