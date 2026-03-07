import { render, screen } from '@testing-library/react'
import { WorkoutsSection } from '../WorkoutsSection'
import type { DayDetail } from '../../types'

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

describe('WorkoutsSection', () => {
    it('returns null when no days have completed workouts', () => {
        const { container } = render(
            <WorkoutsSection
                days={[
                    makeDay({ workout: null }),
                    makeDay({ workout: { completed: false, type: 'cardio', duration: 0 } }),
                ]}
            />
        )

        expect(container.innerHTML).toBe('')
    })

    it('renders when at least one day has a completed workout', () => {
        render(
            <WorkoutsSection
                days={[
                    makeDay({
                        date: '2026-03-05',
                        workout: { completed: true, type: 'Силовая', duration: 60 },
                    }),
                ]}
            />
        )

        expect(screen.getByText('Тренировки')).toBeInTheDocument()
    })

    it('shows total workout count', () => {
        render(
            <WorkoutsSection
                days={[
                    makeDay({ date: '2026-03-04', workout: { completed: true, type: 'Силовая', duration: 60 } }),
                    makeDay({ date: '2026-03-05', workout: { completed: false, type: '', duration: 0 } }),
                ]}
            />
        )

        expect(screen.getByText(/1 из 2 дней/)).toBeInTheDocument()
    })

    it('shows workout type and duration in detail list', () => {
        render(
            <WorkoutsSection
                days={[
                    makeDay({
                        date: '2026-03-05',
                        workout: { completed: true, type: 'Кардио', duration: 45 },
                    }),
                ]}
            />
        )

        expect(screen.getByText(/Кардио/)).toBeInTheDocument()
        expect(screen.getByText(/Кардио · 45 мин/)).toBeInTheDocument()
    })

    it('shows total duration when present', () => {
        render(
            <WorkoutsSection
                days={[
                    makeDay({ date: '2026-03-04', workout: { completed: true, type: 'Силовая', duration: 60 } }),
                    makeDay({ date: '2026-03-05', workout: { completed: true, type: 'Кардио', duration: 30 } }),
                ]}
            />
        )

        expect(screen.getByText(/90 мин/)).toBeInTheDocument()
    })
})
