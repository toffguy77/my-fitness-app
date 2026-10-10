import { ApiError } from '@/shared/errors/apiErrors'
import { addDays, dayLabel, daysBetween, isWithinWindow, todayString } from '../planDates'
import { deviationText, targetMissingFrom } from '../planText'

describe('даты плана', () => {
    it('шаг по дням не сбивается на переходе месяца и года', () => {
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
        expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
        expect(daysBetween('2026-10-10', '2026-11-09')).toBe(30)
    })

    it('окно — 30 дней в обе стороны', () => {
        expect(isWithinWindow('2026-11-09', '2026-10-10')).toBe(true)
        expect(isWithinWindow('2026-11-10', '2026-10-10')).toBe(false)
        expect(isWithinWindow('2026-09-10', '2026-10-10')).toBe(true)
        expect(isWithinWindow('2026-09-09', '2026-10-10')).toBe(false)
    })

    it('сегодня — по местному календарю', () => {
        expect(todayString(new Date(2026, 9, 10, 23, 59))).toBe('2026-10-10')
    })

    it('подпись дня: сегодня, завтра, вчера, иначе день недели', () => {
        expect(dayLabel('2026-10-10', '2026-10-10')).toBe('Сегодня, 10 октября')
        expect(dayLabel('2026-10-11', '2026-10-10')).toBe('Завтра, 11 октября')
        expect(dayLabel('2026-10-09', '2026-10-10')).toBe('Вчера, 9 октября')
        expect(dayLabel('2026-10-16', '2026-10-10')).toBe('пятница, 16 октября')
    })
})

describe('отклонения словами', () => {
    it.each([
        [{ nutrient: 'protein', delta: -25 }, 'Не хватает 25 г белка'],
        [{ nutrient: 'kcal', delta: -150.4 }, 'Не хватает 150 ккал'],
        [{ nutrient: 'fat', delta: 12.6 }, 'Жиров больше цели на 13 г'],
        [{ nutrient: 'carbs', delta: -40 }, 'Не хватает 40 г углеводов'],
        [{ nutrient: 'kcal', delta: 120 }, 'Калорий больше цели на 120 ккал'],
    ] as const)('%o → %s', (deviation, text) => {
        expect(deviationText(deviation)).toBe(text)
    })
})

describe('409 target_missing', () => {
    it('переводит список недостающего в форму приглашения', () => {
        const error = new ApiError(409, { status: 'error', code: 'target_missing', params: { missing: ['weight'] } })
        expect(targetMissingFrom(error)).toEqual({ profile: false, weight: true })
        const both = new ApiError(409, { code: 'target_missing', params: { missing: ['profile', 'weight'] } })
        expect(targetMissingFrom(both)).toEqual({ profile: true, weight: true })
    })

    it('без списка — ничего не помечено, но это всё ещё нет цели', () => {
        expect(targetMissingFrom(new ApiError(409, { code: 'target_missing' }))).toEqual({ profile: false, weight: false })
    })

    it('другие ошибки — не про цель', () => {
        expect(targetMissingFrom(new ApiError(409, { code: 'conflict' }))).toBeNull()
        expect(targetMissingFrom(new ApiError(500, { code: 'target_missing' }))).toBeNull()
        expect(targetMissingFrom(new Error('x'))).toBeNull()
    })
})
