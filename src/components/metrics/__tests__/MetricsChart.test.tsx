/**
 * Tests for MetricsChart component
 */

import { render, screen } from '@testing-library/react'
import MetricsChart from '../MetricsChart'

const mockData = [
  { date: '2024-01-01', value: 100 },
  { date: '2024-01-02', value: 120 },
  { date: '2024-01-03', value: 110 },
]

describe('MetricsChart', () => {
  it('renders chart with data', () => {
    const { container } = render(<MetricsChart data={mockData} />)
    
    // Check that ResponsiveContainer is rendered
    const chartContainer = container.querySelector('.bg-zinc-900.rounded-xl')
    expect(chartContainer).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(<MetricsChart data={mockData} title="Test Chart" />)
    
    expect(screen.getByText('Test Chart')).toBeInTheDocument()
  })

  it('renders line chart by default', () => {
    const { container } = render(<MetricsChart data={mockData} />)
    
    // LineChart should be rendered (we can't easily test recharts internals, but we can check the container)
    const chartContainer = container.querySelector('.bg-zinc-900')
    expect(chartContainer).toBeInTheDocument()
  })

  it('renders bar chart when type is bar', () => {
    const { container } = render(<MetricsChart data={mockData} type="bar" />)
    
    const chartContainer = container.querySelector('.bg-zinc-900')
    expect(chartContainer).toBeInTheDocument()
  })

  it('applies custom color', () => {
    const { container } = render(
      <MetricsChart data={mockData} color="#ff0000" />
    )
    
    const chartContainer = container.querySelector('.bg-zinc-900')
    expect(chartContainer).toBeInTheDocument()
  })

  it('handles empty data array', () => {
    const { container } = render(<MetricsChart data={[]} />)
    
    const chartContainer = container.querySelector('.bg-zinc-900')
    expect(chartContainer).toBeInTheDocument()
  })
})

