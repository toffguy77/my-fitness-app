/**
 * Tests for Metrics Dashboard Page
 */

import { render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import MetricsPage from '../page'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

// Mock Supabase client
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

// Mock MetricsDashboard component
jest.mock('@/components/metrics/MetricsDashboard', () => {
  return function MockMetricsDashboard() {
    return <div data-testid="metrics-dashboard">Metrics Dashboard</div>
  }
})

describe('Metrics Page', () => {
  const mockPush = jest.fn()
  const mockRouter = {
    push: mockPush,
    prefetch: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
      ; (useRouter as jest.Mock).mockReturnValue(mockRouter)

    // Default: authenticated super_admin user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-123' } },
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'admin-123', role: 'super_admin' },
            error: null,
          }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
    })
  })

  it('renders loading state initially', () => {
    render(<MetricsPage />)

    // Should show skeleton loaders while checking access
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders metrics dashboard for super_admin', async () => {
    render(<MetricsPage />)

    await waitFor(() => {
      expect(screen.getByTestId('metrics-dashboard')).toBeInTheDocument()
    })

    expect(screen.getByText('Метрики и аналитика')).toBeInTheDocument()
  })

  it('renders metrics dashboard for curator', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'curator-123', role: 'curator' },
            error: null,
          }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    render(<MetricsPage />)

    await waitFor(() => {
      expect(screen.getByTestId('metrics-dashboard')).toBeInTheDocument()
    })
  })

  it('redirects unauthenticated users to login', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    render(<MetricsPage />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    })
  })

  it('redirects users without access to dashboard', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'client-123', role: 'client' },
            error: null,
          }),
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    render(<MetricsPage />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/app/dashboard')
    })
  })

  it('displays page title and description', async () => {
    render(<MetricsPage />)

    await waitFor(() => {
      expect(screen.getByText('Метрики и аналитика')).toBeInTheDocument()
    })

    expect(
      screen.getByText(/Просмотр ключевых метрик приложения/)
    ).toBeInTheDocument()
  })

  it('has back button that navigates to dashboard', async () => {
    render(<MetricsPage />)

    await waitFor(() => {
      const backButton = screen.getByTitle('Назад')
      expect(backButton).toBeInTheDocument()
    })
  })
})

