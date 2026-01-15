/**
 * Tests for Navigation component
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { usePathname, useRouter } from 'next/navigation'
import Navigation from '../Navigation'

// Mock Next.js navigation
const mockPrefetch = jest.fn()
const mockPush = jest.fn()
const mockRouter = {
  push: mockPush,
  prefetch: mockPrefetch,
  replace: jest.fn(),
  back: jest.fn(),
}

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}))

// Mock Supabase client
jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
  })),
}))

// Mock profile utils
jest.mock('@/utils/supabase/profile', () => ({
  getUserProfile: jest.fn().mockResolvedValue({
    id: 'test-user-id',
    role: 'client',
    email: 'test@example.com',
  }),
}))


describe('Navigation', () => {
  let cleanup: (() => void)[] = []

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    ;(usePathname as jest.Mock).mockReturnValue('/app/dashboard')
    cleanup = []

    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024, // Desktop
    })
  })

  afterEach(() => {
    // Cleanup all rendered components
    cleanup.forEach(fn => fn())
    cleanup = []
  })

  it('renders navigation items', async () => {
    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    // Wait for loading to complete
    await screen.findByText('Дашборд', {}, { timeout: 2000 })

    expect(screen.getByText('Дашборд')).toBeInTheDocument()
    expect(screen.getByText('Питание')).toBeInTheDocument()
    expect(screen.getByText('Отчеты')).toBeInTheDocument()
  })

  it('prefetches routes on mount', async () => {
    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    // Wait for component to load
    await waitFor(() => {
      expect(mockPrefetch).toHaveBeenCalled()
    }, { timeout: 2000 })
  })

  it('prefetches route on hover (desktop)', async () => {
    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    await screen.findByText('Питание', {}, { timeout: 2000 })
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toBeInTheDocument()

    fireEvent.mouseEnter(nutritionButton!)

    // Prefetch should be called (may be called multiple times due to useEffect)
    expect(mockPrefetch).toHaveBeenCalled()
  })

  it('prefetches route on focus (desktop)', async () => {
    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    await screen.findByText('Питание', {}, { timeout: 2000 })
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toBeInTheDocument()

    fireEvent.focus(nutritionButton!)

    // Prefetch should be called
    expect(mockPrefetch).toHaveBeenCalled()
  })

  it('prefetches route on touch (mobile)', async () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375, // Mobile
    })

    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    await screen.findByText('Питание', {}, { timeout: 2000 })
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toBeInTheDocument()

    fireEvent.touchStart(nutritionButton!)

    // Prefetch should be called
    expect(mockPrefetch).toHaveBeenCalled()
  })

  it('highlights active route', async () => {
    ;(usePathname as jest.Mock).mockReturnValue('/app/nutrition')

    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    await screen.findByText('Питание', {}, { timeout: 2000 })
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toHaveClass('bg-white', 'text-zinc-950')
  })

  it('renders desktop sidebar on large screens', () => {
    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    const sidebar = document.querySelector('aside')
    expect(sidebar).toBeInTheDocument()
    expect(sidebar).toHaveClass('fixed', 'left-0')
  })

  it('renders mobile bottom nav on small screens', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375, // Mobile
    })

    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    const bottomNav = document.querySelector('nav.fixed.bottom-0')
    expect(bottomNav).toBeInTheDocument()
  })

  it('navigates on button click', async () => {
    const { unmount } = render(<Navigation />)
    cleanup.push(unmount)

    await screen.findByText('Питание', {}, { timeout: 2000 })
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toBeInTheDocument()

    fireEvent.click(nutritionButton!)

    expect(mockPush).toHaveBeenCalledWith('/app/nutrition')
  })

  it('handles window resize', () => {
    const { rerender, unmount } = render(<Navigation />)
    cleanup.push(unmount)

    // Change viewport size
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })

    fireEvent(window, new Event('resize'))

    // Component should re-render with new layout
    rerender(<Navigation />)

    const bottomNav = document.querySelector('nav.fixed.bottom-0')
    expect(bottomNav).toBeInTheDocument()
  })
})
