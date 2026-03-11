import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockCreateTask = jest.fn()

jest.mock('@/features/curator/api/curatorApi', () => ({
    curatorApi: {
        createTask: (...args: unknown[]) => mockCreateTask(...args),
    },
}))

import { TaskForm } from '../TaskForm'
import type { TaskView } from '../../types'

const mockOnClose = jest.fn()
const mockOnSaved = jest.fn()

const defaultProps = {
    clientId: 42,
    onClose: mockOnClose,
    onSaved: mockOnSaved,
}

const mockTaskResponse: TaskView = {
    id: 't-new',
    title: 'Сделать замеры',
    type: 'measurement',
    deadline: '2026-03-20',
    recurrence: 'once',
    status: 'active',
    completions: [],
    created_at: '2026-03-11T00:00:00Z',
}

/** Find a select inside a container that has a label with the given text */
function getSelectByLabel(labelText: string): HTMLSelectElement {
    const label = screen.getByText(labelText, { selector: 'label' })
    const parent = label.parentElement!
    const select = parent.querySelector('select')
    if (!select) throw new Error(`No select found for label "${labelText}"`)
    return select
}

/** Find the date input for deadline */
function getDeadlineInput(): HTMLInputElement {
    const label = screen.getByText('Дедлайн', { selector: 'label' })
    const parent = label.parentElement!
    const input = parent.querySelector('input[type="date"]') as HTMLInputElement
    if (!input) throw new Error('No date input found for Дедлайн')
    return input
}

/** Submit the form directly to bypass native required validation in jsdom */
function submitForm() {
    const form = document.querySelector('form')!
    fireEvent.submit(form)
}

