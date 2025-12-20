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
    expect(spinner).toHaveClass('w-6', 'h-6', 'border-2')
  })

  it('renders with custom size', () => {
    const { container } = render(<LoadingSpinner size="lg" />)
    
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toHaveClass('w-8', 'h-8', 'border-3')
  })

  it('renders with custom color', () => {
    const { container } = render(<LoadingSpinner className="text-blue-500" />)
    
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toHaveClass('text-blue-500')
  })

  it('renders with custom className', () => {
    const { container } = render(<LoadingSpinner className="custom-class" />)
    
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toHaveClass('custom-class')
  })

  it('renders with all size variants', () => {
    const sizes = ['sm', 'md', 'lg'] as const
    
    sizes.forEach(size => {
      const { container } = render(<LoadingSpinner size={size} />)
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })
})

