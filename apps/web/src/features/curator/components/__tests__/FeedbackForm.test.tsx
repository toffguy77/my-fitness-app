import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockSubmitFeedback = jest.fn()

jest.mock('@/features/curator/api/curatorApi', () => ({
    curatorApi: {
        submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
    },
}))

import { FeedbackForm } from '../FeedbackForm'

const defaultProps = {
    clientId: 42,
    reportId: 'r-123',
    onClose: jest.fn(),
    onSaved: jest.fn(),
}

function renderForm(overrides: Partial<typeof defaultProps> = {}) {
    const props = { ...defaultProps, ...overrides }
    return render(<FeedbackForm {...props} />)
}

describe('FeedbackForm', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockSubmitFeedback.mockResolvedValue({})
    })

    it('renders all category sections', () => {
        renderForm()
        expect(screen.getByText('Питание')).toBeInTheDocument()
        expect(screen.getByText('Активность')).toBeInTheDocument()
        expect(screen.getByText('Вода')).toBeInTheDocument()
    })

    it('renders summary and recommendations textareas', () => {
        renderForm()
        expect(screen.getByPlaceholderText('Общий итог по неделе')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Необязательно')).toBeInTheDocument()
    })

    it('shows validation error when summary is empty', async () => {
        const user = userEvent.setup()
        renderForm()

        // Type a space (whitespace-only should still fail validation)
        const summaryTextarea = screen.getByPlaceholderText('Общий итог по неделе')
        await user.type(summaryTextarea, ' ')
        await user.click(screen.getByRole('button', { name: /Отправить обратную связь/ }))

        expect(screen.getByText('Заполните итог')).toBeInTheDocument()
        expect(mockSubmitFeedback).not.toHaveBeenCalled()
    })

    it('calls curatorApi.submitFeedback and onSaved on successful submit', async () => {
        const user = userEvent.setup()
        const onSaved = jest.fn()
        renderForm({ onSaved })

        await user.type(screen.getByPlaceholderText('Общий итог по неделе'), 'Хорошая неделя')
        await user.type(screen.getByPlaceholderText('Необязательно'), 'Пить больше воды')
        await user.click(screen.getByRole('button', { name: /Отправить обратную связь/ }))

        await waitFor(() => {
            expect(mockSubmitFeedback).toHaveBeenCalledWith(42, 'r-123', expect.objectContaining({
                summary: 'Хорошая неделя',
                recommendations: 'Пить больше воды',
                photo_uploaded: false,
            }))
        })

        await waitFor(() => {
            expect(onSaved).toHaveBeenCalled()
        })
    })

    it('shows error on API failure', async () => {
        mockSubmitFeedback.mockRejectedValue(new Error('Server error'))
        const user = userEvent.setup()
        renderForm()

        await user.type(screen.getByPlaceholderText('Общий итог по неделе'), 'Итог')
        await user.click(screen.getByRole('button', { name: /Отправить обратную связь/ }))

        await waitFor(() => {
            expect(screen.getByText('Не удалось сохранить обратную связь')).toBeInTheDocument()
        })
    })

    it('calls onClose when X button is clicked', async () => {
        const user = userEvent.setup()
        const onClose = jest.fn()
        renderForm({ onClose })

        const closeButtons = screen.getAllByRole('button')
        const xButton = closeButtons.find((btn) => !btn.textContent?.includes('Отправить'))!
        await user.click(xButton)

        expect(onClose).toHaveBeenCalled()
    })

    it('shows loading spinner while saving', async () => {
        mockSubmitFeedback.mockReturnValue(new Promise(() => {}))
        const user = userEvent.setup()
        renderForm()

        await user.type(screen.getByPlaceholderText('Общий итог по неделе'), 'Итог')
        await user.click(screen.getByRole('button', { name: /Отправить обратную связь/ }))

        await waitFor(() => {
            expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        })
    })

    it('allows rating buttons to be clicked to select ratings', async () => {
        const user = userEvent.setup()
        renderForm()

        const excellentButtons = screen.getAllByRole('button', { name: 'Отлично' })
        await user.click(excellentButtons[0])

        expect(excellentButtons[0].className).toContain('bg-green-500')
    })

    it('allows photo checkbox to be toggled', async () => {
        const user = userEvent.setup()
        renderForm()

        const checkbox = screen.getByRole('checkbox')
        expect(checkbox).not.toBeChecked()

        await user.click(checkbox)
        expect(checkbox).toBeChecked()

        await user.click(checkbox)
        expect(checkbox).not.toBeChecked()
    })

    it('sends category comments in the request', async () => {
        const user = userEvent.setup()
        renderForm()

        const commentTextareas = screen.getAllByPlaceholderText('Комментарий (необязательно)')
        expect(commentTextareas).toHaveLength(3)

        // Select rating for nutrition and add comment
        const excellentButtons = screen.getAllByRole('button', { name: 'Отлично' })
        await user.click(excellentButtons[0]) // Nutrition: Отлично
        await user.type(commentTextareas[0], 'Отличное питание')

        // Select rating for activity and add comment
        const goodButtons = screen.getAllByRole('button', { name: 'Хорошо' })
        await user.click(goodButtons[1]) // Activity: Хорошо
        await user.type(commentTextareas[1], 'Больше кардио')

        // Select rating for water
        const needsImprovementButtons = screen.getAllByRole('button', { name: 'Нужно улучшить' })
        await user.click(needsImprovementButtons[2]) // Water: Нужно улучшить
        await user.type(commentTextareas[2], 'Мало воды')

        await user.type(screen.getByPlaceholderText('Общий итог по неделе'), 'Итог недели')
        await user.click(screen.getByRole('button', { name: /Отправить обратную связь/ }))

        await waitFor(() => {
            expect(mockSubmitFeedback).toHaveBeenCalledWith(42, 'r-123', expect.objectContaining({
                nutrition: { rating: 'excellent', comment: 'Отличное питание' },
                activity: { rating: 'good', comment: 'Больше кардио' },
                water: { rating: 'needs_improvement', comment: 'Мало воды' },
                summary: 'Итог недели',
            }))
        })
    })

    it('sends photo_uploaded as true when checkbox is checked', async () => {
        const user = userEvent.setup()
        renderForm()

        await user.click(screen.getByRole('checkbox'))
        await user.type(screen.getByPlaceholderText('Общий итог по неделе'), 'Итог')
        await user.click(screen.getByRole('button', { name: /Отправить обратную связь/ }))

        await waitFor(() => {
            expect(mockSubmitFeedback).toHaveBeenCalledWith(42, 'r-123', expect.objectContaining({
                photo_uploaded: true,
            }))
        })
    })
})
