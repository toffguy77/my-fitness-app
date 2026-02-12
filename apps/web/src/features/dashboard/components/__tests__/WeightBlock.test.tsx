/**
 * Simplified tests for WeightBlock component
 * Focus on core functionality without complex text matching
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeightBlock } from '../WeightBlock'
import { useDashboardStore } from '../../store/dashboardStore'
import toast from 'react-hot-toast'

// Mock dependencies
jest.mock('../../store/dashboardStore')
jest.mock('react-hot-toast')

const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>
const mockToast = toast as jest.Mocked<typeof toast>

describe('WeightBlock - Core Functionality', () => {
    const mockDate = new Date('2024-01-15')
    const mockUpdateMetric = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        mockUpdateMetric.mockResolvedValue(undefined)

        mockUseDashboardStore.mockReturnValue({
            dailyData: {},
            updateMetric: mockUpdateMetric,
        } as any)

        mockToast.success = jest.fn()
        mockToast.error = jest.fn()
    })

    it('displays weight decrease indicator', () => {
        mockUseDashboardStore.mockReturnValue({
            dailyData: {
                '2024-01-14': {
                    weight: 80.0,
                },
                '2024-01-15': {
                    weight: 78.5,
                },
            },
            updateMetric: mockUpdateMetric,
        } as any)

        const { container } = render(<WeightBlock date={mockDate} />)

        // Check that weight is displayed
        expect(screen.getByText('78.5')).toBeInTheDocument()

        // Check for green color class (weight decrease is good)
        const greenElements = container.querySelectorAll('.text-green-600')
        expect(greenElements.length).toBeGreaterThan(0)
    })

    it('validates empty input on save', async () => {
        const user = userEvent.setup()
        render(<WeightBlock date={mockDate} />)

        const addButton = screen.getByRole('button', { name: /Записать вес/i })
        await user.click(addButton)

        // Try to save without entering weight
        const saveButton = screen.getByRole('button', { name: /Сохранить/i })

        // Save button should be disabled when input is empty
        expect(saveButton).toBeDisabled()

        // Click should not trigger save
        await user.click(saveButton)
        expect(mockUpdateMetric).not.toHaveBeenCalled()
    })

    it('clears input on cancel', async () => {
        const user = userEvent.setup()
        render(<WeightBlock date={mockDate} />)

        const addButton = screen.getByRole('button', { name: /Записать вес/i })
        await user.click(addButton)

        const input = screen.getByPlaceholderText('Введите вес в кг')
        await user.type(input, '75.5')

        // Find cancel button by text instead of role
        const cancelButton = screen.getByText('Отмена')
        await user.click(cancelButton)

        // Input should be closed (editing mode off)
        expect(screen.queryByPlaceholderText('Введите вес в кг')).not.toBeInTheDocument()

        // Should show empty state again
        expect(screen.getByText('Вес не записан')).toBeInTheDocument()
    })

    it('saves weight successfully', async () => {
        const user = userEvent.setup()
        render(<WeightBlock date={mockDate} />)

        const addButton = screen.getByRole('button', { name: /Записать вес/i })
        await user.click(addButton)

        const input = screen.getByPlaceholderText('Введите вес в кг')
        await user.type(input, '75.5')

        const saveButton = screen.getByRole('button', { name: /Сохранить/i })
        await user.click(saveButton)

        await waitFor(() => {
            expect(mockUpdateMetric).toHaveBeenCalledWith('2024-01-15', {
                type: 'weight',
                data: { weight: 75.5 },
            })
        })

        expect(mockToast.success).toHaveBeenCalledWith('Вес сохранен')
    })

    it('validates negative weight', async () => {
        const user = userEvent.setup()
        render(<WeightBlock date={mockDate} />)

        const addButton = screen.getByRole('button', { name: /Записать вес/i })
        await user.click(addButton)

        const input = screen.getByPlaceholderText('Введите вес в кг')
        await user.type(input, '-10')

        // Wait for debounced validation (300ms + buffer)
        await waitFor(() => {
            const errors = screen.queryAllByText(/положительным/i)
            expect(errors.length).toBeGreaterThan(0)
        }, { timeout: 500 })
    })

    it('validates weight exceeding maximum', async () => {
        const user = userEvent.setup()
        render(<WeightBlock date={mockDate} />)

        const addButton = screen.getByRole('button', { name: /Записать вес/i })
        await user.click(addButton)

        const input = screen.getByPlaceholderText('Введите вес в кг')
        await user.type(input, '600')

        // Wait for debounced validation (300ms + buffer)
        await waitFor(() => {
            const errors = screen.queryAllByText(/не более 500/i)
            expect(errors.length).toBeGreaterThan(0)
        }, { timeout: 500 })
    })

    it('validates decimal places', async () => {
        const user = userEvent.setup()
        render(<WeightBlock date={mockDate} />)

        const addButton = screen.getByRole('button', { name: /Записать вес/i })
        await user.click(addButton)

        const input = screen.getByPlaceholderText('Введите вес в кг')
        await user.type(input, '75.123')

        // Wait for debounced validation (300ms + buffer)
        await waitFor(() => {
            const errors = screen.queryAllByText(/не более 1 знака после запятой/i)
            expect(errors.length).toBeGreaterThan(0)
        }, { timeout: 500 })
    })
})
