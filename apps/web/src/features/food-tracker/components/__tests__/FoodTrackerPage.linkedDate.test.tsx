/**
 * Дата из ссылки: `/food-tracker?date=YYYY-MM-DD`.
 *
 * Быстрая запись со вчерашнего дня дашборда ведёт сюда с датой, а страница
 * её не читала: дневник открывался на сегодня, и запись уезжала не в тот день.
 * Спека food-diary-entry, «Дневник открывается на дате из ссылки».
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { FoodTrackerPage, parseLinkedDate } from '../FoodTrackerPage'
import { formatLocalDate } from '@/shared/utils/format'

let search = ''
const fetchDayData = jest.fn()
const dietTabProps: Array<{ openEntryOn?: string | null }> = []

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
    useSearchParams: () => new URLSearchParams(search),
}))

jest.mock('../DietTab', () => ({
    DietTab: (props: { openEntryOn?: string | null }) => {
        dietTabProps.push(props)
        return <div data-testid="diet-tab" />
    },
}))

jest.mock('@/features/dashboard/components/FooterNavigation', () => ({
    FooterNavigation: () => <nav />,
}))

jest.mock('../../hooks/useFoodTracker', () => ({
    useFoodTracker: () => ({
        entries: { breakfast: [], lunch: [], dinner: [], snack: [] },
        dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
        targetGoals: null,
        missingTargetInputs: null,
        isLoading: false,
        error: null,
        isOffline: false,
        fetchDayData,
        deleteEntry: jest.fn(),
        clearError: jest.fn(),
    }),
}))

jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }))

function openWith(query: string) {
    search = query
    fetchDayData.mockClear()
    dietTabProps.length = 0
    return render(<FoodTrackerPage />)
}

const today = () => formatLocalDate(new Date())

describe('дневник открывается на дате из ссылки', () => {
    // «Быстрая запись со вчерашнего дня дашборда»
    it('?date=2026-10-15&add=search выбирает 15 октября и открывает окно на поиске', () => {
        openWith('date=2026-10-15&add=search')

        expect(fetchDayData).toHaveBeenCalledTimes(1)
        expect(fetchDayData).toHaveBeenCalledWith('2026-10-15')
        expect(dietTabProps[0]?.openEntryOn).toBe('search')
        // Выбор даты показывает тот же день, а не «Сегодня».
        expect(screen.queryByText('Сегодня')).not.toBeInTheDocument()
    })

    // «Мусор в параметре»
    it('?date=вчера показывает сегодняшний день', () => {
        openWith(`date=${encodeURIComponent('вчера')}`)

        expect(fetchDayData).toHaveBeenCalledTimes(1)
        expect(fetchDayData).toHaveBeenCalledWith(today())
    })

    it('без параметра показывает сегодняшний день', () => {
        openWith('')

        expect(fetchDayData).toHaveBeenCalledWith(today())
    })
})

describe('parseLinkedDate', () => {
    it('принимает существующий прошедший день', () => {
        const date = parseLinkedDate('2026-10-15')
        expect(date && formatLocalDate(date)).toBe('2026-10-15')
    })

    it.each([
        ['вчера'],
        ['2026-10-15T00:00:00Z'],
        ['2026-1-5'],
        ['15.10.2026'],
        ['2026-02-31'],
        ['2026-13-01'],
        [''],
    ])('отклоняет %p', (value) => {
        expect(parseLinkedDate(value)).toBeNull()
    })

    it('отклоняет отсутствующий параметр', () => {
        expect(parseLinkedDate(null)).toBeNull()
        expect(parseLinkedDate(undefined)).toBeNull()
    })

    // В будущее не пускает и сам выбор даты: записать еду на послезавтра
    // по ссылке значило бы обойти его.
    it('отклоняет будущий день', () => {
        const future = new Date()
        future.setDate(future.getDate() + 2)
        expect(parseLinkedDate(formatLocalDate(future))).toBeNull()
    })
})
