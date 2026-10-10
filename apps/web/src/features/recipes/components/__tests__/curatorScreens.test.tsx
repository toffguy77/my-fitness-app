/**
 * Экраны куратора: очередь проверки, проверка рецепта, вкладка «Питание».
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ApiError } from '@/shared/errors/apiErrors'
import { track } from '@/shared/analytics'
import { CuratorRecipeReview } from '../CuratorRecipeReview'
import { CuratorClientNutrition } from '../CuratorClientNutrition'
import { ReviewQueue } from '../ReviewQueue'
import { bundle, RECIPE_ID, restrictions, summary, version } from '../../testing/fixtures'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }))
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
jest.mock('@/shared/hooks/useDebounce', () => ({ useDebounce: (value: unknown) => value }))
jest.mock('@/features/food-tracker/hooks/useFoodSearch', () => ({
    useFoodSearch: () => ({ query: '', results: [], isSearching: false, setQuery: jest.fn() }),
}))
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const post = apiClient.post as jest.Mock
const put = apiClient.put as jest.Mock
const del = apiClient.delete as jest.Mock

beforeEach(() => {
    jest.clearAllMocks()
})

describe('ReviewQueue', () => {
    it('рецепты на проверке ведут на страницу проверки', async () => {
        get.mockResolvedValue({ items: [summary({ working_state: 'review' })], total: 1, limit: 20, offset: 0 })
        render(<ReviewQueue />)
        const card = await screen.findByRole('link', { name: /Сырники/ })
        expect(card).toHaveAttribute('href', `/curator/recipes/${RECIPE_ID}`)
        expect(within(card).getByText('На проверке')).toBeInTheDocument()
        expect(get).toHaveBeenCalledWith('/api/v1/curator/recipes/review?page=1')
    })

    it('пустая очередь и сбой с повтором', async () => {
        get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [], total: 0, limit: 20, offset: 0 })
        render(<ReviewQueue />)
        fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
        expect(await screen.findByText('Очередь пуста — проверять нечего')).toBeInTheDocument()
    })
})

describe('CuratorRecipeReview', () => {
    const inReview = () => bundle({ working: version({ id: 'v-2', version: 2, state: 'review' }) })

    it('показывает рабочую версию и одобряет как есть', async () => {
        get.mockResolvedValue(inReview())
        post.mockResolvedValue(version({ id: 'v-2', version: 2, state: 'approved' }))
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)

        expect(await screen.findByText('Версия 2: На проверке')).toBeInTheDocument()
        expect(screen.getByText('Сейчас клиентам видна версия 1')).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: 'Сырники' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Одобрить' }))
        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/curator/recipes'))
        expect(post).toHaveBeenCalledWith(`/api/v1/curator/recipes/${RECIPE_ID}/approve`, {})
        expect(track).toHaveBeenCalledWith('recipe_approved')
    })

    it('правит граммовку и одобряет одним действием', async () => {
        get.mockResolvedValue(inReview())
        post.mockResolvedValue(version({ state: 'approved' }))
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)

        fireEvent.click(await screen.findByRole('button', { name: 'Править и одобрить' }))
        // Куратор не загружает фото — это право команды.
        expect(screen.queryByTestId('recipe-photo-input')).not.toBeInTheDocument()
        const ingredient = screen.getByRole('listitem', { name: 'Ингредиент 1' })
        fireEvent.change(within(ingredient).getByLabelText('Граммы'), { target: { value: '300' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить и одобрить' }))

        await waitFor(() => expect(post).toHaveBeenCalled())
        const [url, body] = post.mock.calls[0]
        expect(url).toBe(`/api/v1/curator/recipes/${RECIPE_ID}/approve`)
        expect(body.version.ingredients[0]).toMatchObject({ food_id: 'food-curd', grams: 300 })
        expect(body.version.photo_key).toBe('recipes/aaa.jpg')
    })

    it('отмена правки возвращает к просмотру', async () => {
        get.mockResolvedValue(inReview())
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Править и одобрить' }))
        fireEvent.click(screen.getByRole('button', { name: 'Отменить правку' }))
        expect(screen.getByRole('button', { name: 'Одобрить' })).toBeInTheDocument()
    })

    it('409 при одобрении — версию уже изменили', async () => {
        get.mockResolvedValue(inReview())
        post.mockRejectedValue(new ApiError(409, {}))
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Одобрить' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Версию уже изменили — обновите страницу'))
        expect(track).not.toHaveBeenCalled()
    })

    it('прочий сбой одобрения', async () => {
        get.mockResolvedValue(inReview())
        post.mockRejectedValue(new Error('down'))
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Одобрить' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось одобрить'))
    })

    it('вернуть можно только с комментарием', async () => {
        get.mockResolvedValue(inReview())
        post.mockResolvedValue(version({ state: 'draft' }))
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)

        fireEvent.click(await screen.findByRole('button', { name: 'Вернуть с комментарием' }))
        fireEvent.click(screen.getByRole('button', { name: 'Вернуть на доработку' }))
        expect(screen.getByRole('alert')).toHaveTextContent('Напишите, что поправить')
        expect(post).not.toHaveBeenCalled()

        fireEvent.change(screen.getByLabelText('Что поправить'), { target: { value: '  Мало соли  ' } })
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Вернуть на доработку' }))
        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/curator/recipes'))
        expect(post).toHaveBeenCalledWith(`/api/v1/curator/recipes/${RECIPE_ID}/return`, { comment: 'Мало соли' })
    })

    it('сбой возврата и отмена', async () => {
        get.mockResolvedValue(inReview())
        post.mockRejectedValue(new Error('down'))
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Вернуть с комментарием' }))
        fireEvent.change(screen.getByLabelText('Что поправить'), { target: { value: 'x' } })
        fireEvent.click(screen.getByRole('button', { name: 'Вернуть на доработку' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось вернуть рецепт'))
        fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
        expect(screen.getByRole('button', { name: 'Одобрить' })).toBeInTheDocument()
    })

    it('версия не на проверке — без действий; без рабочей версии — так и сказано', async () => {
        get.mockResolvedValueOnce(bundle({ working: version({ id: 'v-2', state: 'draft' }) }))
        const { unmount } = render(<CuratorRecipeReview recipeId={RECIPE_ID} />)
        expect(await screen.findByText('Эта версия не на проверке — действий не требуется.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Одобрить' })).not.toBeInTheDocument()
        unmount()

        get.mockResolvedValueOnce(bundle({ working: null, approved: null }))
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)
        expect(await screen.findByText('У рецепта нет версии в работе.')).toBeInTheDocument()
    })

    it('сбой загрузки — повтор', async () => {
        get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(inReview())
        render(<CuratorRecipeReview recipeId={RECIPE_ID} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
        expect(await screen.findByRole('button', { name: 'Одобрить' })).toBeInTheDocument()
    })
})

describe('CuratorClientNutrition', () => {
    const OTHER = '11111111-2222-3333-4444-555555555555'

    function route(hidden = [summary()], published = [summary(), summary({ id: OTHER, name: 'Омлет' })]) {
        get.mockImplementation((url: string) => {
            if (url.endsWith('/food-restrictions')) return Promise.resolve(restrictions({ rejected_recipes: [] }))
            if (url.endsWith('/hidden-recipes')) return Promise.resolve({ items: hidden })
            if (url.startsWith('/api/v1/curator/recipes?')) {
                return Promise.resolve({ items: published, total: published.length, limit: 20, offset: 0 })
            }
            return Promise.reject(new Error(url))
        })
    }

    it('ограничения клиента сохраняются в его карточку', async () => {
        route()
        put.mockResolvedValue(restrictions())
        render(<CuratorClientNutrition clientId={7} />)

        const nuts = await screen.findByLabelText('Орехи')
        expect(nuts).toBeChecked()
        fireEvent.click(screen.getByLabelText('Глютен'))
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить ограничения' }))
        await waitFor(() =>
            expect(put).toHaveBeenCalledWith('/api/v1/curator/clients/7/food-restrictions', {
                allergens: ['nuts', 'gluten'],
                excluded_food_ids: ['food-mushroom'],
            })
        )
    })

    it('скрытый рецепт можно показать снова', async () => {
        route()
        del.mockResolvedValue(undefined)
        render(<CuratorClientNutrition clientId={7} />)

        fireEvent.click(await screen.findByRole('button', { name: 'Показать снова: Сырники' }))
        await waitFor(() => expect(del).toHaveBeenCalledWith(`/api/v1/curator/clients/7/hidden-recipes/${RECIPE_ID}`))
        expect(toast.success).toHaveBeenCalledWith('Рецепт снова виден клиенту')
    })

    it('рецепт для скрытия выбирается из опубликованных; уже скрытые не предлагаются', async () => {
        route()
        put.mockResolvedValue(undefined)
        render(<CuratorClientNutrition clientId={7} />)
        await screen.findByRole('button', { name: 'Показать снова: Сырники' })

        const field = screen.getByLabelText('Найти рецепт, чтобы скрыть')
        fireEvent.change(field, { target: { value: 'о' } })
        expect(get.mock.calls.some(([url]) => String(url).startsWith('/api/v1/curator/recipes?'))).toBe(false)

        fireEvent.change(field, { target: { value: 'омлет' } })
        const hide = await screen.findByRole('button', { name: 'Скрыть: Омлет' })
        expect(get).toHaveBeenCalledWith('/api/v1/curator/recipes?q=%D0%BE%D0%BC%D0%BB%D0%B5%D1%82&page=1&page_size=20')
        expect(screen.queryByRole('button', { name: 'Скрыть: Сырники' })).not.toBeInTheDocument()

        fireEvent.click(hide)
        await waitFor(() => expect(put).toHaveBeenCalledWith(`/api/v1/curator/clients/7/hidden-recipes/${OTHER}`, {}))
        expect(toast.success).toHaveBeenCalledWith('Рецепт скрыт от клиента')
    })

    it('поиск: ничего не нашлось и сбой', async () => {
        route([], [])
        const { unmount } = render(<CuratorClientNutrition clientId={7} />)
        fireEvent.change(await screen.findByLabelText('Найти рецепт, чтобы скрыть'), { target: { value: 'щи' } })
        expect(await screen.findByText('Ничего не нашлось')).toBeInTheDocument()
        unmount()

        get.mockImplementation((url: string) =>
            url.startsWith('/api/v1/curator/recipes?')
                ? Promise.reject(new Error('down'))
                : Promise.resolve(url.endsWith('/hidden-recipes') ? { items: [] } : restrictions())
        )
        render(<CuratorClientNutrition clientId={7} />)
        fireEvent.change(await screen.findByLabelText('Найти рецепт, чтобы скрыть'), { target: { value: 'щи' } })
        expect(await screen.findByText('Не удалось найти рецепты')).toBeInTheDocument()
    })

    it('сбой скрытия и возврата — сообщение', async () => {
        route()
        del.mockRejectedValue(new Error('down'))
        put.mockRejectedValue(new Error('down'))
        render(<CuratorClientNutrition clientId={7} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Показать снова: Сырники' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось изменить список'))
        fireEvent.change(screen.getByLabelText('Найти рецепт, чтобы скрыть'), { target: { value: 'омлет' } })
        fireEvent.click(await screen.findByRole('button', { name: 'Скрыть: Омлет' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2))
    })

    it('пустой список скрытых и сбои загрузки', async () => {
        get.mockImplementation((url: string) =>
            url.endsWith('/food-restrictions') ? Promise.reject(new Error('down')) : Promise.resolve({ items: [] })
        )
        const { unmount } = render(<CuratorClientNutrition clientId={7} />)
        expect(await screen.findByText('Скрытых рецептов нет')).toBeInTheDocument()
        expect(screen.getByText('Не удалось загрузить ограничения')).toBeInTheDocument()
        unmount()

        get.mockImplementation((url: string) =>
            url.endsWith('/food-restrictions') ? Promise.resolve(restrictions()) : Promise.reject(new Error('down'))
        )
        render(<CuratorClientNutrition clientId={7} />)
        expect(await screen.findByText('Не удалось загрузить скрытые рецепты')).toBeInTheDocument()
    })
})
