/**
 * «Меню» клиента: каталог и карточка рецепта.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ApiError } from '@/shared/errors/apiErrors'
import { track } from '@/shared/analytics'
import { RecipeCatalogue } from '../RecipeCatalogue'
import { RecipeDetail } from '../RecipeDetail'
import { RECIPE_ID, summary, version } from '../../testing/fixtures'

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
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const post = apiClient.post as jest.Mock

function collection<T>(items: T[], total = items.length) {
    return { items, total, limit: 20, offset: 0 }
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('RecipeCatalogue', () => {
    it('показывает карточки с КБЖУ порции и отправляет menu_opened', async () => {
        get.mockResolvedValue(collection([summary(), summary({ id: 'r-2', name: 'Омлет', approximate: true, photo_url: null })]))

        render(<RecipeCatalogue />)

        expect(screen.getByRole('status')).toBeInTheDocument()
        const first = await screen.findByRole('link', { name: /Сырники/ })
        expect(first).toHaveAttribute('href', `/menu/recipes/${RECIPE_ID}`)
        expect(within(first).getByText('320 ккал')).toBeInTheDocument()
        expect(within(first).getByText('Б 21,3')).toBeInTheDocument()
        expect(within(first).getByText(/Порция 150 г/)).toBeInTheDocument()
        expect(within(first).getByRole('img', { name: 'Сырники' })).toBeInTheDocument()

        const second = screen.getByRole('link', { name: /Омлет/ })
        expect(within(second).getByText('КБЖУ приблизительное')).toBeInTheDocument()
        expect(within(second).getByTestId('recipe-photo-placeholder')).toBeInTheDocument()

        expect(track).toHaveBeenCalledWith('menu_opened')
        expect(get).toHaveBeenCalledWith('/api/v1/recipes?page=1&page_size=20')
    })

    it('фильтр по приёму пищи и поиск уходят в запрос', async () => {
        get.mockResolvedValue(collection([summary()]))
        render(<RecipeCatalogue />)
        await screen.findByRole('link', { name: /Сырники/ })

        fireEvent.click(screen.getByRole('button', { name: 'Завтрак' }))
        expect(screen.getByRole('button', { name: 'Завтрак' })).toHaveAttribute('aria-pressed', 'true')
        await waitFor(() =>
            expect(get).toHaveBeenLastCalledWith('/api/v1/recipes?meal_type=breakfast&page=1&page_size=20')
        )

        fireEvent.change(screen.getByLabelText('Поиск рецептов'), { target: { value: ' омлет ' } })
        await waitFor(() =>
            expect(get).toHaveBeenLastCalledWith(
                '/api/v1/recipes?q=%D0%BE%D0%BC%D0%BB%D0%B5%D1%82&meal_type=breakfast&page=1&page_size=20'
            )
        )
    })

    it('пустой каталог объясняет, откуда берутся рецепты', async () => {
        get.mockResolvedValue(collection([]))
        render(<RecipeCatalogue />)
        expect(await screen.findByText('Рецептов пока нет')).toBeInTheDocument()
        expect(screen.getByText(/после того, как их проверит и одобрит куратор/)).toBeInTheDocument()
    })

    it('пустой результат фильтра — «ничего не нашлось», а не пустой каталог', async () => {
        get.mockResolvedValue(collection([]))
        render(<RecipeCatalogue />)
        await screen.findByText('Рецептов пока нет')
        fireEvent.click(screen.getByRole('button', { name: 'Ужин' }))
        expect(await screen.findByText('По этому запросу ничего не нашлось')).toBeInTheDocument()
    })

    it('«Показать ещё» догружает следующую страницу', async () => {
        get.mockResolvedValueOnce(collection([summary()], 2)).mockResolvedValueOnce(
            collection([summary({ id: 'r-2', name: 'Омлет' })], 2)
        )
        render(<RecipeCatalogue />)
        await screen.findByRole('link', { name: /Сырники/ })

        fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))
        expect(await screen.findByRole('link', { name: /Омлет/ })).toBeInTheDocument()
        expect(get).toHaveBeenLastCalledWith('/api/v1/recipes?page=2&page_size=20')
        expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument()
    })

    it('сбой следующей страницы оставляет кнопку на месте', async () => {
        get.mockResolvedValueOnce(collection([summary()], 2)).mockRejectedValueOnce(new Error('down'))
        render(<RecipeCatalogue />)
        await screen.findByRole('link', { name: /Сырники/ })
        fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Показать ещё' })).not.toBeDisabled())
    })

    it('сбой загрузки — сообщение с повтором', async () => {
        get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(collection([summary()]))
        render(<RecipeCatalogue />)
        expect(await screen.findByText('Не удалось загрузить рецепты')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(await screen.findByRole('link', { name: /Сырники/ })).toBeInTheDocument()
    })
})

describe('RecipeDetail', () => {
    it('показывает рецепт целиком и отправляет recipe_opened', async () => {
        get.mockResolvedValue(version())
        render(<RecipeDetail id={RECIPE_ID} />)

        expect(await screen.findByRole('heading', { level: 1, name: 'Сырники' })).toBeInTheDocument()
        expect(get).toHaveBeenCalledWith(`/api/v1/recipes/${RECIPE_ID}`)
        expect(track).toHaveBeenCalledWith('recipe_opened')

        expect(screen.getByText('25 мин')).toBeInTheDocument()
        expect(screen.getByText('Средне')).toBeInTheDocument()
        expect(screen.getByText('150 г')).toBeInTheDocument()
        expect(screen.getByText('На порцию')).toBeInTheDocument()
        expect(screen.getByText('На 100 г')).toBeInTheDocument()
        expect(screen.getByText('214')).toBeInTheDocument()
        expect(screen.queryByText('КБЖУ приблизительное')).not.toBeInTheDocument()

        // Ингредиенты по позиции, с подписью количества, граммами или «по вкусу».
        const items = screen.getAllByRole('listitem').filter((li) => li.closest('ul')?.className.includes('rounded-card'))
        expect(items.map((li) => li.textContent)).toEqual(['Творог 5%250 г', 'Яйцо куриное1 шт.', 'Сольпо вкусу'])

        // Шаги по позиции, у шага с фото — фото.
        const steps = screen.getAllByRole('listitem').filter((li) => li.closest('ol'))
        expect(steps[0]).toHaveTextContent('Смешать творог с яйцом')
        expect(within(steps[1]).getByRole('img', { name: 'Шаг 2' })).toBeInTheDocument()
    })

    it('приблизительное КБЖУ помечено', async () => {
        get.mockResolvedValue(version({ approximate: true, yield_grams: null }))
        render(<RecipeDetail id={RECIPE_ID} />)
        expect(await screen.findByRole('note')).toHaveTextContent('КБЖУ приблизительное')
    })

    it('«Не предлагать это блюдо» отклоняет и возвращает в меню', async () => {
        get.mockResolvedValue(version())
        post.mockResolvedValue(undefined)
        render(<RecipeDetail id={RECIPE_ID} />)

        fireEvent.click(await screen.findByRole('button', { name: 'Не предлагать это блюдо' }))

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/menu'))
        expect(post).toHaveBeenCalledWith(`/api/v1/recipes/${RECIPE_ID}/reject`, {})
        expect(track).toHaveBeenCalledWith('recipe_rejected')
        expect(toast.success).toHaveBeenCalled()
    })

    it('сбой отклонения — сообщение, остаёмся на карточке', async () => {
        get.mockResolvedValue(version())
        post.mockRejectedValue(new Error('down'))
        render(<RecipeDetail id={RECIPE_ID} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Не предлагать это блюдо' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось скрыть блюдо'))
        expect(mockPush).not.toHaveBeenCalled()
        expect(track).not.toHaveBeenCalledWith('recipe_rejected')
    })

    it('недоступный рецепт (404) — «Рецепт недоступен»', async () => {
        get.mockRejectedValue(new ApiError(404, {}))
        render(<RecipeDetail id={RECIPE_ID} />)
        expect(await screen.findByText('Рецепт недоступен')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    })

    it('прочий сбой — сообщение с повтором', async () => {
        get.mockRejectedValueOnce(new ApiError(500, {})).mockResolvedValueOnce(version())
        render(<RecipeDetail id={RECIPE_ID} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
        expect(await screen.findByRole('heading', { level: 1, name: 'Сырники' })).toBeInTheDocument()
    })

    it('фото с чужого хоста не рисуется', async () => {
        get.mockResolvedValue(version({ photo_url: 'https://evil.example/x.jpg', steps: [] }))
        render(<RecipeDetail id={RECIPE_ID} />)
        await screen.findByRole('heading', { level: 1, name: 'Сырники' })
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
        expect(screen.getByTestId('recipe-photo-placeholder')).toBeInTheDocument()
    })
})
