import { render, screen } from '@testing-library/react'
import { WaterChart } from '../WaterChart'
import type { DayDetail } from '../../types'

jest.mock('recharts', () => {
    const MockResponsiveContainer = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="responsive-container">{children}</div>
    )
    const MockBarChart = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="bar-chart">{children}</div>
    )
    const MockBar = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="bar">{children}</div>
    )
    const MockXAxis = () => <div data-testid="x-axis" />
    const MockYAxis = () => <div data-testid="y-axis" />
    const MockCartesianGrid = () => <div data-testid="cartesian-grid" />
    const MockTooltip = () => <div data-testid="tooltip" />
    const MockReferenceLine = () => <div data-testid="reference-line" />
    const MockCell = () => <div data-testid="cell" />

    return {
        ResponsiveContainer: MockResponsiveContainer,
        BarChart: MockBarChart,
        Bar: MockBar,
        XAxis: MockXAxis,
        YAxis: MockYAxis,
        CartesianGrid: MockCartesianGrid,
        Tooltip: MockTooltip,
        ReferenceLine: MockReferenceLine,
        Cell: MockCell,
    }
})

jest.mock('@/shared/components/ui/Card', () => ({
    Card: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="card">{children}</div>
    ),
    CardContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="card-content">{children}</div>
    ),
    CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div data-testid="card-header" className={className}>{children}</div>
    ),
    CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <h3 data-testid="card-title" className={className}>{children}</h3>
    ),
}))

function makeDay(overrides: Partial<DayDetail> = {}): DayDetail {
    return {
        date: '2026-03-05',
        kbzhu: null,
        plan: null,
        alerts: [],
        food_entries: [],
        water: null,
        steps: 0,
        workout: null,
        ...overrides,
    }
}

describe('WaterChart', () => {
    it('returns null when no days have water data', () => {
        const { container } = render(
            <WaterChart days={[makeDay(), makeDay()]} />
        )

        expect(container.innerHTML).toBe('')
    })

    it('renders chart when at least one day has water', () => {
        render(
            <WaterChart
                days={[makeDay({ water: { glasses: 6, goal: 8, glass_size: 250 }, date: '2026-03-05' })]}
            />
        )

        expect(screen.getByText('Вода')).toBeInTheDocument()
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })

    it('displays latest water count and goal', () => {
        render(
            <WaterChart
                days={[makeDay({ water: { glasses: 6, goal: 8, glass_size: 250 }, date: '2026-03-05' })]}
            />
        )

        expect(screen.getByText('6/8')).toBeInTheDocument()
    })
})
