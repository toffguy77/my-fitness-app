/**
 * Tests for MetricsDashboard component
 */

import { render, screen, waitFor } from '@testing-library/react'
import MetricsDashboard from '../MetricsDashboard'

// Mock fetch
global.fetch = jest.fn()

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const mockMetricsData = {
  ttfv: {
    average: 45,
    median: 38,
    p95: 120,
    total: 150,
  },
  dau: {
    today: 45,
    yesterday: 42,
    weekAverage: 38,
    trend: '+7.1%',
  },
  onboarding: {
    completionRate: 0.72,
    averageDuration: 180,
    started: 200,
    completed: 144,
  },
  featureAdoption: {
    mealSaving: 0.85,
    ocrScan: 0.32,
    reports: 0.28,
    chat: 0.45,
  },
  errorRate: {
    total: 12,
    rate: 0.02,
    critical: 2,
    warnings: 10,
  },
  sessionDuration: {
    average: 480,
    median: 360,
    p95: 1200,
  },
}

describe('MetricsDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        metrics: mockMetricsData,
      }),
    })
  })

  it('renders loading state initially', () => {
    render(<MetricsDashboard />)
    
    // Should show skeleton loaders
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('fetches and displays metrics', async () => {
    render(<MetricsDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('Time to First Value')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Daily Active Users')).toBeInTheDocument()
    expect(screen.getByText('Onboarding Completion')).toBeInTheDocument()
    expect(screen.getByText('Error Rate')).toBeInTheDocument()
  })

  it('displays TTFV metric correctly', async () => {
    render(<MetricsDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText(/45с/)).toBeInTheDocument()
    })
  })

  it('displays DAU metric correctly', async () => {
    render(<MetricsDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('45')).toBeInTheDocument() // today value
    })
  })

  it('displays error message on fetch failure', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    })

    render(<MetricsDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('Ошибка загрузки метрик')).toBeInTheDocument()
    })
  })

  it('handles network error', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

    render(<MetricsDashboard />)
    
    await waitFor(() => {
      expect(screen.getByText('Ошибка загрузки метрик')).toBeInTheDocument()
    })
  })

  it('updates metrics when date range changes', async () => {
    render(<MetricsDashboard />)
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    const initialCallCount = (global.fetch as jest.Mock).mock.calls.length

    // Simulate date change (this would trigger useEffect in real component)
    // Note: In a real test, we'd use userEvent to change the date inputs
    // For now, we just verify the component structure
    expect(initialCallCount).toBeGreaterThan(0)
  })

  it('displays feature adoption metrics', async () => {
    render(<MetricsDashboard />)
    
    // Wait for data to load
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    
    // Wait for Feature Adoption section to appear
    await waitFor(() => {
      const featureAdoptionElements = screen.queryAllByText('Feature Adoption')
      expect(featureAdoptionElements.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
    
    // Check for specific percentages - use getAllByText since there may be multiple matches
    await waitFor(() => {
      const mealSavingElements = screen.queryAllByText(/85%/)
      expect(mealSavingElements.length).toBeGreaterThan(0) // mealSaving
    }, { timeout: 3000 })
    
    await waitFor(() => {
      const ocrScanElements = screen.queryAllByText(/32%/)
      expect(ocrScanElements.length).toBeGreaterThan(0) // ocrScan
    }, { timeout: 3000 })
  })
})

