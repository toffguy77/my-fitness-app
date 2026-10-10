// i18n-exempt-file — ожидаемые тексты экрана в тестах.
/**
 * Список покупок: показ, отметки на устройстве, «Скопировать» и «Поделиться»,
 * пустой диапазон, смена дат, события.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import toast from 'react-hot-toast'
import { track } from '@/shared/analytics'
import { adjustRange, ShoppingList } from '../ShoppingList'
import { shoppingList } from '../../testing/fixtures'

jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/shared/analytics', () => ({
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
    track: jest.fn(),
}))
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}))

import { apiClient } from '@/shared/utils/api-client'

const get = apiClient.get as jest.Mock
const writeText = jest.fn()

function setNavigator(name: 'clipboard' | 'share', value: unknown) {
    Object.defineProperty(navigator, name, { value, configurable: true, writable: true })
}

beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    writeText.mockResolvedValue(undefined)
    setNavigator('clipboard', { writeText })
    setNavigator('share', undefined)
})

async function renderList() {
    const view = render(<ShoppingList />)
    await screen.findByTestId('shopping-range')
    return view
}

describe('ShoppingList — показ', () => {
    it('диапазон по умолчанию от сервера, отделы, строки, «Обычно есть дома»', async () => {
        get.mockResolvedValue(shoppingList())
        await renderList()

        expect(get).toHaveBeenCalledWith('/api/v1/shopping-list')
        expect(screen.getByTestId('shopping-range')).toHaveTextContent('13–15 октября')
        expect(screen.getByLabelText('С')).toHaveValue('2026-10-13')
        expect(screen.getByLabelText('По')).toHaveValue('2026-10-15')

        const departments = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
        expect(departments).toEqual(['Овощи и зелень', 'Мясо и птица', 'Молочное и яйца', 'Обычно есть дома'])

        const egg = screen.getByTestId('shopping-item-f-egg')
        expect(within(egg).getByText('Яйцо куриное')).toBeInTheDocument()
        expect(within(egg).getByText('4 шт. (≈220 г)')).toBeInTheDocument()
        expect(screen.getByTestId('shopping-at-home')).toHaveTextContent('Перец чёрный, Соль')

        expect(track).toHaveBeenCalledWith('shopping_list_opened', { days: 3 })
    })

    it('Пустой диапазон: нет планов — ссылка на план', async () => {
        get.mockResolvedValue(shoppingList({ from: '2026-10-10', to: '2026-10-10', has_plans: false, departments: [], at_home: [] }))
        render(<ShoppingList />)

        const empty = await screen.findByTestId('shopping-no-plans')
        expect(within(empty).getByText('На эти дни планов нет')).toBeInTheDocument()
        expect(within(empty).getByRole('link', { name: 'Открыть план' })).toHaveAttribute('href', '/menu')
        expect(screen.queryByRole('button', { name: /Скопировать/ })).not.toBeInTheDocument()
        expect(track).toHaveBeenCalledWith('shopping_list_opened', { days: 1 })
    })

    it('планы есть, а продуктов нет — так и сказано', async () => {
        get.mockResolvedValue(shoppingList({ departments: [], at_home: [] }))
        render(<ShoppingList />)
        expect(await screen.findByTestId('shopping-nothing')).toBeInTheDocument()
    })

    it('ошибка загрузки — повтор', async () => {
        get.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(shoppingList())
        render(<ShoppingList />)
        fireEvent.click(await screen.findByRole('button', { name: /Повторить|Попробовать/ }))
        expect(await screen.findByTestId('shopping-range')).toBeInTheDocument()
        expect(get).toHaveBeenCalledTimes(2)
    })
})

describe('ShoppingList — отметки', () => {
    it('Отметка переживает перезагрузку', async () => {
        get.mockResolvedValue(shoppingList())
        const first = await renderList()

        const chicken = () => screen.getByTestId('shopping-item-f-chicken')
        fireEvent.click(within(chicken()).getByRole('button', { name: '«Филе куриное» куплено' }))
        expect(chicken()).toHaveAttribute('data-mark', 'bought')
        expect(within(chicken()).getByRole('button', { name: '«Филе куриное» куплено' })).toHaveAttribute('aria-pressed', 'true')
        expect(localStorage.getItem('shopping:2026-10-13:2026-10-15')).toBe(JSON.stringify({ 'f-chicken': 'bought' }))

        first.unmount()
        await renderList()
        expect(chicken()).toHaveAttribute('data-mark', 'bought')
        expect(screen.getByTestId('shopping-item-f-tomato')).toHaveAttribute('data-mark', 'none')
    })

    it('повторное нажатие снимает отметку, другая — заменяет', async () => {
        get.mockResolvedValue(shoppingList())
        await renderList()
        const tomato = () => screen.getByTestId('shopping-item-f-tomato')

        fireEvent.click(within(tomato()).getByRole('button', { name: '«Томаты» уже есть' }))
        expect(tomato()).toHaveAttribute('data-mark', 'have')
        fireEvent.click(within(tomato()).getByRole('button', { name: '«Томаты» куплено' }))
        expect(tomato()).toHaveAttribute('data-mark', 'bought')
        fireEvent.click(within(tomato()).getByRole('button', { name: '«Томаты» куплено' }))
        expect(tomato()).toHaveAttribute('data-mark', 'none')
        expect(localStorage.getItem('shopping:2026-10-13:2026-10-15')).toBeNull()
    })

    it('отметки другого диапазона не подхватываются', async () => {
        localStorage.setItem('shopping:2026-10-01:2026-10-02', JSON.stringify({ 'f-chicken': 'bought' }))
        get.mockResolvedValue(shoppingList())
        await renderList()
        expect(screen.getByTestId('shopping-item-f-chicken')).toHaveAttribute('data-mark', 'none')
    })
})

describe('ShoppingList — Скопировать и Поделиться', () => {
    it('«Скопировать» кладёт текст без отмеченных строк', async () => {
        get.mockResolvedValue(shoppingList())
        await renderList()
        fireEvent.click(within(screen.getByTestId('shopping-item-f-tomato')).getByRole('button', { name: '«Томаты» уже есть' }))

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Скопировать/ }))
        })
        expect(writeText).toHaveBeenCalledTimes(1)
        const text = writeText.mock.calls[0][0] as string
        expect(text.startsWith('Список покупок · 13–15 октября')).toBe(true)
        expect(text).toContain('— Огурцы — 300 г')
        expect(text).not.toContain('Томаты')
        expect(toast.success).toHaveBeenCalledWith('Список скопирован')
        expect(track).toHaveBeenCalledWith('shopping_list_shared', { method: 'copy' })
    })

    it('буфер недоступен — ошибка, события нет', async () => {
        writeText.mockRejectedValue(new Error('denied'))
        get.mockResolvedValue(shoppingList())
        await renderList()
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Скопировать/ }))
        })
        expect(toast.error).toHaveBeenCalledWith('Не удалось скопировать список')
        expect(track).not.toHaveBeenCalledWith('shopping_list_shared', expect.anything())
    })

    it('«Поделиться» отдаёт текст системному меню', async () => {
        const share = jest.fn().mockResolvedValue(undefined)
        setNavigator('share', share)
        get.mockResolvedValue(shoppingList())
        await renderList()

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Поделиться/ }))
        })
        expect(share).toHaveBeenCalledWith({
            title: 'Список покупок',
            text: expect.stringMatching(/^Список покупок · 13–15 октября/),
        })
        expect(writeText).not.toHaveBeenCalled()
        expect(track).toHaveBeenCalledWith('shopping_list_shared', { method: 'share' })
    })

    it('без «Поделиться» — запасное копирование', async () => {
        get.mockResolvedValue(shoppingList())
        await renderList()
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Поделиться/ }))
        })
        expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Список покупок/))
        expect(toast.success).toHaveBeenCalledWith('Список скопирован')
        expect(track).toHaveBeenCalledWith('shopping_list_shared', { method: 'copy' })
    })

    it('«Поделиться» отменили — ничего не копируется', async () => {
        const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
        setNavigator('share', jest.fn().mockRejectedValue(abort))
        get.mockResolvedValue(shoppingList())
        await renderList()
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Поделиться/ }))
        })
        expect(writeText).not.toHaveBeenCalled()
        expect(track).not.toHaveBeenCalledWith('shopping_list_shared', expect.anything())
    })

    it('«Поделиться» сломалось — копирование', async () => {
        setNavigator('share', jest.fn().mockRejectedValue(new Error('not allowed')))
        get.mockResolvedValue(shoppingList())
        await renderList()
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Поделиться/ }))
        })
        expect(writeText).toHaveBeenCalled()
    })
})

describe('ShoppingList — даты', () => {
    it('смена даты запрашивает новый диапазон', async () => {
        get.mockResolvedValueOnce(shoppingList()).mockResolvedValueOnce(
            shoppingList({ from: '2026-10-13', to: '2026-10-20' })
        )
        await renderList()
        fireEvent.change(screen.getByLabelText('По'), { target: { value: '2026-10-20' } })
        await waitFor(() =>
            expect(get).toHaveBeenLastCalledWith('/api/v1/shopping-list?from=2026-10-13&to=2026-10-20')
        )
        expect(await screen.findByText('13–20 октября')).toBeInTheDocument()
    })

    it('пустое значение поля ничего не запрашивает', async () => {
        get.mockResolvedValue(shoppingList())
        await renderList()
        fireEvent.change(screen.getByLabelText('С'), { target: { value: '' } })
        expect(get).toHaveBeenCalledTimes(1)
    })

    it.each([
        [{ from: '2026-10-13', to: '2026-10-15' }, 'from', '2026-10-17', { from: '2026-10-17', to: '2026-10-17' }],
        [{ from: '2026-10-13', to: '2026-10-15' }, 'from', '2026-10-01', { from: '2026-10-01', to: '2026-10-14' }],
        [{ from: '2026-10-13', to: '2026-10-15' }, 'to', '2026-10-10', { from: '2026-10-10', to: '2026-10-10' }],
        [{ from: '2026-10-13', to: '2026-10-15' }, 'to', '2026-10-30', { from: '2026-10-17', to: '2026-10-30' }],
        [{ from: '2026-10-13', to: '2026-10-15' }, 'to', '2026-10-26', { from: '2026-10-13', to: '2026-10-26' }],
    ] as const)('adjustRange(%o, %s, %s) → %o', (current, edited, value, expected) => {
        expect(adjustRange(current, edited, value)).toEqual(expected)
    })
})
