/**
 * Разбор параметра ?add= на странице дневника.
 *
 * Значение приходит из адресной строки, поэтому принимается только известное:
 * подставлять оттуда произвольную строку во внутреннее состояние значит доверять
 * ей больше, чем следует. Само открытие окна проверяется в
 * addPhotoDeepLink.test.tsx.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { FoodTrackerPage } from '../FoodTrackerPage'

let search = ''
const capturedProps: Array<{ openEntryOn?: string | null }> = []

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
    useSearchParams: () => new URLSearchParams(search),
}))

jest.mock('../DietTab', () => ({
    DietTab: (props: { openEntryOn?: string | null }) => {
        capturedProps.push(props)
        return <div data-testid="diet-tab" />
    },
}))

jest.mock('@/features/dashboard/components/FooterNavigation', () => ({
    FooterNavigation: () => <nav />,
}))

jest.mock('../../hooks/useFoodTracker', () => ({
    useFoodTracker: () => ({
        entries: {
            breakfast: [],
            lunch: [],
            dinner: [],
            snack: [],
        },
        dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
        targetGoals: null,
        missingTargetInputs: null,
        isLoading: false,
        error: null,
        isOffline: false,
        fetchDayData: jest.fn(),
        deleteEntry: jest.fn(),
        clearError: jest.fn(),
    }),
}))

jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }))

function openWith(query: string): string | null | undefined {
    search = query
    capturedProps.length = 0
    render(<FoodTrackerPage />)
    return capturedProps[0]?.openEntryOn
}

describe('страница разбирает ?add=', () => {
    it('передаёт photo во вкладку рациона', () => {
        expect(openWith('add=photo')).toBe('photo')
    })

    it('не пропускает неизвестное значение', () => {
        expect(openWith('add=ничего-такого')).toBeNull()
    })

    it('без параметра ничего не открывает', () => {
        expect(openWith('')).toBeNull()
    })

    // Остальные способы записи тоже адресуемы: чек-лист сегодня ссылается на
    // распознавание, но ограничивать механизм одним значением было бы случайным.
    it('принимает и другие известные способы', () => {
        expect(openWith('add=barcode')).toBe('barcode')
        expect(openWith('add=manual')).toBe('manual')
    })
})
