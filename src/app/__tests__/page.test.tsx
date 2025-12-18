/**
 * Component Tests: Landing Page
 * Tests landing page rendering and navigation
 */

import { render, screen } from '@testing-library/react'
import LandingPage from '../page'

// Mock Next.js Link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>
  }
})

describe('Landing Page', () => {
  it('should render landing page with hero section', () => {
    render(<LandingPage />)
    
    expect(screen.getByText(/Твое тело — это математика/i)).toBeInTheDocument()
    expect(screen.getByText(/Начать бесплатно/i)).toBeInTheDocument()
  })

  it('should have link to registration', () => {
    render(<LandingPage />)
    
    const registerLink = screen.getByRole('link', { name: /Начать бесплатно/i })
    expect(registerLink).toHaveAttribute('href', '/register')
  })

  it('should display problem section', () => {
    render(<LandingPage />)
    
    expect(screen.getByText(/Почему ты срываешься/i)).toBeInTheDocument()
  })

  it('should display solution section', () => {
    render(<LandingPage />)
    
    // Check for solution-related content
    expect(screen.getByText(/Система управления пищевым поведением/i)).toBeInTheDocument()
  })
})