describe('TaskForm', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders with empty fields', () => {
        render(<TaskForm {...defaultProps} />)

        expect(screen.getByText('Новая задача')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Что нужно сделать?')).toHaveValue('')
        expect(screen.getByPlaceholderText('Необязательно')).toHaveValue('')
        expect(screen.getByText('Создать задачу')).toBeInTheDocument()
    })

    it('shows validation error when title is empty', async () => {
        render(<TaskForm {...defaultProps} />)

        // Set deadline but leave title empty
        const deadlineInput = getDeadlineInput()
        fireEvent.change(deadlineInput, { target: { value: '2026-03-20' } })

        submitForm()

        expect(screen.getByText('Укажите название задачи')).toBeInTheDocument()
        expect(mockCreateTask).not.toHaveBeenCalled()
    })

    it('shows validation error when deadline is empty', async () => {
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        await user.type(screen.getByPlaceholderText('Что нужно сделать?'), 'Test task')

        submitForm()

        expect(screen.getByText('Укажите дедлайн')).toBeInTheDocument()
        expect(mockCreateTask).not.toHaveBeenCalled()
    })

    it('calls curatorApi.createTask with correct params and calls onSaved on success', async () => {
        mockCreateTask.mockResolvedValue(mockTaskResponse)
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        await user.type(screen.getByPlaceholderText('Что нужно сделать?'), 'Сделать замеры')
        await user.selectOptions(getSelectByLabel('Тип'), 'measurement')

        fireEvent.change(getDeadlineInput(), { target: { value: '2026-03-20' } })

        await user.type(screen.getByPlaceholderText('Необязательно'), 'Описание задачи')

        submitForm()

        await waitFor(() => {
            expect(mockCreateTask).toHaveBeenCalledWith(42, {
                title: 'Сделать замеры',
                type: 'measurement',
                description: 'Описание задачи',
                deadline: '2026-03-20',
                recurrence: 'once',
                recurrence_days: undefined,
            })
        })

        await waitFor(() => {
            expect(mockOnSaved).toHaveBeenCalledWith(mockTaskResponse)
        })
    })

    it('shows error message on API failure', async () => {
        mockCreateTask.mockRejectedValue(new Error('Server error'))
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        await user.type(screen.getByPlaceholderText('Что нужно сделать?'), 'Some task')
        fireEvent.change(getDeadlineInput(), { target: { value: '2026-03-20' } })

        submitForm()

        await waitFor(() => {
            expect(screen.getByText('Не удалось создать задачу')).toBeInTheDocument()
        })
        expect(mockOnSaved).not.toHaveBeenCalled()
    })

    it('calls onClose when X button is clicked', async () => {
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        const buttons = screen.getAllByRole('button')
        const xButton = buttons.find((btn) => btn.querySelector('.lucide-x') !== null) ?? buttons[0]
        await user.click(xButton)

        expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('shows loading spinner while saving', async () => {
        mockCreateTask.mockReturnValue(new Promise(() => {})) // never resolves
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        await user.type(screen.getByPlaceholderText('Что нужно сделать?'), 'Task')
        fireEvent.change(getDeadlineInput(), { target: { value: '2026-03-20' } })

        submitForm()

        await waitFor(() => {
            expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        })

        expect(screen.getByText('Создать задачу').closest('button')).toBeDisabled()
    })

    it('shows weekday buttons when recurrence is weekly', async () => {
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        // Weekday buttons should not be visible initially (recurrence defaults to 'once')
        expect(screen.queryByText('Пн')).not.toBeInTheDocument()

        await user.selectOptions(getSelectByLabel('Повторение'), 'weekly')

        expect(screen.getByText('Пн')).toBeInTheDocument()
        expect(screen.getByText('Вт')).toBeInTheDocument()
        expect(screen.getByText('Ср')).toBeInTheDocument()
        expect(screen.getByText('Чт')).toBeInTheDocument()
        expect(screen.getByText('Пт')).toBeInTheDocument()
        expect(screen.getByText('Сб')).toBeInTheDocument()
        expect(screen.getByText('Вс')).toBeInTheDocument()
    })

    it('toggles weekday selection on click', async () => {
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        await user.selectOptions(getSelectByLabel('Повторение'), 'weekly')

        const mondayBtn = screen.getByText('Пн')

        // Initially should have the unselected style
        expect(mondayBtn).toHaveClass('bg-gray-100')

        // Click to select
        await user.click(mondayBtn)
        expect(mondayBtn).toHaveClass('bg-blue-600')

        // Click again to deselect
        await user.click(mondayBtn)
        expect(mondayBtn).toHaveClass('bg-gray-100')
    })

    it('sends recurrence_days only when recurrence is weekly', async () => {
        mockCreateTask.mockResolvedValue(mockTaskResponse)
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        await user.type(screen.getByPlaceholderText('Что нужно сделать?'), 'Weekly task')
        fireEvent.change(getDeadlineInput(), { target: { value: '2026-03-20' } })

        // Select weekly and pick Monday (1) and Wednesday (3)
        await user.selectOptions(getSelectByLabel('Повторение'), 'weekly')
        await user.click(screen.getByText('Пн'))
        await user.click(screen.getByText('Ср'))

        submitForm()

        await waitFor(() => {
            expect(mockCreateTask).toHaveBeenCalledWith(42, {
                title: 'Weekly task',
                type: 'nutrition',
                description: undefined,
                deadline: '2026-03-20',
                recurrence: 'weekly',
                recurrence_days: [1, 3],
            })
        })
    })

    it('does not send recurrence_days when recurrence is daily', async () => {
        mockCreateTask.mockResolvedValue(mockTaskResponse)
        const user = userEvent.setup()
        render(<TaskForm {...defaultProps} />)

        await user.type(screen.getByPlaceholderText('Что нужно сделать?'), 'Daily task')
        fireEvent.change(getDeadlineInput(), { target: { value: '2026-03-20' } })
        await user.selectOptions(getSelectByLabel('Повторение'), 'daily')

        submitForm()

        await waitFor(() => {
            expect(mockCreateTask).toHaveBeenCalledWith(42, {
                title: 'Daily task',
                type: 'nutrition',
                description: undefined,
                deadline: '2026-03-20',
                recurrence: 'daily',
                recurrence_days: undefined,
            })
        })
    })
})
