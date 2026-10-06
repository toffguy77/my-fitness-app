import { render, screen } from '@testing-library/react'
import { DashboardGreeting, firstName, partOfDay } from '../DashboardGreeting'

describe('partOfDay', () => {
    it.each([
        [5, 'morning'], [11, 'morning'], [12, 'day'], [16, 'day'], [17, 'evening'], [22, 'evening'], [23, 'night'], [0, 'night'], [4, 'night'],
    ])('%i ч — %s', (hour, part) => {
        expect(partOfDay(hour)).toBe(part)
    })
})

describe('firstName', () => {
    it('берёт первое слово имени', () => {
        expect(firstName('Дмитрий Спасский')).toBe('Дмитрий')
    })

    it('почта — не имя', () => {
        expect(firstName('user@example.com')).toBeNull()
    })

    it('пустое имя — без обращения', () => {
        expect(firstName('  ')).toBeNull()
        expect(firstName(undefined)).toBeNull()
    })
})

describe('DashboardGreeting', () => {
    afterEach(() => jest.useRealTimers())

    it('здоровается по времени суток и по имени', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 8, 28, 8, 30))
        render(<DashboardGreeting name="Дмитрий Спасский" />)
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Доброе утро, Дмитрий')
    })

    it('без имени — просто приветствие', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 8, 28, 19, 0))
        render(<DashboardGreeting name="user@example.com" />)
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Добрый вечер$/)
    })
})
