/**
 * Component Tests: Skeleton
 * Tests skeleton loading components
 */

import { render, screen } from '@testing-library/react'
import Skeleton, { ProductCardSkeleton, MessageSkeleton } from '../ui/Skeleton'

describe('Skeleton Component', () => {
  it('should render skeleton with default props', () => {
    const { container } = render(<Skeleton />)
    const skeleton = container.querySelector('.animate-pulse')
    expect(skeleton).toBeInTheDocument()
  })

  it('should render skeleton with custom className', () => {
    const { container } = render(<Skeleton className="custom-class" />)
    const skeleton = container.querySelector('.custom-class')
    expect(skeleton).toBeInTheDocument()
  })

  it('should render skeleton with custom width and height', () => {
    const { container } = render(<Skeleton width="100px" height="50px" />)
    const skeleton = container.querySelector('.animate-pulse')
    expect(skeleton).toHaveStyle({ width: '100px', height: '50px' })
  })

  it('should render ProductCardSkeleton', () => {
    const { container } = render(<ProductCardSkeleton />)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('should render MessageSkeleton', () => {
    const { container } = render(<MessageSkeleton />)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})

