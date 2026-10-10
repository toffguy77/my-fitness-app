/**
 * Экраны команды: редактор рецепта, список, импорт ВкусВилла.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ApiError } from '@/shared/errors/apiErrors'
import { track } from '@/shared/analytics'
import { AdminRecipeEditor } from '../AdminRecipeEditor'
import { AdminRecipeList, summaryBadge } from '../AdminRecipeList'
import { bundle, RECIPE_ID, summary, version } from '../../testing/fixtures'

const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }))
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
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), postFormData: jest.fn() },
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const post = apiClient.post as jest.Mock
const put = apiClient.put as jest.Mock
const postFormData = apiClient.postFormData as jest.Mock

const CATALOGUE = {
    items: [
        { food_id: 101, name: 'Творог 5%', kcal_100: 121, protein_100: 17, fat_100: 5, carbs_100: 1.8, default_weight: null },
    ],
}

beforeEach(() => {
    jest.clearAllMocks()
})

function lastBody(mock: jest.Mock) {
    return mock.mock.calls[mock.mock.calls.length - 1][1]
}

describe('AdminRecipeEditor — новый рецепт', () => {
    it('собирает рецепт, подбирает продукт из каталога и создаёт его', async () => {
        get.mockImplementation((url: string) =>
            url.startsWith('/api/v1/admin/recipes/catalogue-search') ? Promise.resolve(CATALOGUE) : Promise.reject(new Error(url))
        )
        post.mockResolvedValue({ recipe: summary({ id: 'new-id' }), version: version() })

        render(<AdminRecipeEditor recipeId={null} />)

        expect(screen.getByRole('heading', { level: 1, name: 'Новый рецепт' })).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Сырники' } })
        fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Вкусно' } })
        fireEvent.change(screen.getByLabelText('Сложность'), { target: { value: 'hard' } })
        fireEvent.change(screen.getByLabelText('Вес готового блюда, г'), { target: { value: '300' } })
        fireEvent.change(screen.getByLabelText('Теги через запятую'), { target: { value: 'творог, быстро' } })
        fireEvent.click(screen.getByLabelText('Завтрак'))
        fireEvent.click(screen.getByLabelText('Лактоза'))

        // Без веса готового блюда редактор подсказывает его заполнить.
        expect(screen.queryByText(/КБЖУ будет приблизительным/)).not.toBeInTheDocument()

        const ingredient = screen.getByRole('listitem', { name: 'Ингредиент 1' })
        expect(within(ingredient).getByText('Продукт не выбран')).toBeInTheDocument()
        fireEvent.click(within(ingredient).getByRole('button', { name: 'Найти продукт в каталоге' }))
        fireEvent.change(within(ingredient).getByLabelText('Найти продукт в каталоге'), { target: { value: 'твор' } })
        fireEvent.click(await within(ingredient).findByRole('button', { name: /Творог 5%/ }))
        expect(get).toHaveBeenCalledWith('/api/v1/admin/recipes/catalogue-search?q=%D1%82%D0%B2%D0%BE%D1%80')
        expect(within(ingredient).getByText('Творог 5%')).toBeInTheDocument()
        fireEvent.change(within(ingredient).getByLabelText('Граммы'), { target: { value: '250' } })

        fireEvent.change(screen.getByLabelText('Шаг 1'), { target: { value: 'Смешать' } })

        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/admin/recipes/new-id'))
        expect(post).toHaveBeenCalledWith('/api/v1/admin/recipes', {
            name: 'Сырники',
            description: 'Вкусно',
            photo_key: null,
            cook_minutes: 30,
            complexity: 'hard',
            servings: 2,
            yield_grams: 300,
            meal_types: ['breakfast'],
            tags: ['творог', 'быстро'],
            allergens: ['lactose'],
            ingredients: [{ food_id: 101, source_name: null, grams: 250, display_quantity: null, to_taste: false }],
            steps: [{ text: 'Смешать', photo_key: null }],
        })
        expect(toast.success).toHaveBeenCalledWith('Черновик сохранён')
    })

    it('подбор продукта: пустой ответ, сбой и отмена', async () => {
        get.mockResolvedValueOnce({ items: [] }).mockRejectedValueOnce(new Error('down'))
        render(<AdminRecipeEditor recipeId={null} />)
        const ingredient = screen.getByRole('listitem', { name: 'Ингредиент 1' })
        fireEvent.click(within(ingredient).getByRole('button', { name: 'Найти продукт в каталоге' }))
        const field = within(ingredient).getByLabelText('Найти продукт в каталоге')

        fireEvent.change(field, { target: { value: 'x' } })
        expect(get).not.toHaveBeenCalled()

        fireEvent.change(field, { target: { value: 'xyz' } })
        expect(await within(ingredient).findByText('Ничего не нашлось')).toBeInTheDocument()
        fireEvent.change(field, { target: { value: 'xyzw' } })
        expect(await within(ingredient).findByText('Поиск не удался')).toBeInTheDocument()

        fireEvent.click(within(ingredient).getByRole('button', { name: 'Отмена' }))
        expect(within(ingredient).queryByLabelText('Найти продукт в каталоге')).not.toBeInTheDocument()
    })

    it('«по вкусу» выключает граммы; строки добавляются и убираются', () => {
        render(<AdminRecipeEditor recipeId={null} />)
        const ingredient = screen.getByRole('listitem', { name: 'Ингредиент 1' })
        fireEvent.change(within(ingredient).getByLabelText('Граммы'), { target: { value: '5' } })
        fireEvent.click(within(ingredient).getByLabelText('По вкусу'))
        expect(within(ingredient).getByLabelText('Граммы')).toBeDisabled()
        expect(within(ingredient).getByLabelText('Граммы')).toHaveValue(null)
        fireEvent.change(within(ingredient).getByLabelText('Подпись количества'), { target: { value: 'щепотка' } })
        fireEvent.click(within(ingredient).getByLabelText('По вкусу'))
        expect(within(ingredient).getByLabelText('Граммы')).not.toBeDisabled()

        fireEvent.click(screen.getByRole('button', { name: 'Добавить ингредиент' }))
        expect(screen.getByRole('listitem', { name: 'Ингредиент 2' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Убрать ингредиент 2' }))
        expect(screen.queryByRole('listitem', { name: 'Ингредиент 2' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Добавить шаг' }))
        expect(screen.getByLabelText('Шаг 2')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Убрать шаг 2' }))
        expect(screen.queryByLabelText('Шаг 2')).not.toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Время, мин'), { target: { value: '15' } })
        fireEvent.change(screen.getByLabelText('Порций'), { target: { value: '4' } })
        fireEvent.click(screen.getByLabelText('Завтрак'))
        fireEvent.click(screen.getByLabelText('Завтрак'))
        expect(screen.getByLabelText('Завтрак')).not.toBeChecked()
    })

    it('отправка нового: создаёт, отправляет и уходит на его адрес', async () => {
        post.mockImplementation((url: string) =>
            url === '/api/v1/admin/recipes'
                ? Promise.resolve({ recipe: summary({ id: 'new-id' }), version: version() })
                : Promise.resolve(version({ state: 'review' }))
        )
        render(<AdminRecipeEditor recipeId={null} />)
        fireEvent.click(screen.getByRole('button', { name: 'Отправить на проверку' }))
        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/admin/recipes/new-id'))
        expect(post).toHaveBeenCalledWith('/api/v1/admin/recipes/new-id/submit', {})
        expect(track).toHaveBeenCalledWith('recipe_submitted')
    })

    it('отказ в отправке после создания — остаёмся на созданном черновике и видим, что не заполнено', async () => {
        post.mockImplementation((url: string) =>
            url === '/api/v1/admin/recipes'
                ? Promise.resolve({ recipe: summary({ id: 'new-id' }), version: version() })
                : Promise.reject(new ApiError(422, {
                      status: 'error',
                      code: 'validation',
                      params: { missing: ['steps', 'meal_types', 'ingredients.food_id'] },
                  }))
        )
        render(<AdminRecipeEditor recipeId={null} />)
        fireEvent.click(screen.getByRole('button', { name: 'Отправить на проверку' }))

        const alert = await screen.findByText('Не заполнено')
        const box = alert.closest('[role="alert"]') as HTMLElement
        expect(within(box).getByText('Шаги')).toBeInTheDocument()
        expect(within(box).getByText('Приёмы пищи')).toBeInTheDocument()
        expect(within(box).getByText('Ингредиенты: не у всех выбран продукт из каталога')).toBeInTheDocument()
        expect(mockReplace).toHaveBeenCalledWith('/admin/recipes/new-id')
        expect(track).not.toHaveBeenCalled()
    })

    it('сбой сохранения — сообщение', async () => {
        post.mockRejectedValue(new Error('down'))
        render(<AdminRecipeEditor recipeId={null} />)
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить черновик'))
        expect(mockReplace).not.toHaveBeenCalled()
    })
})

describe('AdminRecipeEditor — существующий рецепт', () => {
    it('черновик, возвращённый куратором: комментарий виден, отправка сохраняет и отправляет', async () => {
        const working = version({ id: 'v-2', version: 2, state: 'draft', review_comment: 'Уточните вес творога' })
        get.mockResolvedValue(bundle({ working }))
        put.mockResolvedValue(working)
        post.mockResolvedValue(version({ id: 'v-2', state: 'review' }))

        render(<AdminRecipeEditor recipeId={RECIPE_ID} />)

        expect(await screen.findByText('Уточните вес творога')).toBeInTheDocument()
        expect(screen.getByText('Куратор вернул на доработку')).toBeInTheDocument()
        expect(screen.getByText('Версия 2: Черновик')).toBeInTheDocument()
        expect(screen.getByText('Опубликован')).toBeInTheDocument()
        expect(screen.getByLabelText('Название')).toHaveValue('Сырники')

        fireEvent.click(screen.getByRole('button', { name: 'Отправить на проверку' }))

        await waitFor(() => expect(track).toHaveBeenCalledWith('recipe_submitted'))
        expect(put).toHaveBeenCalledWith(`/api/v1/admin/recipes/${RECIPE_ID}/draft`, expect.objectContaining({ name: 'Сырники' }))
        // Фото не теряются при повторном сохранении.
        expect(lastBody(put).photo_key).toBe('recipes/aaa.jpg')
        expect(lastBody(put).steps[1].photo_key).toBe('recipes/step2.jpg')
        expect(post).toHaveBeenCalledWith(`/api/v1/admin/recipes/${RECIPE_ID}/submit`, {})
        expect(get).toHaveBeenCalledTimes(2)
        expect(mockReplace).not.toHaveBeenCalled()
    })

    it('черновик из импорта: кандидата нужно подтвердить', async () => {
        const working = version({
            id: 'v-1',
            state: 'draft',
            ingredients: [
                {
                    position: 1,
                    food_id: null,
                    food_name: null,
                    source_name: 'Творог',
                    grams: 200,
                    display_quantity: '200 г',
                    to_taste: false,
                    candidates: [
                        { food_id: 'cand-1', name: 'Творог 5%', default_weight: null },
                        { food_id: 'cand-2', name: 'Творог 9%', default_weight: null },
                    ],
                },
            ],
        })
        get.mockResolvedValue(bundle({ approved: null, working, recipe: summary({ approved_version: null, source: 'vkusvill' }) }))
        put.mockResolvedValue(working)

        render(<AdminRecipeEditor recipeId={RECIPE_ID} />)

        const ingredient = await screen.findByRole('listitem', { name: 'Ингредиент 1' })
        expect(within(ingredient).getByText('В источнике: Творог')).toBeInTheDocument()
        expect(within(ingredient).getByText('Подходящие продукты — выберите один')).toBeInTheDocument()
        fireEvent.click(within(ingredient).getByRole('button', { name: 'Выбрать: Творог 9%' }))
        expect(within(ingredient).queryByText('Подходящие продукты — выберите один')).not.toBeInTheDocument()
        expect(within(ingredient).getByRole('button', { name: 'Сменить продукт' })).toBeInTheDocument()

        // Без одобренной версии публиковать нечего.
        expect(screen.queryByRole('button', { name: 'Снять с публикации' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(put).toHaveBeenCalled())
        expect(lastBody(put).ingredients[0]).toEqual({
            food_id: 'cand-2',
            source_name: 'Творог',
            grams: 200,
            display_quantity: '200 г',
            to_taste: false,
        })
    })

    it('версия на проверке подписана', async () => {
        get.mockResolvedValue(bundle({ working: version({ id: 'v-2', version: 2, state: 'review' }) }))
        render(<AdminRecipeEditor recipeId={RECIPE_ID} />)
        expect(await screen.findByText(/Версия на проверке у куратора/)).toBeInTheDocument()
    })

    it('снятие с публикации и возврат', async () => {
        get.mockResolvedValueOnce(bundle()).mockResolvedValueOnce(bundle({ recipe: summary({ status: 'unpublished' }) }))
        post.mockResolvedValue(summary({ status: 'unpublished' }))
        render(<AdminRecipeEditor recipeId={RECIPE_ID} />)

        fireEvent.click(await screen.findByRole('button', { name: 'Снять с публикации' }))
        await waitFor(() => expect(post).toHaveBeenCalledWith(`/api/v1/admin/recipes/${RECIPE_ID}/unpublish`, {}))
        expect(toast.success).toHaveBeenCalledWith('Рецепт снят с публикации')

        fireEvent.click(await screen.findByRole('button', { name: 'Вернуть в публикацию' }))
        await waitFor(() => expect(post).toHaveBeenCalledWith(`/api/v1/admin/recipes/${RECIPE_ID}/publish`, {}))
    })

    it('сбой публикации — сообщение', async () => {
        get.mockResolvedValue(bundle())
        post.mockRejectedValue(new Error('down'))
        render(<AdminRecipeEditor recipeId={RECIPE_ID} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Снять с публикации' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось изменить публикацию'))
    })

    it('загрузка фото: успех, не изображение, прочий сбой, удаление', async () => {
        get.mockResolvedValue(bundle({ approved: version({ photo_key: null, photo_url: null, steps: [] }) }))
        postFormData
            .mockResolvedValueOnce({ photo_key: 'recipes/new.jpg', photo_url: 'https://storage.yandexcloud.net/curator-content/recipes/new.jpg' })
            .mockRejectedValueOnce(new ApiError(415, {}))
            .mockRejectedValueOnce(new ApiError(503, {}))
            .mockRejectedValueOnce(new ApiError(500, {}))
        render(<AdminRecipeEditor recipeId={RECIPE_ID} />)

        const input = (await screen.findAllByTestId('recipe-photo-input'))[0]
        const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })

        fireEvent.change(input, { target: { files: [file] } })
        expect(await screen.findByRole('img', { name: 'Фото блюда' })).toHaveAttribute(
            'src',
            'https://storage.yandexcloud.net/curator-content/recipes/new.jpg'
        )
        expect(screen.getByText('Заменить фото')).toBeInTheDocument()

        fireEvent.change(screen.getAllByTestId('recipe-photo-input')[0], { target: { files: [file] } })
        expect(await screen.findByText('Это не изображение')).toBeInTheDocument()

        fireEvent.change(screen.getAllByTestId('recipe-photo-input')[0], { target: { files: [file] } })
        expect(await screen.findByText('Загрузка фото выключена: хранилище не настроено')).toBeInTheDocument()

        fireEvent.change(screen.getAllByTestId('recipe-photo-input')[0], { target: { files: [file] } })
        expect(await screen.findByText('Не удалось загрузить фото')).toBeInTheDocument()

        // Пустой выбор файла ничего не отправляет.
        fireEvent.change(screen.getAllByTestId('recipe-photo-input')[0], { target: { files: [] } })
        expect(postFormData).toHaveBeenCalledTimes(4)

        fireEvent.click(screen.getByRole('button', { name: 'Убрать фото' }))
        expect(screen.queryByRole('img', { name: 'Фото блюда' })).not.toBeInTheDocument()
    })

    it('сбой загрузки рецепта — сообщение с повтором', async () => {
        get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(bundle())
        render(<AdminRecipeEditor recipeId={RECIPE_ID} />)
        expect(await screen.findByText('Не удалось загрузить рецепты')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(await screen.findByLabelText('Название')).toHaveValue('Сырники')
    })
})

describe('AdminRecipeList', () => {
    const list = (items = [summary(), summary({ id: 'r-2', name: 'Омлет', working_state: 'review' })]) => ({
        items,
        total: items.length,
        limit: 100,
        offset: 0,
    })

    it('список с состояниями, ссылки на редактор и «Новый рецепт»', async () => {
        get.mockResolvedValue(list())
        render(<AdminRecipeList />)

        const omelette = await screen.findByRole('link', { name: /Омлет/ })
        expect(omelette).toHaveAttribute('href', '/admin/recipes/r-2')
        expect(within(omelette).getByText('На проверке')).toBeInTheDocument()
        expect(within(screen.getByRole('link', { name: /Сырники/ })).getByText('Опубликован')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Новый рецепт' })).toHaveAttribute('href', '/admin/recipes/new')
        expect(get).toHaveBeenCalledWith('/api/v1/admin/recipes?page=1&page_size=100')
    })

    it('фильтр по состоянию и поиск уходят в запрос', async () => {
        get.mockResolvedValue(list([]))
        render(<AdminRecipeList />)
        expect(await screen.findByText('Рецептов пока нет')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Состояние'), { target: { value: 'draft' } })
        fireEvent.change(screen.getByLabelText('Поиск по названию'), { target: { value: 'суп' } })
        await waitFor(() =>
            expect(get).toHaveBeenLastCalledWith('/api/v1/admin/recipes?q=%D1%81%D1%83%D0%BF&state=draft&page=1&page_size=100')
        )
    })

    it('сбой — сообщение с повтором', async () => {
        get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(list())
        render(<AdminRecipeList />)
        fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
        expect(await screen.findByRole('link', { name: /Омлет/ })).toBeInTheDocument()
    })

    it('summaryBadge: рабочая версия важнее публикации', () => {
        expect(summaryBadge(summary({ working_state: 'draft' }))).toBe('Черновик')
        expect(summaryBadge(summary({ status: 'unpublished' }))).toBe('Снят с публикации')
    })
})

describe('Импорт из ВкусВилла', () => {
    function openImport() {
        get.mockImplementation((url: string) =>
            url.startsWith('/api/v1/admin/recipes/import/vkusvill')
                ? Promise.resolve(vkusvillResponse(url))
                : Promise.resolve({ items: [], total: 0, limit: 100, offset: 0 })
        )
        render(<AdminRecipeList />)
        fireEvent.click(screen.getByRole('button', { name: 'Импорт из ВкусВилла' }))
    }

    let vkusvillResponse: (url: string) => unknown

    it('поиск, «ещё», импорт нового и открытие уже импортированного', async () => {
        vkusvillResponse = (url) =>
            url.includes('page=2')
                ? { items: [{ source_ref: 'vv-3', name: 'Блины', photo_url: null, portions: null, imported_recipe_id: null }], has_more: false }
                : {
                      items: [
                          { source_ref: 'vv-1', name: 'Сырники ВВ', photo_url: null, portions: 4, imported_recipe_id: null },
                          { source_ref: 'vv-2', name: 'Омлет ВВ', photo_url: null, portions: 2, imported_recipe_id: 'r-9' },
                      ],
                      has_more: true,
                  }
        post.mockResolvedValue({ recipe_id: 'r-new' })
        openImport()

        fireEvent.change(screen.getByLabelText('Поиск рецептов ВкусВилла'), { target: { value: 'сырники' } })
        fireEvent.click(screen.getByRole('button', { name: 'Найти' }))

        expect(await screen.findByText('Сырники ВВ')).toBeInTheDocument()
        expect(screen.getByText('Порций: 4')).toBeInTheDocument()
        expect(screen.getByText('Уже импортирован')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Ещё' }))
        expect(await screen.findByText('Блины')).toBeInTheDocument()
        expect(screen.getByText('Сырники ВВ')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Открыть: Омлет ВВ' }))
        expect(mockPush).toHaveBeenCalledWith('/admin/recipes/r-9')

        fireEvent.click(screen.getByRole('button', { name: 'Импортировать: Сырники ВВ' }))
        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/admin/recipes/r-new'))
        expect(post).toHaveBeenCalledWith(
            '/api/v1/admin/recipes/import/vkusvill/vv-1?q=%D0%A1%D1%8B%D1%80%D0%BD%D0%B8%D0%BA%D0%B8+%D0%92%D0%92',
            {}
        )
    })

    it('ВкусВилл недоступен (502) — понятное сообщение; пустой запрос не уходит', async () => {
        vkusvillResponse = () => ({ items: [], has_more: false })
        openImport()

        fireEvent.click(screen.getByRole('button', { name: 'Найти' }))
        expect(get.mock.calls.some(([url]) => String(url).includes('vkusvill'))).toBe(false)

        fireEvent.change(screen.getByLabelText('Поиск рецептов ВкусВилла'), { target: { value: 'щи' } })
        fireEvent.click(screen.getByRole('button', { name: 'Найти' }))
        expect(await screen.findByText('Ничего не нашлось')).toBeInTheDocument()

        get.mockRejectedValue(new ApiError(502, { code: 'internal' }))
        fireEvent.click(screen.getByRole('button', { name: 'Найти' }))
        expect(await screen.findByText('ВкусВилл сейчас не отвечает. Попробуйте позже.')).toBeInTheDocument()

        get.mockRejectedValue(new ApiError(503, { code: 'feature_unavailable' }))
        fireEvent.click(screen.getByRole('button', { name: 'Найти' }))
        expect(await screen.findByText(/Импорт выключен/)).toBeInTheDocument()
    })

    it('сбой импорта: 502 и прочее; панель закрывается', async () => {
        vkusvillResponse = () => ({
            items: [{ source_ref: 'vv-1', name: 'Сырники ВВ', photo_url: null, portions: 4, imported_recipe_id: null }],
            has_more: false,
        })
        post.mockRejectedValueOnce(new ApiError(502, {}))
            .mockRejectedValueOnce(new ApiError(503, {}))
            .mockRejectedValueOnce(new ApiError(500, {}))
        openImport()
        fireEvent.change(screen.getByLabelText('Поиск рецептов ВкусВилла'), { target: { value: 'сыр' } })
        fireEvent.click(screen.getByRole('button', { name: 'Найти' }))

        fireEvent.click(await screen.findByRole('button', { name: 'Импортировать: Сырники ВВ' }))
        expect(await screen.findByText('ВкусВилл сейчас не отвечает. Попробуйте позже.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Импортировать: Сырники ВВ' }))
        expect(await screen.findByText(/Импорт выключен/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Импортировать: Сырники ВВ' }))
        expect(await screen.findByText('Не удалось импортировать рецепт')).toBeInTheDocument()
        expect(mockPush).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Закрыть импорт' }))
        expect(screen.queryByLabelText('Поиск рецептов ВкусВилла')).not.toBeInTheDocument()
    })
})
