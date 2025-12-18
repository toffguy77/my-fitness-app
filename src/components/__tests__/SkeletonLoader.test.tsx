/**
 * Tests for SkeletonLoader component
 */

import { render } from '@testing-library/react'
import SkeletonLoader from '../SkeletonLoader'

describe('SkeletonLoader', () => {
  it('renders single skeleton by default', () => {
    const { container } = render(<SkeletonLoader />)
    
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons).toHaveLength(1)
  })

  it('renders multiple skeletons when count is specified', () => {
    const { container } = render(<SkeletonLoader count={5} />)
    
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons).toHaveLength(5)
  })

  it('applies custom className', () => {
    const { container } = render(<SkeletonLoader className="h-10 w-full" />)
    
    const skeleton = container.querySelector('.animate-pulse')
    expect(skeleton).toHaveClass('h-10', 'w-full')
  })

  it('has pulse animation', () => {
    const { container } = render(<SkeletonLoader />)
    
    const skeleton = container.querySelector('.animate-pulse')
    expect(skeleton).toBeInTheDocument()
  })

  it('has default gray background', () => {
    const { container } = render(<SkeletonLoader />)
    
    const skeleton = container.querySelector('.bg-gray-200')
    expect(skeleton).toBeInTheDocument()
  })
})

