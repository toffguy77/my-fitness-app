/**
 * План дня: показ, состояния без цели и без рецептов, отклонения, правки.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ApiError } from '@/shared/errors/apiErrors'
import { track } from '@/shared/analytics'
import { DayPlanView } from '../DayPlanView'
import { alternative, DATE, item, plan } from '../../testing/fixtures'
import { resetPlanEventsForTests } from '../../utils/planEvents'

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
// «Сегодня» — дата фикстур: окно ±30 дней считается от неё.
jest.mock('../../utils/planDates', () => ({
    ...jest.requireActual('../../utils/planDates'),
    todayString: () => '2026-10-10',
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const post = apiClient.post as jest.Mock
const put = apiClient.put as jest.Mock
const PLAN_PATH = `/api/v1/meal-plans/${DATE}`

function events(): string[] {
    return (track as jest.Mock).mock.calls.map((call) => call[0])
}

beforeEach(() => {
    jest.clearAllMocks()
    resetPlanEventsForTests()
})

describe('DayPlanView — показ', () => {
    it('вход в список покупок', async () => {
        get.mockResolvedValue(plan())
        render(<DayPlanView />)
        expect(await screen.findByRole('link', { name: 'Список покупок' })).toHaveAttribute('href', '/menu/shopping')
    })

    it('итоги дня: граммы, проценты, остаток и раскладка калорий', async () => {
        get.mockResolvedValue(plan())
        render(<DayPlanView />)

        expect(screen.getByRole('status')).toBeInTheDocument()
        expect(await screen.findByText('1960 из 2000 ккал')).toBeInTheDocument()
        expect(get).toHaveBeenCalledWith(PLAN_PATH)
        expect(screen.getByTestId('plan-date')).toHaveTextContent('Сегодня, 10 октября')

        const kcal = screen.getByTestId('plan-totals-kcal')
        expect(within(kcal).getByText('98% цели')).toBeInTheDocument()
        expect(within(kcal).getByText('осталось 40 ккал')).toBeInTheDocument()

        const protein = screen.getByTestId('plan-totals-protein')
        expect(within(protein).getByText('102')).toBeInTheDocument()
        expect(within(protein).getByText('85% цели')).toBeInTheDocument()
        expect(within(protein).getByText('осталось 18 г')).toBeInTheDocument()
        expect(within(protein).getByRole('progressbar', { name: 'Белки: 102 из 120 г, 85% цели' })).toBeInTheDocument()

        const fat = screen.getByTestId('plan-totals-fat')
        expect(within(fat).getByText('больше цели на 3 г')).toBeInTheDocument()

        expect(screen.getByRole('img', { name: 'Калории дня: белки 21%, жиры 32%, углеводы 47%' })).toBeInTheDocument()
        expect(screen.getByText('Б 21%')).toBeInTheDocument()
    })

    it('блюда по приёмам: ссылка на рецепт, вес, КБЖУ, доля дня', async () => {
        get.mockResolvedValue(plan())
        render(<DayPlanView />)

        const breakfast = await screen.findByTestId('plan-item-breakfast')
        expect(within(breakfast).getByRole('link', { name: 'Сырники' })).toHaveAttribute('href', '/menu/recipes/r-breakfast')
        expect(within(breakfast).getByText(/200 г/)).toBeInTheDocument()
        expect(within(breakfast).getByText('420 ккал')).toBeInTheDocument()
        expect(within(breakfast).getByText('21% калорий дня')).toBeInTheDocument()
        expect(within(breakfast).getByRole('img', { name: 'Сырники' })).toBeInTheDocument()

        const order = screen.getAllByRole('article').map((el) => el.getAttribute('aria-label'))
        expect(order).toEqual(['Завтрак', 'Обед', 'Ужин', 'Перекус'])
    })

    it('отправляет plan_generated при первом открытии даты и не повторяет его', async () => {
        get.mockResolvedValue(plan())
        const { unmount } = render(<DayPlanView />)
        await screen.findByTestId('plan-item-breakfast')
        expect(events()).toEqual(['plan_generated'])

        unmount()
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-breakfast')
        expect(events()).toEqual(['plan_generated'])
    })
})

describe('DayPlanView — состояния', () => {
    it('нет цели (409): приглашение посчитать норму со ссылкой на «Тело и цели»', async () => {
        get.mockRejectedValue(
            new ApiError(409, { status: 'error', code: 'target_missing', params: { missing: ['profile', 'weight'] } })
        )
        render(<DayPlanView />)

        expect(await screen.findByText('Норма не посчитана')).toBeInTheDocument()
        expect(screen.getByText(/нужны пол, дата рождения, рост и хотя бы один замер веса/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Посчитать норму/ })).toHaveAttribute('href', '/settings/body')
        expect(screen.queryByRole('button', { name: /Пересобрать/ })).not.toBeInTheDocument()
        expect(track).not.toHaveBeenCalled()
    })

    it('нет только веса: ведёт на главную записать вес', async () => {
        get.mockRejectedValue(new ApiError(409, { code: 'target_missing', params: { missing: ['weight'] } }))
        render(<DayPlanView />)
        expect(await screen.findByRole('link', { name: /Записать вес/ })).toHaveAttribute('href', '/dashboard')
    })

    it('нет рецептов для приёма: пустой слот с причиной, остальные на месте', async () => {
        get.mockResolvedValue(
            plan({
                items: plan().items.filter((it) => it.meal_type !== 'snack'),
                empty: [{ meal_type: 'snack', reason: 'no_recipes' }],
            })
        )
        render(<DayPlanView />)

        const empty = await screen.findByTestId('plan-empty-snack')
        expect(within(empty).getByText('Перекус')).toBeInTheDocument()
        expect(within(empty).getByText('Нет подходящих рецептов')).toBeInTheDocument()
        expect(screen.getByTestId('plan-item-dinner')).toBeInTheDocument()
    })

    it('ни одного рецепта: все приёмы пусты', async () => {
        get.mockResolvedValue(
            plan({
                items: [],
                empty: (['breakfast', 'lunch', 'dinner', 'snack'] as const).map((meal_type) => ({ meal_type, reason: 'no_recipes' as const })),
            })
        )
        render(<DayPlanView />)
        expect(await screen.findAllByText('Нет подходящих рецептов')).toHaveLength(4)
    })

    it('отклонения: недобор и перебор словами, plan_off_target', async () => {
        get.mockResolvedValue(
            plan({
                deviations: [
                    { nutrient: 'protein', delta: -25 },
                    { nutrient: 'fat', delta: 11 },
                ],
            })
        )
        render(<DayPlanView />)

        const box = await screen.findByTestId('plan-deviations')
        expect(within(box).getByText('В цель не попали')).toBeInTheDocument()
        expect(within(box).getByText('Не хватает 25 г белка')).toBeInTheDocument()
        expect(within(box).getByText('Жиров больше цели на 11 г')).toBeInTheDocument()
        expect(events()).toEqual(['plan_generated', 'plan_off_target'])
    })

    it('цель изменилась: пометка и «Пересобрать» в ней', async () => {
        get.mockResolvedValue(plan({ target_changed: true }))
        post.mockResolvedValue(plan())
        render(<DayPlanView />)

        const notice = await screen.findByTestId('plan-target-changed')
        expect(within(notice).getByText('Цель на этот день изменилась после сборки плана')).toBeInTheDocument()
        fireEvent.click(within(notice).getByRole('button', { name: 'Пересобрать' }))

        await waitFor(() => expect(post).toHaveBeenCalledWith(`${PLAN_PATH}/regenerate`, {}))
        await waitFor(() => expect(screen.queryByTestId('plan-target-changed')).not.toBeInTheDocument())
        expect(events()).toContain('plan_regenerated')
    })

    it('недоступное блюдо помечено в карточке и в предупреждениях', async () => {
        get.mockResolvedValue(plan({ items: [item({ unavailable: true })] }))
        render(<DayPlanView />)

        const card = await screen.findByTestId('plan-item-breakfast')
        expect(within(card).getByText('Блюдо больше недоступно')).toBeInTheDocument()
        expect(screen.getByTestId('plan-unavailable')).toBeInTheDocument()
    })

    it('прочая ошибка: повтор загрузки', async () => {
        get.mockRejectedValueOnce(new ApiError(500, { code: 'internal' })).mockResolvedValueOnce(plan())
        render(<DayPlanView />)

        fireEvent.click(await screen.findByRole('button', { name: /Повторить/ }))
        expect(await screen.findByTestId('plan-item-breakfast')).toBeInTheDocument()
        expect(get).toHaveBeenCalledTimes(2)
    })
})

describe('DayPlanView — дата', () => {
    it('вперёд, назад и обратно к сегодня', async () => {
        get.mockImplementation((path: string) => Promise.resolve(plan({ date: path.split('/').pop() })))
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-breakfast')

        fireEvent.click(screen.getByRole('button', { name: 'Следующий день' }))
        await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-11'))
        expect(screen.getByTestId('plan-date')).toHaveTextContent('Завтра, 11 октября')

        fireEvent.click(screen.getByRole('button', { name: 'Предыдущий день' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Предыдущий день' }))
        await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-09'))

        fireEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
        expect(screen.getByTestId('plan-date')).toHaveTextContent('Сегодня, 10 октября')
        expect(screen.queryByRole('button', { name: 'Сегодня' })).not.toBeInTheDocument()
    })

    it('за пределы ±30 дней не уйти', async () => {
        get.mockImplementation((path: string) => Promise.resolve(plan({ date: path.split('/').pop() })))
        const { unmount } = render(<DayPlanView initialDate="2026-11-09" />)
        await screen.findByTestId('plan-item-breakfast')
        expect(screen.getByRole('button', { name: 'Следующий день' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Предыдущий день' })).toBeEnabled()
        unmount()

        render(<DayPlanView initialDate="2026-09-10" />)
        await screen.findByTestId('plan-item-breakfast')
        expect(screen.getByRole('button', { name: 'Предыдущий день' })).toBeDisabled()
    })
})

describe('DayPlanView — правки', () => {
    beforeEach(() => {
        get.mockImplementation((path: string) =>
            path.endsWith('/alternatives')
                ? Promise.resolve({ items: [alternative(), alternative({ recipe_id: 'r-alt-2', name: 'Гречка с грибами' })] })
                : Promise.resolve(plan())
        )
    })

    it('«Пересобрать» внизу плана', async () => {
        post.mockResolvedValue(plan({ items: [item({ name: 'Омлет', recipe_id: 'r-omelette' })] }))
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-breakfast')

        fireEvent.click(screen.getByRole('button', { name: 'Пересобрать' }))
        expect(await screen.findByRole('link', { name: 'Омлет' })).toBeInTheDocument()
        expect(toast.success).toHaveBeenCalledWith('План пересобран')
        expect(events()).toEqual(['plan_generated', 'plan_regenerated'])
    })

    it('ошибка пересборки — сообщение, план на месте', async () => {
        post.mockRejectedValue(new ApiError(500, {}))
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-breakfast')

        fireEvent.click(screen.getByRole('button', { name: 'Пересобрать' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(screen.getByRole('link', { name: 'Сырники' })).toBeInTheDocument()
        expect(events()).toEqual(['plan_generated'])
    })

    it('«Закрепить» — PUT locked и plan_item_locked; открепление события не шлёт', async () => {
        put.mockResolvedValueOnce(plan({ items: [item({ locked: true })] }))
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-breakfast')

        fireEvent.click(screen.getByRole('button', { name: 'Закрепить «Сырники»' }))
        await waitFor(() => expect(put).toHaveBeenCalledWith(`${PLAN_PATH}/items/breakfast`, { locked: true }))
        const unlock = await screen.findByRole('button', { name: 'Открепить «Сырники»' })
        expect(unlock).toHaveAttribute('aria-pressed', 'true')
        expect(events()).toEqual(['plan_generated', 'plan_item_locked'])

        put.mockResolvedValueOnce(plan({ items: [item({ locked: false })] }))
        fireEvent.click(unlock)
        await waitFor(() => expect(put).toHaveBeenLastCalledWith(`${PLAN_PATH}/items/breakfast`, { locked: false }))
        await screen.findByRole('button', { name: 'Закрепить «Сырники»' })
        expect(events()).toEqual(['plan_generated', 'plan_item_locked'])
    })

    it('ручной вес: PUT grams, итоги из ответа, plan_grams_set; сброс — reset_grams', async () => {
        put.mockResolvedValueOnce(
            plan({
                items: [item({ grams: 250, manual_grams: true })],
                totals: { kcal: 2010, protein: 110, fat: 70, carbs: 240 },
            })
        )
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-breakfast')

        const field = screen.getByLabelText('Вес блюда «Сырники», г')
        fireEvent.change(field, { target: { value: '250' } })
        fireEvent.click(screen.getByRole('button', { name: 'Применить' }))

        await waitFor(() => expect(put).toHaveBeenCalledWith(`${PLAN_PATH}/items/breakfast`, { grams: 250 }))
        expect(await screen.findByText('2010 из 2000 ккал')).toBeInTheDocument()
        expect(screen.getByText('Вес задан вручную')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument()
        expect(events()).toEqual(['plan_generated', 'plan_grams_set'])

        put.mockResolvedValueOnce(plan())
        fireEvent.click(screen.getByRole('button', { name: 'Подобрать вес заново' }))
        await waitFor(() => expect(put).toHaveBeenLastCalledWith(`${PLAN_PATH}/items/breakfast`, { reset_grams: true }))
        await waitFor(() => expect(screen.queryByText('Вес задан вручную')).not.toBeInTheDocument())
    })

    it('вес вне 1–2000 г не отправляется', async () => {
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-breakfast')

        const field = screen.getByLabelText('Вес блюда «Сырники», г')
        fireEvent.change(field, { target: { value: '0' } })
        expect(screen.getByRole('alert')).toHaveTextContent('Вес — от 1 до 2000 г')
        expect(screen.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument()
        fireEvent.submit(field.closest('form') as HTMLFormElement)

        fireEvent.change(field, { target: { value: '2001' } })
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(put).not.toHaveBeenCalled()
    })

    it('«Заменить»: альтернативы с весом и итогами дня, выбор — PUT recipe_id', async () => {
        put.mockResolvedValue(
            plan({
                items: [item({ meal_type: 'dinner', recipe_id: 'r-alt-2', name: 'Гречка с грибами' })],
            })
        )
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-dinner')

        fireEvent.click(screen.getByRole('button', { name: 'Заменить «Треска с овощами»' }))
        const dialog = await screen.findByRole('dialog', { name: 'Заменить: Ужин' })
        expect(get).toHaveBeenCalledWith(`${PLAN_PATH}/items/dinner/alternatives`)

        const first = await within(dialog).findByTestId('alternative-r-alt-1')
        expect(within(first).getByText('Индейка с булгуром')).toBeInTheDocument()
        expect(within(first).getByText('280 г')).toBeInTheDocument()
        expect(within(first).getByText('510 ккал')).toBeInTheDocument()
        expect(within(first).getByText('День: 1990 ккал (100%) · Б 118 · Ж 66 · У 245')).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('button', { name: 'Выбрать «Гречка с грибами»' }))
        await waitFor(() => expect(put).toHaveBeenCalledWith(`${PLAN_PATH}/items/dinner`, { recipe_id: 'r-alt-2' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(screen.getByRole('link', { name: 'Гречка с грибами' })).toBeInTheDocument()
        expect(events()).toEqual(['plan_generated', 'plan_item_replaced'])
    })

    it('шторка закрывается кнопкой и Escape; неудачная замена её не закрывает', async () => {
        put.mockRejectedValue(new ApiError(422, { code: 'validation' }))
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-lunch')

        fireEvent.click(screen.getByRole('button', { name: 'Заменить «Плов с курицей»' }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(await within(dialog).findByRole('button', { name: 'Выбрать «Индейка с булгуром»' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(screen.getByRole('dialog')).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Заменить «Плов с курицей»' }))
        await screen.findByRole('dialog')
        act(() => {
            fireEvent.keyDown(document, { key: 'Escape' })
        })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('альтернатив нет и ошибка загрузки альтернатив', async () => {
        get.mockImplementation((path: string) =>
            path.endsWith('/alternatives') ? Promise.resolve({ items: [] }) : Promise.resolve(plan())
        )
        render(<DayPlanView />)
        await screen.findByTestId('plan-item-snack')
        fireEvent.click(screen.getByRole('button', { name: 'Заменить «Йогурт с ягодами»' }))
        expect(await screen.findByText('Других подходящих блюд нет')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))

        get.mockImplementation((path: string) =>
            path.endsWith('/alternatives') ? Promise.reject(new ApiError(500, {})) : Promise.resolve(plan())
        )
        fireEvent.click(screen.getByRole('button', { name: 'Заменить «Сырники»' }))
        expect(await screen.findByText('Не удалось подобрать замену')).toBeInTheDocument()
    })
})
