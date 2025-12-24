/**
 * Tests for MetricCard component
 */

import { render, screen } from '@testing-library/react'
import MetricCard from '../MetricCard'
import { Activity, Users } from 'lucide-react'

describe('MetricCard', () => {
  it('renders title and value', () => {
    render(<MetricCard title="Test Metric" value={100} />)
    
    expect(screen.getByText('Test Metric')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('renders with icon', () => {
    render(<MetricCard title="Users" value={50} icon={Users} />)
    
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(
      <MetricCard
        title="Test Metric"
        value={100}
        subtitle="This is a subtitle"
      />
    )
    
    expect(screen.getByText('This is a subtitle')).toBeInTheDocument()
  })

  it('renders trend with positive value', () => {
    render(
      <MetricCard
        title="Test Metric"
        value={100}
        trend={{ value: 10, label: 'vs yesterday' }}
      />
    )
    
    expect(screen.getByText(/10%/)).toBeInTheDocument()
    expect(screen.getByText(/vs yesterday/)).toBeInTheDocument()
  })

  it('renders trend with negative value', () => {
    render(
      <MetricCard
        title="Test Metric"
        value={100}
        trend={{ value: -5, label: 'vs yesterday' }}
      />
    )
    
    expect(screen.getByText(/5%/)).toBeInTheDocument()
  })

  it('formats number values with locale', () => {
    render(<MetricCard title="Test Metric" value={1000} />)
    
    // Russian locale formatting
    expect(screen.getByText(/1[,\s]?000/)).toBeInTheDocument()
  })

  it('renders string values as-is', () => {
    render(<MetricCard title="Test Metric" value="50%" />)
    
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('applies default variant styles', () => {
    const { container } = render(<MetricCard title="Test" value={100} />)
    
    const card = container.querySelector('.bg-white.border-gray-200')
    expect(card).toBeInTheDocument()
  })

  it('applies success variant styles', () => {
    const { container } = render(
      <MetricCard title="Test" value={100} variant="success" />
    )
    
    const card = container.querySelector('.bg-green-50.border-green-200')
    expect(card).toBeInTheDocument()
  })

  it('applies warning variant styles', () => {
    const { container } = render(
      <MetricCard title="Test" value={100} variant="warning" />
    )
    
    const card = container.querySelector('.bg-yellow-50.border-yellow-200')
    expect(card).toBeInTheDocument()
  })

  it('applies danger variant styles', () => {
    const { container } = render(
      <MetricCard title="Test" value={100} variant="danger" />
    )
    
    const card = container.querySelector('.bg-red-50.border-red-200')
    expect(card).toBeInTheDocument()
  })
})

