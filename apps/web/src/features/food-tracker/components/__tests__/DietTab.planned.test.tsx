/**
 * «По плану» в дневнике (openspec plan-diary-logging, задача 5.2).
 *
 * Транспорт подменён на уровне apiClient, а не mealPlanApi: проверяется сам
 * адрес — дневник обязан звать `?generate=false` и никогда собирающий GET.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { track } from '@/shared/analytics'
import { formatLocalDate } from '@/shared/utils/format'
import { item, plan } from '@/features/meal-plan/testing/fixtures'
import type { MealPlan } from '@/features/meal-plan'
import { DietTab } from '../DietTab'
import { useFoodTrackerStore } from '../../store/foodTrackerStore'
import type { EntriesByMealType, FoodEntry } from '../../types'

jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/shared/analytics', () => ({
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
    track: jest.fn(),
}))
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))
jest.mock('../../store/foodTrackerStore', () => ({ useFoodTrackerStore: jest.fn() }))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const post = apiClient.post as jest.Mock
const TODAY = formatLocalDate(new Date())
const EXISTING = `/api/v1/meal-plans/${TODAY}?generate=false`
const fetchDayData = jest.fn()

function todayPlan(overrides: Partial<MealPlan> = {}): MealPlan {
    return plan({ date: TODAY, ...overrides })
}

/** План сегодня, где съеден обед. */
function lunchEatenPlan(): MealPlan {
    const base = todayPlan()
    return {
        ...base,
        items: base.items.map((candidate) =>
            candidate.meal_type === 'lunch'
                ? { ...candidate, eaten: true, eaten_grams: 350, food_entry_id: 'entry-lunch' }
                : candidate
        ),
    }
}

function entry(overrides: Partial<FoodEntry> = {}): FoodEntry {
    return {
        id: 'entry-lunch',
        foodId: 'food-recipe-lunch',
        foodName: 'Плов с курицей',
        mealType: 'lunch',
        portionType: 'grams',
        portionAmount: 350,
        nutrition: { calories: 520, protein: 30, fat: 15, carbs: 60 },
        time: '13:00',
        date: TODAY,
        createdAt: `${TODAY}T13:00:00Z`,
        updatedAt: `${TODAY}T13:00:00Z`,
        ...overrides,
    }
}

const EMPTY: EntriesByMealType = { breakfast: [], lunch: [], dinner: [], snack: [] }

function renderDiary(entries: EntriesByMealType = EMPTY, date = TODAY) {
    ;(useFoodTrackerStore as unknown as jest.Mock).mockReturnValue({
        waterIntake: 0,
        waterGoal: 8,
        glassSize: 250,
        waterEnabled: false,
        selectedDate: date,
        addWater: jest.fn(),
        fetchDayData,
    })
    const props = {
        entries,
        dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
        targetGoals: { calories: 2000, protein: 120, fat: 67, carbs: 250 },
        isLoading: false,
        onDeleteEntry: jest.fn().mockResolvedValue(true),
    }
    const view = render(<DietTab {...props} />)
    return {
        ...view,
        rerenderWith: (next: EntriesByMealType) => view.rerender(<DietTab {...props} entries={next} />),
    }
}

function slot(label: string): HTMLElement {
    return screen.getByRole('region', { name: `${label} - приём пищи` })
}

beforeEach(() => {
    jest.clearAllMocks()
    Element.prototype.scrollIntoView = jest.fn()
})

