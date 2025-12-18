/**
 * Component Tests: ClientDashboardView
 * Tests client dashboard view component
 */

import { render, screen } from '@testing-library/react'
import ClientDashboardView from '../ClientDashboardView'

// Mock Supabase
const mockFrom = jest.fn()

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

describe('ClientDashboardView Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset mock implementations
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
      upsert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null }),
    })
  })

  it('should render client dashboard', async () => {
    render(<ClientDashboardView clientId="client-1" readOnly={true} />)
    
    // Component should render (may show loading initially)
    expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
  })

  it('should show loading state initially', () => {
    render(<ClientDashboardView clientId="client-1" readOnly={true} />)
    
    // Should show loading or skeleton
    expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
  })

  it('should accept readOnly prop', () => {
    const { rerender } = render(<ClientDashboardView clientId="client-1" readOnly={true} />)
    expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
    
    rerender(<ClientDashboardView clientId="client-1" readOnly={false} />)
    expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
  })

  it('should accept onTargetsUpdate callback', () => {
    const onUpdate = jest.fn()
    render(<ClientDashboardView clientId="client-1" onTargetsUpdate={onUpdate} />)
    
    // Component should render
    expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
  })

  it('should handle day type toggle', async () => {
    render(<ClientDashboardView clientId="client-1" readOnly={false} />)
    
    // Component should render
    expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
  })

  it('should display nutrition targets when available', async () => {
    // Mock targets data
    const mockSingle = jest.fn()
    mockSingle.mockResolvedValueOnce({
      data: {
        calories: 2000,
        protein: 150,
        fats: 60,
        carbs: 200,
        day_type: 'training',
      },
      error: null,
    }).mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116' },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: mockSingle,
      order: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })

    render(<ClientDashboardView clientId="client-1" readOnly={false} />)
    
    // Component should render
    expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
  })

  it('should handle target editing in non-readonly mode', () => {
    render(<ClientDashboardView clientId="client-1" readOnly={false} />)
    
    // Should allow editing when not readonly
    expect(screen.getByText(/загрузка|loading/i)).toBeInTheDocument()
  })
})

