/**
 * План дня и дневник: «Съел», запись с другим весом, состояние «съедено»,
 * «Подогнать остаток» (openspec plan-diary-logging, задача 5.1).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ApiError } from '@/shared/errors/apiErrors'
import { track } from '@/shared/analytics'
import { DayPlanView } from '../DayPlanView'
import { DATE, item, plan } from '../../testing/fixtures'
import { resetPlanEventsForTests } from '../../utils/planEvents'
import type { MealPlan } from '../../types'

jest.mock('next/image', () => ({
    __esModule: true,
    default: ({ src, alt }: { src: string; alt: string }) => (
        // eslint-disable-next-line @next/next/no-img-element -- подмена next/image в тесте
        <img src={src} alt={alt} />
    ),
}))
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/shared/analytics', () => ({
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
    track: jest.fn(),
}))
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))
jest.mock('../../utils/planDates', () => ({
    ...jest.requireActual('../../utils/planDates'),
    todayString: () => '2026-10-10',
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const post = apiClient.post as jest.Mock
const EAT_LUNCH = `/api/v1/meal-plans/${DATE}/items/lunch/eat`
const TIME = expect.stringMatching(/^\d{2}:\d{2}$/)

/** План, в котором обед съеден весом `grams`. */
function lunchEaten(grams = 350): MealPlan {
    const base = plan()
    return {
        ...base,
        items: base.items.map((candidate) =>
            candidate.meal_type === 'lunch'
                ? { ...candidate, eaten: true, eaten_grams: grams, food_entry_id: 'entry-lunch' }
                : candidate
        ),
    }
}

function eventCalls(): unknown[][] {
    return (track as jest.Mock).mock.calls
}

beforeEach(() => {
    jest.clearAllMocks()
    resetPlanEventsForTests()
})

