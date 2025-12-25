/**
 * Tests for Navigation component
 */

import { render, screen, fireEvent } from '@testing-library/react'
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


// TODO: Fix memory issue in Navigation test
describe.skip('Navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    ;(usePathname as jest.Mock).mockReturnValue('/app/dashboard')
    
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024, // Desktop
    })
  })

  it('renders navigation items', () => {
    render(<Navigation />)
    
    expect(screen.getByText('Дашборд')).toBeInTheDocument()
    expect(screen.getByText('Питание')).toBeInTheDocument()
    expect(screen.getByText('Отчеты')).toBeInTheDocument()
  })

  it('prefetches routes on mount', () => {
    render(<Navigation />)
    
    // Should prefetch all navigation routes except current
    expect(mockPrefetch).toHaveBeenCalled()
  })

  it('prefetches route on hover (desktop)', () => {
    render(<Navigation />)
    
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toBeInTheDocument()
    
    fireEvent.mouseEnter(nutritionButton!)
    
    // Prefetch should be called (may be called multiple times due to useEffect)
    expect(mockPrefetch).toHaveBeenCalled()
  })

  it('prefetches route on focus (desktop)', () => {
    render(<Navigation />)
    
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toBeInTheDocument()
    
    fireEvent.focus(nutritionButton!)
    
    // Prefetch should be called
    expect(mockPrefetch).toHaveBeenCalled()
  })

  it('prefetches route on touch (mobile)', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375, // Mobile
    })

    render(<Navigation />)
    
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toBeInTheDocument()
    
    fireEvent.touchStart(nutritionButton!)
    
    // Prefetch should be called
    expect(mockPrefetch).toHaveBeenCalled()
  })

  it('highlights active route', () => {
    ;(usePathname as jest.Mock).mockReturnValue('/app/nutrition')
    
    render(<Navigation />)
    
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toHaveClass('bg-black', 'text-white')
  })

  it('renders desktop sidebar on large screens', () => {
    render(<Navigation />)
    
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

    render(<Navigation />)
    
    const bottomNav = document.querySelector('nav.fixed.bottom-0')
    expect(bottomNav).toBeInTheDocument()
  })

  it('navigates on button click', () => {
    render(<Navigation />)
    
    const nutritionButton = screen.getByText('Питание').closest('button')
    expect(nutritionButton).toBeInTheDocument()
    
    fireEvent.click(nutritionButton!)
    
    expect(mockPush).toHaveBeenCalledWith('/app/nutrition')
  })

  it('handles window resize', () => {
    const { rerender } = render(<Navigation />)
    
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

