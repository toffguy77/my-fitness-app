import { render, screen, fireEvent } from '@testing-library/react'
import { AnalyticsDynamicsChart } from '../AnalyticsDynamicsChart'
import type { WeeklySnapshot, PlatformBenchmark } from '../../types'

// recharts measures its container, which jsdom reports as zero — the chart
// itself is not what these assertions are about.
jest.mock('recharts', () => {
    const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
    return {
        ResponsiveContainer: Passthrough,
        LineChart: Passthrough,
        Line: () => null,
        XAxis: () => null,
        YAxis: () => null,
        CartesianGrid: () => null,
        Tooltip: () => null,
        Legend: () => null,
    }
})

const snapshot: WeeklySnapshot = {
    week_start: '2026-08-31',
    avg_kbzhu_percent: 92,
    avg_response_time_hours: 3,
    clients_with_feedback: 4,
    clients_total: 6,
    task_completion_rate: 80,
    clients_on_track: 5,
    clients_off_track: 1,
    avg_client_streak: 7,
}

const benchmark: PlatformBenchmark = {
    week_start: '2026-08-31',
    avg_kbzhu_percent: 88,
    avg_response_time_hours: 4,
    avg_task_completion_rate: 75,
    avg_feedback_rate: 60,
    avg_client_streak: 5,
    curator_count: 12,
}

describe('AnalyticsDynamicsChart', () => {
    // The figures come from a nightly job, so a curator's first days are
    // legitimately empty. The section used to disappear entirely, leaving no
    // way to tell an empty week from a broken screen.
    it('explains itself when no snapshots have been collected yet', () => {
        render(<AnalyticsDynamicsChart ownSnapshots={[]} benchmarks={[]} />)

        expect(screen.getByText('Динамика')).toBeInTheDocument()
        expect(screen.getByText(/Первые данные/)).toBeInTheDocument()
    })

    it('shows the section once there is something to show', () => {
        render(<AnalyticsDynamicsChart ownSnapshots={[snapshot]} benchmarks={[benchmark]} />)

        expect(screen.queryByText(/Первые данные/)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Динамика/ })).toBeInTheDocument()
    })

    // Platform averages need several curators before they mean anything, so a
    // curator can have their own figures while the comparison is still absent.
    it('says why the comparison is missing rather than drawing a blank line', () => {
        render(<AnalyticsDynamicsChart ownSnapshots={[snapshot]} benchmarks={[]} />)

        fireEvent.click(screen.getByRole('button', { name: /Динамика/ }))

        expect(screen.getByText(/Средние по платформе пока не рассчитаны/)).toBeInTheDocument()
    })
})
