import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FoodEntryForm } from '../FoodEntryForm'

jest.mock('lucide-react', () => ({
    X: (props: Record<string, unknown>) => <svg data-testid="x-icon" {...props} />,
}))

jest.mock('../../api/chatApi', () => ({
    chatApi: {
        createFoodEntry: jest.fn(),
    },
}))

import { chatApi } from '../../api/chatApi'

const mockChatApi = chatApi as jest.Mocked<typeof chatApi>

describe('FoodEntryForm', () => {
    const defaultProps = {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        onClose: jest.fn(),
        onSubmit: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders form fields', () => {
        render(<FoodEntryForm {...defaultProps} />)

        expect(screen.getByLabelText('Название блюда')).toBeInTheDocument()
        expect(screen.getByLabelText('Приём пищи')).toBeInTheDocument()
        expect(screen.getByLabelText('Вес, г')).toBeInTheDocument()
        expect(screen.getByLabelText('Калории')).toBeInTheDocument()
        expect(screen.getByLabelText('Белки, г')).toBeInTheDocument()
        expect(screen.getByLabelText('Жиры, г')).toBeInTheDocument()
        expect(screen.getByLabelText('Углеводы, г')).toBeInTheDocument()
    })

    it('renders submit button disabled when food name is empty', () => {
        render(<FoodEntryForm {...defaultProps} />)
        const submitButton = screen.getByRole('button', { name: 'Добавить КБЖУ' })
        expect(submitButton).toBeDisabled()
    })

    it('enables submit button when food name has value', async () => {
        const user = userEvent.setup()
        render(<FoodEntryForm {...defaultProps} />)

        await user.type(screen.getByLabelText('Название блюда'), 'Куриная грудка')
        expect(screen.getByRole('button', { name: 'Добавить КБЖУ' })).toBeEnabled()
    })

    it('submits form with correct data', async () => {
        const resultMessage = {
            id: 'msg-2',
            conversation_id: 'conv-1',
            sender_id: 1,
            type: 'food_entry' as const,
            created_at: '2026-01-01T00:00:00Z',
        }
        mockChatApi.createFoodEntry.mockResolvedValue(resultMessage)

        const user = userEvent.setup()
        render(<FoodEntryForm {...defaultProps} />)

        await user.type(screen.getByLabelText('Название блюда'), 'Куриная грудка')
        await user.type(screen.getByLabelText('Вес, г'), '200')
        await user.type(screen.getByLabelText('Калории'), '300')
        await user.type(screen.getByLabelText('Белки, г'), '25')

        fireEvent.submit(screen.getByRole('button', { name: 'Добавить КБЖУ' }))

        await waitFor(() => {
            expect(mockChatApi.createFoodEntry).toHaveBeenCalledWith(
                'conv-1',
                'msg-1',
                expect.objectContaining({
                    food_name: 'Куриная грудка',
                    weight: 200,
                    calories: 300,
                    protein: 25,
                })
            )
        })

        expect(defaultProps.onSubmit).toHaveBeenCalledWith(resultMessage)
        expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('shows error on failed submission', async () => {
        mockChatApi.createFoodEntry.mockRejectedValue(new Error('Network error'))

        const user = userEvent.setup()
        render(<FoodEntryForm {...defaultProps} />)

        await user.type(screen.getByLabelText('Название блюда'), 'Каша')
        fireEvent.submit(screen.getByRole('button', { name: 'Добавить КБЖУ' }))

        await waitFor(() => {
            expect(screen.getByText('Не удалось создать запись. Попробуйте ещё раз.')).toBeInTheDocument()
        })
    })

    it('closes on close button click', async () => {
        const user = userEvent.setup()
        render(<FoodEntryForm {...defaultProps} />)

        await user.click(screen.getByLabelText('Закрыть'))
        expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('closes on backdrop click', () => {
        render(<FoodEntryForm {...defaultProps} />)

        const backdrop = screen.getByText('Добавить КБЖУ', { selector: 'h3' }).closest('.fixed')!
        fireEvent.click(backdrop)
        expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('has meal type options', () => {
        render(<FoodEntryForm {...defaultProps} />)
        const select = screen.getByLabelText('Приём пищи')
        expect(select).toHaveValue('lunch')

        const options = select.querySelectorAll('option')
        expect(options).toHaveLength(4)
    })
})
