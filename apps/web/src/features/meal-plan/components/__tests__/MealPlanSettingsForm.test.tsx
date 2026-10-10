/**
 * «Приёмы пищи в плане» в настройках: хотя бы один обязателен.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ApiError } from '@/shared/errors/apiErrors'
import { MealPlanSettingsForm } from '../MealPlanSettingsForm'

jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const put = apiClient.put as jest.Mock
const PATH = '/api/v1/meal-plan-settings'

beforeEach(() => {
    jest.clearAllMocks()
})

describe('MealPlanSettingsForm', () => {
    it('показывает выбранные приёмы и сохраняет изменения в порядке дня', async () => {
        get.mockResolvedValue({ meal_types: ['breakfast', 'lunch', 'dinner', 'snack'] })
        put.mockResolvedValue({ meal_types: ['breakfast', 'lunch', 'dinner'] })
        render(<MealPlanSettingsForm />)

        expect(screen.getByRole('heading', { name: 'Приёмы пищи в плане' })).toBeInTheDocument()
        const snack = await screen.findByRole('checkbox', { name: 'Перекус' })
        expect(snack).toBeChecked()
        expect(get).toHaveBeenCalledWith(PATH)

        const save = screen.getByRole('button', { name: 'Сохранить приёмы пищи' })
        expect(save).toBeDisabled()

        fireEvent.click(snack)
        expect(snack).not.toBeChecked()
        expect(save).toBeEnabled()
        fireEvent.click(save)

        await waitFor(() => expect(put).toHaveBeenCalledWith(PATH, { meal_types: ['breakfast', 'lunch', 'dinner'] }))
        expect(toast.success).toHaveBeenCalledWith('Приёмы пищи сохранены')
        await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить приёмы пищи' })).toBeDisabled())

        // Возврат приёма ставит его на своё место в дне, а не в конец.
        fireEvent.click(screen.getByRole('checkbox', { name: 'Завтрак' }))
        fireEvent.click(screen.getByRole('checkbox', { name: 'Завтрак' }))
        put.mockResolvedValue({ meal_types: ['breakfast', 'lunch', 'dinner', 'snack'] })
        fireEvent.click(screen.getByRole('checkbox', { name: 'Перекус' }))
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить приёмы пищи' }))
        await waitFor(() =>
            expect(put).toHaveBeenLastCalledWith(PATH, { meal_types: ['breakfast', 'lunch', 'dinner', 'snack'] })
        )
    })

    it('снять все приёмы нельзя: подсказка и выключенное сохранение', async () => {
        get.mockResolvedValue({ meal_types: ['lunch'] })
        render(<MealPlanSettingsForm />)

        const lunch = await screen.findByRole('checkbox', { name: 'Обед' })
        expect(screen.getByRole('checkbox', { name: 'Завтрак' })).not.toBeChecked()
        fireEvent.click(lunch)

        expect(screen.getByRole('alert')).toHaveTextContent('Отметьте хотя бы один приём пищи')
        const save = screen.getByRole('button', { name: 'Сохранить приёмы пищи' })
        expect(save).toBeDisabled()
        fireEvent.submit(save.closest('form') as HTMLFormElement)
        expect(put).not.toHaveBeenCalled()
    })

    it('ошибка сохранения — сообщение, выбор остаётся', async () => {
        get.mockResolvedValue({ meal_types: ['breakfast', 'lunch'] })
        put.mockRejectedValue(new ApiError(422, { code: 'validation' }))
        render(<MealPlanSettingsForm />)

        fireEvent.click(await screen.findByRole('checkbox', { name: 'Ужин' }))
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить приёмы пищи' }))
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(screen.getByRole('checkbox', { name: 'Ужин' })).toBeChecked()
    })

    it('ошибка загрузки — повтор', async () => {
        get.mockRejectedValueOnce(new ApiError(500, {})).mockResolvedValueOnce({ meal_types: ['dinner'] })
        render(<MealPlanSettingsForm />)

        fireEvent.click(await screen.findByRole('button', { name: /Повторить/ }))
        expect(await screen.findByRole('checkbox', { name: 'Ужин' })).toBeChecked()
    })
})
