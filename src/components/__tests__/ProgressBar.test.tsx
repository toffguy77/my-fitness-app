/**
 * Tests for ProgressBar component
 */

import { render, screen } from '@testing-library/react'
import ProgressBar from '../ProgressBar'

describe('ProgressBar', () => {
  it('renders with correct label and values', () => {
    render(<ProgressBar label="Калории" current={1500} target={2000} unit="ккал" />)
    
    expect(screen.getByText('Калории')).toBeInTheDocument()
    expect(screen.getByText(/1500.*2000.*ккал/)).toBeInTheDocument()
  })

  it('calculates percentage correctly', () => {
    render(<ProgressBar label="Белки" current={75} target={100} unit="г" />)
    
    expect(screen.getByText(/75.*100.*г.*75%/)).toBeInTheDocument()
  })

  it('shows green color for >= 80%', () => {
    const { container } = render(<ProgressBar label="Углеводы" current={80} target={100} unit="г" />)
    
    const progressBar = container.querySelector('.bg-green-500')
    expect(progressBar).toBeInTheDocument()
  })

  it('shows yellow color for >= 50% and < 80%', () => {
    const { container } = render(<ProgressBar label="Жиры" current={50} target={100} unit="г" />)
    
    const progressBar = container.querySelector('.bg-yellow-500')
    expect(progressBar).toBeInTheDocument()
  })

  it('shows red color for < 50%', () => {
    const { container } = render(<ProgressBar label="Калории" current={30} target={100} unit="ккал" />)
    
    const progressBar = container.querySelector('.bg-red-500')
    expect(progressBar).toBeInTheDocument()
  })

  it('handles zero target gracefully', () => {
    render(<ProgressBar label="Тест" current={50} target={0} unit="г" />)
    
    expect(screen.getByText(/50.*0.*г.*0%/)).toBeInTheDocument()
  })

  it('caps percentage at 100%', () => {
    const { container } = render(<ProgressBar label="Калории" current={2500} target={2000} unit="ккал" />)
    
    const progressBar = container.querySelector('[style*="width: 100%"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('hides percentage when showPercentage is false', () => {
    render(<ProgressBar label="Тест" current={50} target={100} unit="г" showPercentage={false} />)
    
    const percentageText = screen.queryByText(/50%/)
    expect(percentageText).not.toBeInTheDocument()
  })
})

