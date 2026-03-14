import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/curator/clients/1',
    useSearchParams: () => new URLSearchParams(),
}))

const mockCreateWeeklyPlan = jest.fn()
const mockUpdateWeeklyPlan = jest.fn()

jest.mock('@/features/curator/api/curatorApi', () => ({
    curatorApi: {
        createWeeklyPlan: (...args: unknown[]) => mockCreateWeeklyPlan(...args),
        updateWeeklyPlan: (...args: unknown[]) => mockUpdateWeeklyPlan(...args),
    },
}))

import { PlanForm } from '../PlanForm'
import type { WeeklyPlanView } from '../../types'

const existingPlan: WeeklyPlanView = {
    id: 'plan-1',
    calories: 2000,
    protein: 150,
    fat: 70,
    carbs: 250,
    start_date: '2026-03-09',
    end_date: '2026-03-15',
    is_active: true,
    created_at: '2026-03-09T00:00:00Z',
    comment: 'Test comment',
}

const savedPlan: WeeklyPlanView = {
    id: 'plan-2',
    calories: 1800,
    protein: 130,
    fat: 60,
    carbs: 220,
    start_date: '2026-03-09',
    end_date: '2026-03-15',
    is_active: true,
    created_at: '2026-03-09T00:00:00Z',
}

