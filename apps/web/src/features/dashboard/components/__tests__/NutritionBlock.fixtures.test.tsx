/**
 * NutritionBlock на общих фикстурах с iOS.
 *
 * docs/ios/fixtures/nutrition-block.json — ответы API (поле data) и числа,
 * которые обязаны получиться. Тот же файл читает «Сегодня» iOS
 * (apps/ios/VzveshenoKit/Tests/ClientTests/NutritionFixturesTests.swift):
 * если правило нормы, остатка или округления разойдётся между вебом и
 * приложением, упадёт одна из двух сторон.
 *
 * Ответы проходят те же преобразования, что в приложении: строки дня и плана —
 * через мапперы стора, норма — через настоящий getTargets поверх apiClient.
 */

import fs from 'fs'
import path from 'path'
import { render, screen, waitFor } from '@testing-library/react'
import { NutritionBlock } from '../NutritionBlock'
import { useDashboardStore } from '../../store/dashboardStore'
import { dashboardStoreValue } from '../../testing/storeValue'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/dashboard',
}))

jest.mock('../../store/dashboardStore')
const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>
const { mapBackendMetrics, mapBackendWeeklyPlan } =
    jest.requireActual<typeof import('../../store/dashboardStore')>('../../store/dashboardStore')

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn() },
}))
const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>

interface FixtureCase {
    name: string
    daily: Parameters<typeof mapBackendMetrics>[0]
    weekly_plan: Parameters<typeof mapBackendWeeklyPlan>[0] & { plan?: null }
    targets: unknown
    expected: {
        headline: string
        eaten: number
        goal: number | null
        over: boolean
        macros: Record<'protein' | 'fat' | 'carbs', string> | null
    }
}

const fixtures: { cases: FixtureCase[] } = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../../../../../docs/ios/fixtures/nutrition-block.json'), 'utf8'),
)

describe('NutritionBlock на общих с iOS фикстурах', () => {
    it('фикстуры на месте', () => {
        expect(fixtures.cases.length).toBeGreaterThanOrEqual(5)
    })

    it.each(fixtures.cases.map((fixture) => [fixture.name, fixture] as const))('%s', async (_name, fixture) => {
        const day = mapBackendMetrics(fixture.daily)
        const date = new Date(`${String(fixture.daily.date).slice(0, 10)}T12:00:00`)
        const dateStr = String(fixture.daily.date).slice(0, 10)
        const weeklyPlan = 'plan' in fixture.weekly_plan ? null : mapBackendWeeklyPlan(fixture.weekly_plan)
        mockGet.mockResolvedValue(fixture.targets as never)
        mockUseDashboardStore.mockReturnValue(dashboardStoreValue({
            dailyData: { [dateStr]: day },
            weeklyPlan,
            targetsVersion: 0,
        }))

        render(<NutritionBlock date={date} />)
        await waitFor(() => expect(mockGet).toHaveBeenCalled())

        const { expected } = fixture
        if (expected.goal === null) {
            await waitFor(() => expect(screen.getByTestId('calorie-value')).toHaveTextContent(new RegExp(`^${expected.eaten}$`)))
            expect(screen.queryByTestId('calorie-remaining')).toBeNull()
        } else {
            const headline = expected.headline.replace('+', '\\+')
            await waitFor(() => expect(screen.getByTestId('calorie-remaining')).toHaveTextContent(new RegExp(`^${headline}$`)))
            expect(screen.getByTestId('calorie-value')).toHaveTextContent(new RegExp(`^${expected.eaten}$`))
            expect(document.body.textContent).toContain(`из ${expected.goal}`)
        }

        for (const macro of ['protein', 'fat', 'carbs'] as const) {
            const cell = screen.queryByTestId(`macro-remaining-${macro}`)
            if (expected.macros === null) {
                expect(cell).toBeNull()
            } else {
                expect(cell).not.toBeNull()
                expect(cell?.textContent).toContain(`${expected.macros[macro]}г`)
            }
        }
    })
})
