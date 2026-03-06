import { render, screen, fireEvent } from '@testing-library/react'
import { DaySection } from '../DaySection'
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

describe('DaySection', () => {
    it('renders without crashing', () => {
        render(<DaySection day={makeDay()} />)

        // The date header should be present
        expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('shows KBZHU summary when data exists with plan', () => {
        render(
            <DaySection
                day={makeDay({
                    kbzhu: { calories: 1500, protein: 80, fat: 60, carbs: 200 },
                    plan: { calories: 2000, protein: 100, fat: 70, carbs: 250 },
                })}
            />
        )

        expect(screen.getByText(/1500\/2000 ккал/)).toBeInTheDocument()
    })

    it('shows KBZHU summary without plan', () => {
        render(
            <DaySection
                day={makeDay({
                    kbzhu: { calories: 1500, protein: 80, fat: 60, carbs: 200 },
                    plan: null,
                })}
            />
        )

        expect(screen.getByText(/1500 ккал/)).toBeInTheDocument()
    })

    it('shows water info in collapsed header', () => {
        render(
            <DaySection
                day={makeDay({
                    water: { glasses: 5, goal: 8, glass_size: 250 },
                })}
            />
        )

        expect(screen.getByText('5/8 стаканов')).toBeInTheDocument()
    })

    it('shows alerts inline', () => {
        render(
            <DaySection
                day={makeDay({
                    alerts: [{ level: 'red', message: 'Пропуск приёма пищи' }],
                })}
            />
        )

        expect(screen.getByText('Пропуск приёма пищи')).toBeInTheDocument()
    })

    it('expands on click to show detailed content', () => {
        render(
            <DaySection
                day={makeDay({
                    kbzhu: { calories: 1500, protein: 80, fat: 60, carbs: 200 },
                    plan: { calories: 2000, protein: 100, fat: 70, carbs: 250 },
                    food_entries: [],
                })}
            />
        )

        fireEvent.click(screen.getByRole('button'))

        expect(screen.getByText('КБЖУ')).toBeInTheDocument()
        expect(screen.getByText('Приёмы пищи')).toBeInTheDocument()
    })

    it('shows food entries when expanded', () => {
        render(
            <DaySection
                day={makeDay({
                    food_entries: [
                        { id: '1', food_name: 'Куриная грудка', meal_type: 'lunch', calories: 200, protein: 30, fat: 5, carbs: 0, weight: 150, time: '12:00' },
                    ],
                })}
                defaultExpanded
            />
        )

        expect(screen.getByText('Куриная грудка')).toBeInTheDocument()
        expect(screen.getByText('150 г')).toBeInTheDocument()
    })

    it('shows "Нет записей" when no food entries and expanded', () => {
        render(<DaySection day={makeDay()} defaultExpanded />)

        expect(screen.getByText('Нет записей')).toBeInTheDocument()
    })

    it('shows curator-added food entries label', () => {
        render(
            <DaySection
                day={makeDay({
                    food_entries: [
                        { id: '1', food_name: 'Рис', meal_type: 'lunch', calories: 150, protein: 3, fat: 1, carbs: 30, weight: 100, time: '12:00', created_by: 5 },
                    ],
                })}
                defaultExpanded
            />
        )

        expect(screen.getByText('Добавлено куратором')).toBeInTheDocument()
    })
})
