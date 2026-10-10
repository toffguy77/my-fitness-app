/**
 * «Ограничения в питании» клиента и общая форма ограничений.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ClientFoodRestrictions } from '../ClientFoodRestrictions'
import { FoodRestrictionsForm } from '../FoodRestrictionsForm'
import { RECIPE_ID, restrictions } from '../../testing/fixtures'

jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }))

const mockSearch = {
    query: '',
    results: [] as { id: string; name: string }[],
    isSearching: false,
    setQuery: jest.fn(),
}
jest.mock('@/features/food-tracker/hooks/useFoodSearch', () => ({ useFoodSearch: () => mockSearch }))
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const put = apiClient.put as jest.Mock
const del = apiClient.delete as jest.Mock

beforeEach(() => {
    jest.clearAllMocks()
    mockSearch.query = ''
    mockSearch.results = []
    mockSearch.isSearching = false
})

describe('FoodRestrictionsForm', () => {
    it('аллергены по-русски, исключения из поиска дневника, сохранение', async () => {
        const save = jest.fn().mockResolvedValue(restrictions())
        const onSaved = jest.fn()
        mockSearch.query = 'мол'
        mockSearch.results = [
            { id: '42', name: 'Молоко 2,5%' },
            { id: 'food-mushroom', name: 'Грибы' },
        ]
        render(<FoodRestrictionsForm initial={restrictions()} save={save} onSaved={onSaved} />)

        for (const label of ['Орехи', 'Арахис', 'Глютен', 'Лактоза', 'Яйца', 'Рыба', 'Морепродукты', 'Соя', 'Кунжут', 'Горчица', 'Сельдерей']) {
            expect(screen.getByLabelText(label)).toBeInTheDocument()
        }
        expect(screen.getByLabelText('Орехи')).toBeChecked()

        fireEvent.click(screen.getByLabelText('Орехи'))
        fireEvent.click(screen.getByLabelText('Соя'))

        fireEvent.change(screen.getByLabelText('Найти продукт'), { target: { value: 'моло' } })
        expect(mockSearch.setQuery).toHaveBeenCalledWith('моло')

        fireEvent.click(screen.getByRole('button', { name: 'Молоко 2,5%' }))
        // Уже исключённый продукт второй раз не добавляется.
        fireEvent.click(screen.getByRole('button', { name: 'Грибы' }))
        expect(mockSearch.setQuery).toHaveBeenLastCalledWith('')

        fireEvent.click(screen.getByRole('button', { name: 'Убрать «Грибы»' }))

        fireEvent.click(screen.getByRole('button', { name: 'Сохранить ограничения' }))
        await waitFor(() => expect(onSaved).toHaveBeenCalled())
        expect(save).toHaveBeenCalledWith({ allergens: ['soy'], excluded_food_ids: ['42'] })
        expect(toast.success).toHaveBeenCalledWith('Ограничения сохранены')
    })

    it('без исключений — подпись; идёт поиск — подпись; сбой сохранения — сообщение', async () => {
        mockSearch.isSearching = true
        const save = jest.fn().mockRejectedValue(new Error('down'))
        render(<FoodRestrictionsForm initial={restrictions({ excluded_foods: [] })} save={save} />)
        expect(screen.getByText('Исключённых продуктов нет')).toBeInTheDocument()
        expect(screen.getByText('Ищем…')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить ограничения' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить ограничения'))
    })
})

describe('ClientFoodRestrictions', () => {
    it('свои ограничения сохраняются, отклонённое блюдо возвращается', async () => {
        get.mockResolvedValue(restrictions())
        put.mockResolvedValue(restrictions())
        del.mockResolvedValue(undefined)
        render(<ClientFoodRestrictions />)

        expect(await screen.findByText('Сырники')).toBeInTheDocument()
        expect(get).toHaveBeenCalledWith('/api/v1/food-restrictions')

        fireEvent.click(screen.getByRole('button', { name: 'Сохранить ограничения' }))
        await waitFor(() =>
            expect(put).toHaveBeenCalledWith('/api/v1/food-restrictions', {
                allergens: ['nuts'],
                excluded_food_ids: ['food-mushroom'],
            })
        )

        fireEvent.click(screen.getByRole('button', { name: 'Вернуть: Сырники' }))
        await waitFor(() => expect(del).toHaveBeenCalledWith(`/api/v1/recipes/${RECIPE_ID}/reject`))
        expect(await screen.findByText('Вы не скрывали ни одного блюда')).toBeInTheDocument()
        expect(toast.success).toHaveBeenCalledWith('Блюдо снова в меню')
    })

    it('сбой возврата блюда — сообщение, блюдо в списке', async () => {
        get.mockResolvedValue(restrictions())
        del.mockRejectedValue(new Error('down'))
        render(<ClientFoodRestrictions />)
        fireEvent.click(await screen.findByRole('button', { name: 'Вернуть: Сырники' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не удалось вернуть блюдо'))
        expect(screen.getByText('Сырники')).toBeInTheDocument()
    })

    it('сбой загрузки — повтор', async () => {
        get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(restrictions({ rejected_recipes: [] }))
        render(<ClientFoodRestrictions />)
        fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
        expect(await screen.findByText('Вы не скрывали ни одного блюда')).toBeInTheDocument()
    })
})
