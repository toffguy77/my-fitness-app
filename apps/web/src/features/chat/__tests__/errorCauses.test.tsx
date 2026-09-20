/**
 * Переписка: причина отказа доезжает до человека.
 *
 * Два места здесь разные по смыслу. Форма записи еды — действие человека, и
 * отказ на него надо объяснить. Загрузка переписки раньше проваливалась
 * молча: пустой экран вместо сообщений и ни слова о том, что переписка не
 * прочиталась.
 *
 * Молчание в этом разделе тоже есть, и оно осознанное — см. ниже про
 * WebSocket и про localStorage.
 */
import React from 'react'
import { renderHook, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('lucide-react', () => ({
    X: (props: Record<string, unknown>) => <svg data-testid="x-icon" {...props} />,
}))

jest.mock('../api/chatApi', () => ({
    chatApi: {
        getMessages: jest.fn(),
        sendMessage: jest.fn(),
        uploadFile: jest.fn(),
        createFoodEntry: jest.fn(),
    },
}))

jest.mock('../hooks/useWebSocket', () => ({
    useWebSocket: () => ({ lastEvent: null, sendEvent: jest.fn(), isConnected: false }),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

import toast from 'react-hot-toast'
import { useChat } from '../hooks/useChat'
import { FoodEntryForm } from '../components/FoodEntryForm'
import { chatApi } from '../api/chatApi'

const api = chatApi as jest.Mocked<typeof chatApi>

/** Отказ, который сервер объяснил кодом. */
function refusal(status: number, code: string) {
    return new ApiError(status, { code, message: 'серверная проза' })
}

const WAIT = { timeout: 1500 }

beforeEach(() => jest.clearAllMocks())

describe('Загрузка переписки', () => {
    // Раньше catch только снимал «загружаем»: человек видел пустую переписку
    // и решал, что писать ему никто не писал.
    it('не оставляет пустой экран без объяснения', async () => {
        ;(api.getMessages as jest.Mock).mockRejectedValue(refusal(403, 'forbidden'))

        renderHook(() => useChat('conv-1'))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), WAIT)
    })

    it('ничего не говорит, когда всё прочиталось', async () => {
        ;(api.getMessages as jest.Mock).mockResolvedValue([])

        const { result } = renderHook(() => useChat('conv-1'))

        await waitFor(() => expect(result.current.isLoading).toBe(false), WAIT)
        expect(toast.error).not.toHaveBeenCalled()
    })
})

describe('Запись еды из переписки', () => {
    it('показывает причину, по которой запись не создалась', async () => {
        ;(api.createFoodEntry as jest.Mock).mockRejectedValue(refusal(409, 'gone'))

        render(
            <FoodEntryForm
                conversationId="conv-1"
                messageId="m-1"
                onSubmit={jest.fn()}
                onClose={jest.fn()}
            />
        )

        await userEvent.type(screen.getByLabelText('Название блюда'), 'Овсянка')
        await userEvent.click(screen.getByRole('button', { name: 'Добавить КБЖУ' }))

        expect(await screen.findByText('Больше недоступно')).toBeInTheDocument()
    })
})