describe('«По плану» в дневнике', () => {
    it('Есть план: под ужином — блюдо плана с «записать»', async () => {
        get.mockResolvedValue(todayPlan())
        renderDiary()

        const dinner = slot('Ужин')
        expect(await within(dinner).findByText('Треска с овощами')).toBeInTheDocument()
        expect(within(dinner).getByText('По плану')).toBeInTheDocument()
        expect(within(dinner).getByText('300 г · 420 ккал')).toBeInTheDocument()
        expect(
            within(dinner).getByRole('button', { name: 'Записать «Треска с овощами», 300 г, в Ужин' })
        ).toBeInTheDocument()
        // Чужие блюда в ужин не попадают.
        expect(within(dinner).queryByText('Плов с курицей')).not.toBeInTheDocument()
    })

    it('Плана нет: блока нет и план не собирается', async () => {
        get.mockResolvedValue(undefined) // 204
        renderDiary()

        await waitFor(() => expect(get).toHaveBeenCalledWith(EXISTING))
        expect(screen.queryByTestId('planned-block')).not.toBeInTheDocument()
        // Ни собирающего GET, ни какой-либо записи.
        for (const [url] of get.mock.calls) expect(url).toBe(EXISTING)
        expect(post).not.toHaveBeenCalled()
    })

    it('ошибка чтения плана — дневник молчит', async () => {
        get.mockRejectedValue(new Error('403'))
        renderDiary()

        await waitFor(() => expect(get).toHaveBeenCalledWith(EXISTING))
        expect(screen.queryByTestId('planned-block')).not.toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('дата вне окна плана — запроса нет', () => {
        get.mockResolvedValue(todayPlan())
        renderDiary(EMPTY, '2020-01-01')
        expect(get).not.toHaveBeenCalled()
    })

    it('Съеденное не дублируется: под обедом только запись дневника', async () => {
        get.mockResolvedValue(lunchEatenPlan())
        renderDiary({ ...EMPTY, lunch: [entry()] })

        // План загружен — ужин в «По плану» есть.
        await within(slot('Ужин')).findByText('Треска с овощами')
        const lunch = slot('Обед')
        expect(within(lunch).queryByTestId('planned-block')).not.toBeInTheDocument()
        expect(within(lunch).getAllByText('Плов с курицей')).toHaveLength(1)
    })

    it('«+»: запись из плана, дневник обновляется, блюдо уходит из «По плану»', async () => {
        get.mockResolvedValue(todayPlan())
        const after = todayPlan()
        after.items = after.items.map((candidate) =>
            candidate.meal_type === 'dinner'
                ? item({ ...candidate, eaten: true, eaten_grams: 300, food_entry_id: 'entry-dinner' })
                : candidate
        )
        post.mockResolvedValue({ entry_id: 'entry-dinner', plan: after })
        renderDiary()

        const dinner = slot('Ужин')
        fireEvent.click(
            await within(dinner).findByRole('button', { name: 'Записать «Треска с овощами», 300 г, в Ужин' })
        )

        await waitFor(() =>
            expect(post).toHaveBeenCalledWith(`/api/v1/meal-plans/${TODAY}/items/dinner/eat`, {
                time: expect.stringMatching(/^\d{2}:\d{2}$/),
            })
        )
        await waitFor(() => expect(fetchDayData).toHaveBeenCalledWith(TODAY))
        await waitFor(() => expect(within(dinner).queryByTestId('planned-block')).not.toBeInTheDocument())
        expect(track).toHaveBeenCalledWith('plan_item_eaten', { source: 'diary' })
    })

    it('ошибка «+» — сообщение, без события и без обновления дневника', async () => {
        get.mockResolvedValue(todayPlan())
        post.mockRejectedValue(new Error('сеть'))
        renderDiary()

        fireEvent.click(
            await within(slot('Ужин')).findByRole('button', { name: 'Записать «Треска с овощами», 300 г, в Ужин' })
        )
        const toast = (await import('react-hot-toast')).default
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось записать блюдо из плана'))
        expect(fetchDayData).not.toHaveBeenCalled()
        expect(track).not.toHaveBeenCalled()
    })

    it('удаление записи из дневника возвращает блюдо под «По плану»', async () => {
        get.mockResolvedValueOnce(lunchEatenPlan()).mockResolvedValueOnce(todayPlan())
        const { rerenderWith } = renderDiary({ ...EMPTY, lunch: [entry()] })
        await within(slot('Ужин')).findByText('Треска с овощами')
        expect(within(slot('Обед')).queryByTestId('planned-block')).not.toBeInTheDocument()

        // Запись удалена — записи дневника изменились, план перечитывается.
        rerenderWith(EMPTY)

        await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
        expect(get).toHaveBeenLastCalledWith(EXISTING)
        expect(await within(slot('Обед')).findByTestId('planned-block')).toHaveTextContent('Плов с курицей')
    })
})
