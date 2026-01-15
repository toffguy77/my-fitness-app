/**
 * Component Tests: Paywall
 * Tests premium feature paywall component
 */

import { render, screen } from '@testing-library/react'
import Paywall from '../Paywall'

describe('Paywall Component', () => {
  it('should render paywall message', () => {
    render(<Paywall />)

    // Check for title (more specific)
    expect(screen.getByText(/Доступно с Premium подпиской/i)).toBeInTheDocument()
  })

  it('should display return to dashboard button', () => {
    render(<Paywall />)

    const button = screen.getByRole('button', { name: /вернуться|dashboard/i })
    expect(button).toBeInTheDocument()
  })

  it('should show feature description', () => {
    render(<Paywall />)

    // Should show premium message (more specific)
    expect(screen.getByText(/Подключите работу с куратором/i)).toBeInTheDocument()
  })

  it('should accept custom title and message', () => {
    render(<Paywall title="Custom Title" message="Custom message" />)

    expect(screen.getByText('Custom Title')).toBeInTheDocument()
    expect(screen.getByText('Custom message')).toBeInTheDocument()
  })
})

