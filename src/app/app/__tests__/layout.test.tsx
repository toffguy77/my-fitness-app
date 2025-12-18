/**
 * Component Tests: App Layout
 * Tests app layout rendering
 */

import { render, screen } from '@testing-library/react'
import AppLayout from '../layout'

describe('App Layout', () => {
  it('should render app layout with children', () => {
    render(
      <AppLayout>
        <div>Test Content</div>
      </AppLayout>
    )
    
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('should render multiple children', () => {
    render(
      <AppLayout>
        <div>Child 1</div>
        <div>Child 2</div>
      </AppLayout>
    )
    
    expect(screen.getByText('Child 1')).toBeInTheDocument()
    expect(screen.getByText('Child 2')).toBeInTheDocument()
  })
})