describe('PlanForm', () => {
    const mockOnClose = jest.fn()
    const mockOnSaved = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders create mode with empty KBZHU fields', () => {
        render(<PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />)

        expect(screen.getByRole('heading', { name: 'Создать план' })).toBeInTheDocument()

        const inputs = screen.getAllByRole('spinbutton')
        expect(inputs).toHaveLength(4)
        inputs.forEach((input) => {
            expect(input).toHaveValue(null)
        })
    })

    it('renders edit mode with prefilled values', () => {
        render(
            <PlanForm
                clientId={1}
                existingPlan={existingPlan}
                onClose={mockOnClose}
                onSaved={mockOnSaved}
            />,
        )

        expect(screen.getByRole('heading', { name: 'Обновить план' })).toBeInTheDocument()

        const inputs = screen.getAllByRole('spinbutton')
        expect(inputs[0]).toHaveValue(2000)
        expect(inputs[1]).toHaveValue(150)
        expect(inputs[2]).toHaveValue(70)
        expect(inputs[3]).toHaveValue(250)
    })

    it('shows date inputs only in create mode', () => {
        const { unmount } = render(
            <PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />,
        )

        expect(screen.getByText('Дата начала')).toBeInTheDocument()
        expect(screen.getByText('Дата окончания')).toBeInTheDocument()
        const dateInputs = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
        expect(dateInputs.length).toBeGreaterThanOrEqual(2)

        unmount()

        render(
            <PlanForm
                clientId={1}
                existingPlan={existingPlan}
                onClose={mockOnClose}
                onSaved={mockOnSaved}
            />,
        )

        expect(screen.queryByText('Дата начала')).not.toBeInTheDocument()
        expect(screen.queryByText('Дата окончания')).not.toBeInTheDocument()
    })

    it('shows validation error when KBZHU fields are empty', async () => {
        const user = userEvent.setup()
        render(<PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />)

        // Leave fields empty but fill one to allow form to attempt submit
        // We need to trigger submit programmatically since browser validation
        // may prevent submission of empty required fields in jsdom
        const inputs = screen.getAllByRole('spinbutton')
        // Fill calories, protein, carbs but leave fat empty (NaN triggers validation)
        fireEvent.change(inputs[0], { target: { value: '2000' } })
        fireEvent.change(inputs[1], { target: { value: '150' } })
        fireEvent.change(inputs[2], { target: { value: '' } })
        fireEvent.change(inputs[3], { target: { value: '250' } })

        // Submit form directly to bypass HTML5 required validation
        const form = screen.getByRole('button', { name: /создать план/i }).closest('form')!
        fireEvent.submit(form)

        await waitFor(() => {
            expect(screen.getByText('Заполните все поля КБЖУ корректно')).toBeInTheDocument()
        })
        expect(mockCreateWeeklyPlan).not.toHaveBeenCalled()
    })

    it('shows validation error when KBZHU field is negative', async () => {
        render(<PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />)

        const inputs = screen.getAllByRole('spinbutton')
        fireEvent.change(inputs[0], { target: { value: '2000' } })
        fireEvent.change(inputs[1], { target: { value: '150' } })
        fireEvent.change(inputs[2], { target: { value: '-10' } })
        fireEvent.change(inputs[3], { target: { value: '250' } })

        const form = screen.getByRole('button', { name: /создать план/i }).closest('form')!
        fireEvent.submit(form)

        await waitFor(() => {
            expect(screen.getByText('Заполните все поля КБЖУ корректно')).toBeInTheDocument()
        })
        expect(mockCreateWeeklyPlan).not.toHaveBeenCalled()
    })

    it('calls createWeeklyPlan and onSaved on successful create', async () => {
        const user = userEvent.setup()
        mockCreateWeeklyPlan.mockResolvedValue(savedPlan)

        render(<PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />)

        const inputs = screen.getAllByRole('spinbutton')
        await user.type(inputs[0], '1800')
        await user.type(inputs[1], '130')
        await user.type(inputs[2], '60')
        await user.type(inputs[3], '220')

        const submitButton = screen.getByRole('button', { name: /создать план/i })
        await user.click(submitButton)

        await waitFor(() => {
            expect(mockCreateWeeklyPlan).toHaveBeenCalledWith(1, {
                calories: 1800,
                protein: 130,
                fat: 60,
                carbs: 220,
                start_date: expect.any(String),
                end_date: expect.any(String),
                comment: undefined,
            })
        })

        expect(mockOnSaved).toHaveBeenCalledWith(savedPlan)
    })

    it('calls updateWeeklyPlan and onSaved on successful update', async () => {
        const user = userEvent.setup()
        const updatedPlan = { ...existingPlan, calories: 2200 }
        mockUpdateWeeklyPlan.mockResolvedValue(updatedPlan)

        render(
            <PlanForm
                clientId={1}
                existingPlan={existingPlan}
                onClose={mockOnClose}
                onSaved={mockOnSaved}
            />,
        )

        const inputs = screen.getAllByRole('spinbutton')
        await user.clear(inputs[0])
        await user.type(inputs[0], '2200')

        const submitButton = screen.getByRole('button', { name: /обновить план/i })
        await user.click(submitButton)

        await waitFor(() => {
            expect(mockUpdateWeeklyPlan).toHaveBeenCalledWith(1, 'plan-1', {
                calories: 2200,
                protein: 150,
                fat: 70,
                carbs: 250,
                comment: 'Test comment',
            })
        })

        expect(mockOnSaved).toHaveBeenCalledWith(updatedPlan)
    })

    it('shows error message on API failure', async () => {
        const user = userEvent.setup()
        mockCreateWeeklyPlan.mockRejectedValue(new Error('Network error'))

        render(<PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />)

        const inputs = screen.getAllByRole('spinbutton')
        await user.type(inputs[0], '2000')
        await user.type(inputs[1], '150')
        await user.type(inputs[2], '70')
        await user.type(inputs[3], '250')

        const submitButton = screen.getByRole('button', { name: /создать план/i })
        await user.click(submitButton)

        await waitFor(() => {
            expect(screen.getByText('Не удалось сохранить план')).toBeInTheDocument()
        })

        expect(mockOnSaved).not.toHaveBeenCalled()
    })

    it('calls onClose when X button is clicked', async () => {
        const user = userEvent.setup()
        render(<PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />)

        // The X (close) button is type="button", the submit button is type="submit"
        const buttons = screen.getAllByRole('button')
        const xButton = buttons.find((btn) => btn.getAttribute('type') === 'button')!
        await user.click(xButton)

        expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('shows loading spinner while saving', async () => {
        const user = userEvent.setup()
        let resolveCreate: (value: WeeklyPlanView) => void
        mockCreateWeeklyPlan.mockReturnValue(
            new Promise<WeeklyPlanView>((resolve) => {
                resolveCreate = resolve
            }),
        )

        render(<PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />)

        const inputs = screen.getAllByRole('spinbutton')
        await user.type(inputs[0], '2000')
        await user.type(inputs[1], '150')
        await user.type(inputs[2], '70')
        await user.type(inputs[3], '250')

        const submitButton = screen.getByRole('button', { name: /создать план/i })
        await user.click(submitButton)

        await waitFor(() => {
            expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        })
        expect(submitButton).toBeDisabled()

        resolveCreate!(savedPlan)

        await waitFor(() => {
            expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
        })
    })

    it('sends comment field when provided', async () => {
        const user = userEvent.setup()
        mockCreateWeeklyPlan.mockResolvedValue(savedPlan)

        render(<PlanForm clientId={1} onClose={mockOnClose} onSaved={mockOnSaved} />)

        const inputs = screen.getAllByRole('spinbutton')
        await user.type(inputs[0], '2000')
        await user.type(inputs[1], '150')
        await user.type(inputs[2], '70')
        await user.type(inputs[3], '250')

        const commentInput = screen.getByPlaceholderText('Необязательно')
        await user.type(commentInput, 'Increase protein next week')

        const submitButton = screen.getByRole('button', { name: /создать план/i })
        await user.click(submitButton)

        await waitFor(() => {
            expect(mockCreateWeeklyPlan).toHaveBeenCalledWith(1, {
                calories: 2000,
                protein: 150,
                fat: 70,
                carbs: 250,
                start_date: expect.any(String),
                end_date: expect.any(String),
                comment: 'Increase protein next week',
            })
        })
    })
})
