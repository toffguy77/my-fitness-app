/**
 * Tests for LoadingSpinner component
 */

import { render } from '@testing-library/react'
import LoadingSpinner from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders with default size and color', () => {
    const { container } = render(<LoadingSpinner />)
    
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveClass('h-4', 'w-4', 'text-gray-500')
  })

  it('renders with custom size', () => {
    const { container } = render(<LoadingSpinner size="lg" />)
    
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toHaveClass('h-6', 'w-6')
  })

  it('renders with custom color', () => {
    const { container } = render(<LoadingSpinner color="primary" />)
    
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toHaveClass('text-blue-500')
  })

  it('renders with custom className', () => {
    const { container } = render(<LoadingSpinner className="custom-class" />)
    
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toHaveClass('custom-class')
  })

  it('renders with all size variants', () => {
    const sizes = ['sm', 'default', 'lg', 'xl'] as const
    
    sizes.forEach(size => {
      const { container } = render(<LoadingSpinner size={size} />)
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })

  it('renders with all color variants', () => {
    const colors = ['default', 'primary', 'secondary', 'white'] as const
    
    colors.forEach(color => {
      const { container } = render(<LoadingSpinner color={color} />)
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })
})

