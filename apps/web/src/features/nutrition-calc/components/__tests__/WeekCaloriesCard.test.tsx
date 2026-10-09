import { render, screen } from '@testing-library/react'
import { WeekCaloriesCard, toWeekDays } from '../WeekCaloriesCard'
import type { TargetVsActual } from '../../types'

const target = (calories: number) => ({
    calories, protein: 140, fat: 70, carbs: 240, bmr: 1600, tdee: 2100, workout_bonus: 0, weight_used: 82, source: 'calculated',
}) as unknown as TargetVsActual['target']
const actual = (calories: number) => ({ calories, protein: 0, fat: 0, carbs: 0 }) as unknown as TargetVsActual['actual']

const day = (date: string, t: number | null, a: number | null): TargetVsActual => ({
    date, target: t === null ? null : target(t), actual: a === null ? null : actual(a), workout_bonus: 0, source: 'calculated',
})

describe('toWeekDays', () => {
    it('считает отклонение от нормы и подписывает день недели', () => {
        const days = toWeekDays([day('2026-09-26', 2000, 2360), day('2026-09-27T00:00:00Z', 2000, 1920)], new Date(2026, 8, 30))
        expect(days[0]).toMatchObject({ date: '2026-09-26', label: 'Сб', isToday: false })
        expect(days[0].deviation).toBeCloseTo(0.18)
        expect(days[1]).toMatchObject({ date: '2026-09-27', label: 'Вс' })
        expect(days[1].deviation).toBeCloseTo(-0.04)
    })

    it('без нормы или без записей отклонения нет', () => {
        const days = toWeekDays([day('2026-09-26', null, 1800), day('2026-09-27', 2000, null)])
        expect(days.map((d) => d.deviation)).toEqual([null, null])
    })

    it('отмечает сегодняшний день', () => {
        const days = toWeekDays([day('2026-09-28', 2000, 900)], new Date(2026, 8, 28, 12))
        expect(days[0].isToday).toBe(true)
    })

    it('пропускает нечитаемую дату', () => {
        expect(toWeekDays([day('мусор', 2000, 2000)])).toEqual([])
    })
})

describe('WeekCaloriesCard', () => {
    it('показывает, сколько дней из недели в норме', () => {
        render(<WeekCaloriesCard data={[
            day('2026-09-22', 2000, 1960),
            day('2026-09-23', 2000, 2080),
            day('2026-09-24', 2000, 1760),
        ]} />)
        expect(screen.getByText('Неделя')).toBeInTheDocument()
        expect(screen.getByText('2 из 3', { exact: false })).toBeInTheDocument()
    })

    it('пустая история — ничего не рисует', () => {
        const { container } = render(<WeekCaloriesCard data={[]} />)
        expect(container).toBeEmptyDOMElement()
    })
})
