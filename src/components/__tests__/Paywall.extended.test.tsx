/**
 * Extended Component Tests: Paywall
 * Tests paywall component with custom props and interactions
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Paywall from '../Paywall'

// Mock window.location
const mockLocation = {
  href: '',
}

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
})

describe('Paywall Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLocation.href = ''
  })

  it('should render with custom title', () => {
    render(<Paywall title="Custom Title" />)
    
    expect(screen.getByText('Custom Title')).toBeInTheDocument()
  })

  it('should render with custom message', () => {
    const customMessage = 'Custom message for premium feature'
    render(<Paywall message={customMessage} />)
    
    expect(screen.getByText(customMessage)).toBeInTheDocument()
  })

  it('should render default title when not provided', () => {
    render(<Paywall />)
    
    expect(screen.getByText('Доступно с Premium подпиской')).toBeInTheDocument()
  })

  it('should render default message when not provided', () => {
    render(<Paywall />)
    
    expect(screen.getByText(/Подключите работу с тренером/)).toBeInTheDocument()
  })

  it('should render lock icon', () => {
    render(<Paywall />)
    
    // Lock icon should be present (lucide-react icon)
    const lockIcon = screen.getByRole('img', { hidden: true }) || 
                     document.querySelector('svg')
    expect(lockIcon || screen.getByText(/lock/i)).toBeDefined()
  })

  it('should render admin contact message', () => {
    render(<Paywall />)
    
    expect(screen.getByText(/Для активации Premium подписки/)).toBeInTheDocument()
  })

  it('should navigate to dashboard when button is clicked', async () => {
    render(<Paywall />)
    
    const button = screen.getByText(/Вернуться на дашборд/i)
    await userEvent.click(button)
    
    expect(mockLocation.href).toBe('/app/dashboard')
  })

  it('should render blurred content area', () => {
    render(<Paywall />)
    
    const blurredContent = document.querySelector('.blur-sm')
    expect(blurredContent).toBeInTheDocument()
  })

  it('should render overlay with white background', () => {
    render(<Paywall />)
    
    const overlay = document.querySelector('.bg-white')
    expect(overlay).toBeInTheDocument()
  })
})