describe('«Съел» в плане', () => {
    it('записывает блюдо весом плана и показывает его съеденным', async () => {
        get.mockResolvedValue(plan())
        post.mockResolvedValue({ entry_id: 'entry-lunch', plan: lunchEaten() })
        render(<DayPlanView />)

        const lunch = await screen.findByTestId('plan-item-lunch')
        fireEvent.click(within(lunch).getByRole('button', { name: 'Съел «Плов с курицей», 350 г — записать в дневник' }))

        // Без веса — вес из плана; сегодня — со временем клиента.
        await waitFor(() => expect(post).toHaveBeenCalledWith(EAT_LUNCH, { time: TIME }))
        const eaten = await screen.findByTestId('plan-item-lunch-eaten')
        expect(eaten).toHaveTextContent('Съедено')

        const card = screen.getByTestId('plan-item-lunch')
        expect(within(card).getByText(/съедено 350 г/)).toBeInTheDocument()
        // Съеденное — факт: веса, замены и закрепления у него нет.
        expect(within(card).queryByRole('button', { name: 'Заменить «Плов с курицей»' })).not.toBeInTheDocument()
        expect(within(card).queryByRole('button', { name: 'Закрепить «Плов с курицей»' })).not.toBeInTheDocument()
        expect(within(card).queryByLabelText('Вес блюда «Плов с курицей», г')).not.toBeInTheDocument()
        expect(within(card).queryByRole('button', { name: /^Съел/ })).not.toBeInTheDocument()

        expect(eventCalls()).toContainEqual(['plan_item_eaten', { source: 'plan' }])
        expect(toast.success).toHaveBeenCalledWith('Записано в дневник')
    })

    it('съеденный вес — из дневника, а не из плана', async () => {
        get.mockResolvedValue(lunchEaten(280))
        render(<DayPlanView />)

        const card = await screen.findByTestId('plan-item-lunch')
        expect(within(card).getByText(/съедено 280 г/)).toBeInTheDocument()
        expect(within(card).queryByText('350 г')).not.toBeInTheDocument()
    })

    it('«Другой вес»: записывает поправленный вес, план не трогает', async () => {
        get.mockResolvedValue(plan())
        post.mockResolvedValue({ entry_id: 'entry-lunch', plan: lunchEaten(280) })
        render(<DayPlanView />)

        const lunch = await screen.findByTestId('plan-item-lunch')
        const toggle = within(lunch).getByRole('button', { name: 'Другой вес' })
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        fireEvent.click(toggle)

        const field = within(lunch).getByLabelText('Сколько граммов «Плов с курицей» съедено')
        expect(field).toHaveValue(350)
        fireEvent.change(field, { target: { value: '280' } })
        fireEvent.click(within(lunch).getByRole('button', { name: 'Записать' }))

        await waitFor(() => expect(post).toHaveBeenCalledWith(EAT_LUNCH, { grams: 280, time: TIME }))
        // Правка веса плана (PUT) не отправлялась.
        expect(apiClient.put).not.toHaveBeenCalled()
        expect(await screen.findByText(/съедено 280 г/)).toBeInTheDocument()
    })

    it('неверный вес не отправляется', async () => {
        get.mockResolvedValue(plan())
        render(<DayPlanView />)

        const lunch = await screen.findByTestId('plan-item-lunch')
        fireEvent.click(within(lunch).getByRole('button', { name: 'Другой вес' }))
        const field = within(lunch).getByLabelText('Сколько граммов «Плов с курицей» съедено')

        for (const value of ['0', '2001', '12.5', '']) {
            fireEvent.change(field, { target: { value } })
            expect(within(lunch).getByRole('button', { name: 'Записать' })).toBeDisabled()
            expect(within(lunch).getByRole('alert')).toHaveTextContent('Вес — от 1 до 2000 г')
        }
        fireEvent.submit(field.closest('form')!)
        expect(post).not.toHaveBeenCalled()
    })

    it('прошлая дата — без времени: его ставит сервер', async () => {
        get.mockResolvedValue(plan({ date: '2026-10-09' }))
        post.mockResolvedValue({ entry_id: 'e', plan: lunchEaten() })
        render(<DayPlanView initialDate="2026-10-09" />)

        const lunch = await screen.findByTestId('plan-item-lunch')
        fireEvent.click(within(lunch).getByRole('button', { name: /^Съел «Плов/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith('/api/v1/meal-plans/2026-10-09/items/lunch/eat', {}))
    })

    it('ошибка записи — сообщение, блюдо остаётся несъеденным, события нет', async () => {
        get.mockResolvedValue(plan())
        post.mockRejectedValue(new ApiError(422, { code: 'validation', message: 'граммы вне диапазона' }))
        render(<DayPlanView />)

        const lunch = await screen.findByTestId('plan-item-lunch')
        fireEvent.click(within(lunch).getByRole('button', { name: /^Съел «Плов/ }))

        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(screen.queryByTestId('plan-item-lunch-eaten')).not.toBeInTheDocument()
        expect(eventCalls().map((call) => call[0])).not.toContain('plan_item_eaten')
    })
})

describe('«Подогнать остаток»', () => {
    it('нет съеденного — нет кнопки', async () => {
        get.mockResolvedValue(plan())
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-lunch')
        expect(screen.queryByRole('button', { name: 'Подогнать остаток' })).not.toBeInTheDocument()
    })

    it('есть съеденное — подгоняет и показывает ответ', async () => {
        get.mockResolvedValue(lunchEaten(450))
        const refitted = lunchEaten(450)
        refitted.items = refitted.items.map((candidate) =>
            candidate.meal_type === 'dinner' ? item({ ...candidate, grams: 220 }) : candidate
        )
        post.mockResolvedValue(refitted)
        render(<DayPlanView />)

        fireEvent.click(await screen.findByRole('button', { name: 'Подогнать остаток' }))

        await waitFor(() => expect(post).toHaveBeenCalledWith(`/api/v1/meal-plans/${DATE}/refit`, {}))
        const dinner = await screen.findByTestId('plan-item-dinner')
        await waitFor(() => expect(within(dinner).getByLabelText('Вес блюда «Треска с овощами», г')).toHaveValue(220))
        expect(eventCalls()).toContainEqual(['plan_refit'])
        expect(toast.success).toHaveBeenCalledWith('Остаток дня подогнан')
    })

    it('ошибка подгонки — сообщение и без события', async () => {
        get.mockResolvedValue(lunchEaten())
        post.mockRejectedValue(new Error('сеть'))
        render(<DayPlanView />)

        fireEvent.click(await screen.findByRole('button', { name: 'Подогнать остаток' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось подогнать остаток'))
        expect(eventCalls().map((call) => call[0])).not.toContain('plan_refit')
    })
})
