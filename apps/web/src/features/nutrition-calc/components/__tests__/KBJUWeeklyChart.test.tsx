import { render, screen } from '@testing-library/react'
import { KBJUWeeklyChart } from '../KBJUWeeklyChart'
import type { TargetVsActual } from '../../types'

jest.mock('recharts', () => {
    const MockResponsiveContainer = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="responsive-container">{children}</div>
    )
    const MockLineChart = ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
        <div data-testid="line-chart" data-chart-data={JSON.stringify(data)}>{children}</div>
    )
    const MockLine = (props: Record<string, unknown>) => (
        <div data-testid={`line-${props.dataKey}`} />
    )
    const MockXAxis = () => <div data-testid="x-axis" />
    const MockYAxis = () => <div data-testid="y-axis" />
    const MockCartesianGrid = () => <div data-testid="cartesian-grid" />
    const MockTooltip = () => <div data-testid="tooltip" />
    const MockDot = () => <div data-testid="dot" />

    return {
        ResponsiveContainer: MockResponsiveContainer,
        LineChart: MockLineChart,
        Line: MockLine,
        XAxis: MockXAxis,
        YAxis: MockYAxis,
        CartesianGrid: MockCartesianGrid,
        Tooltip: MockTooltip,
        Dot: MockDot,
    }
})

jest.mock('@/shared/components/ui/Card', () => ({
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div data-testid="card" className={className}>{children}</div>
    ),
    CardContent: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="card-content">{children}</div>
    ),
    CardHeader: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="card-header">{children}</div>
    ),
    CardTitle: ({ children }: { children: React.ReactNode }) => (
        <h3 data-testid="card-title">{children}</h3>
    ),
}))

function makeDayData(overrides: Partial<TargetVsActual> = {}): TargetVsActual {
    return {
        date: '2026-03-01',
        target: { calories: 2000, protein: 150, fat: 70, carbs: 230, bmr: 1700, tdee: 2300, workout_bonus: 300, weight_used: 80, source: 'calculated' },
        actual: { calories: 1900, protein: 140, fat: 65, carbs: 220 },
        workout_bonus: 300,
        source: 'calculated',
        ...overrides,
    }
}

describe('KBJUWeeklyChart', () => {
    it('returns null for empty data', () => {
        const { container } = render(<KBJUWeeklyChart data={[]} />)
        expect(container.innerHTML).toBe('')
    })

    it('renders chart card with title', () => {
        render(<KBJUWeeklyChart data={[makeDayData()]} />)
        expect(screen.getByText('Калории за неделю')).toBeInTheDocument()
    })

    it('renders legend items', () => {
        render(<KBJUWeeklyChart data={[makeDayData()]} />)
        expect(screen.getByText('Цель')).toBeInTheDocument()
        expect(screen.getByText('Факт')).toBeInTheDocument()
    })

    it('renders chart components', () => {
        render(<KBJUWeeklyChart data={[makeDayData()]} />)
        expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
        expect(screen.getByTestId('line-chart')).toBeInTheDocument()
        expect(screen.getByTestId('line-target')).toBeInTheDocument()
        expect(screen.getByTestId('line-actual')).toBeInTheDocument()
    })

    it('transforms data with green status for small deviation (<=10%)', () => {
        const data = [makeDayData({
            target: { calories: 2000, protein: 150, fat: 70, carbs: 230, bmr: 1700, tdee: 2300, workout_bonus: 300, weight_used: 80, source: 'calculated' },
            actual: { calories: 1950, protein: 140, fat: 65, carbs: 220 }, // 2.5% deviation
        })]

        render(<KBJUWeeklyChart data={data} />)

        const chartEl = screen.getByTestId('line-chart')
        const chartData = JSON.parse(chartEl.getAttribute('data-chart-data') || '[]')
        expect(chartData[0].status).toBe('green')
    })

    it('transforms data with yellow status for 10-20% deviation', () => {
        const data = [makeDayData({
            target: { calories: 2000, protein: 150, fat: 70, carbs: 230, bmr: 1700, tdee: 2300, workout_bonus: 300, weight_used: 80, source: 'calculated' },
            actual: { calories: 1700, protein: 140, fat: 65, carbs: 220 }, // 15% deviation
        })]

        render(<KBJUWeeklyChart data={data} />)

        const chartEl = screen.getByTestId('line-chart')
        const chartData = JSON.parse(chartEl.getAttribute('data-chart-data') || '[]')
        expect(chartData[0].status).toBe('yellow')
    })

    it('transforms data with red status for >20% deviation', () => {
        const data = [makeDayData({
            target: { calories: 2000, protein: 150, fat: 70, carbs: 230, bmr: 1700, tdee: 2300, workout_bonus: 300, weight_used: 80, source: 'calculated' },
            actual: { calories: 1500, protein: 140, fat: 65, carbs: 220 }, // 25% deviation
        })]

        render(<KBJUWeeklyChart data={data} />)

        const chartEl = screen.getByTestId('line-chart')
        const chartData = JSON.parse(chartEl.getAttribute('data-chart-data') || '[]')
        expect(chartData[0].status).toBe('red')
    })

    it('formats date to Russian locale', () => {
        const data = [makeDayData({ date: '2026-03-15' })]

        render(<KBJUWeeklyChart data={data} />)

        const chartEl = screen.getByTestId('line-chart')
        const chartData = JSON.parse(chartEl.getAttribute('data-chart-data') || '[]')
        // Russian locale date format: "15 мар."
        expect(chartData[0].label).toMatch(/15/)
    })

    it('handles null target and actual gracefully', () => {
        const data = [makeDayData({ target: null, actual: null })]

        render(<KBJUWeeklyChart data={data} />)

        const chartEl = screen.getByTestId('line-chart')
        const chartData = JSON.parse(chartEl.getAttribute('data-chart-data') || '[]')
        expect(chartData[0].target).toBeNull()
        expect(chartData[0].actual).toBeNull()
        expect(chartData[0].status).toBe('green') // default when no comparison possible
    })
})
