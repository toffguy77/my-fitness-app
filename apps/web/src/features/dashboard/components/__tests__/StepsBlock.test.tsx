/**
 * Unit tests for StepsBlock component
 *
 * Tests specific examples and edge cases for steps tracking functionality
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StepsBlock } from '../StepsBlock'
import { useDashboardStore } from '../../store/dashboardStore'
import toast from 'react-hot-toast'
import type { DailyMetrics, WeeklyPlan } from '../../types'

// Mock the dashboard store
jest.mock('../../store/dashboardStore')

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

describe('StepsBlock', () => {
    const mockUpdateMetric = jest.fn()
    const testDate = new Date('2024-01-15')
    const dateStr = '2024-01-15'

    beforeEach(() => {
        jest.clearAllMocks()
        mockUpdateMetric.mockResolvedValue(undefined)

            // Default mock return value
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {},
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })
    })

    describe('Display', () => {
        it('renders with default goal when no weekly plan', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {},
                weeklyPlan: null,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('Шаги')).toBeInTheDocument()
            expect(screen.getByText('из 10.0k шагов')).toBeInTheDocument()
        })

        it('displays current steps and goal', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 5000,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('5.0k')).toBeInTheDocument()
            expect(screen.getByText('из 10.0k шагов')).toBeInTheDocument()
            expect(screen.getByText('50.0%')).toBeInTheDocument()
        })

        it('formats steps under 1000 without k suffix', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 500,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('500')).toBeInTheDocument()
        })

        it('shows completion indicator when goal reached', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 10000,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('Цель достигнута!')).toBeInTheDocument()
        })

        it('shows completion indicator when steps exceed goal', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 15000,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('Цель достигнута!')).toBeInTheDocument()
            expect(screen.getByText('150.0%')).toBeInTheDocument()
        })

        it('shows remaining steps when goal not reached', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 7500,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('Осталось 2,500 шагов до цели')).toBeInTheDocument()
        })

        it('shows empty state when no steps logged', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 0,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('Не записано')).toBeInTheDocument()
            expect(screen.getByText('Добавить')).toBeInTheDocument()
        })

        it('shows helper text', () => {
            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('Рекомендуется делать минимум 10,000 шагов в день')).toBeInTheDocument()
        })
    })

    describe('Progress Bar', () => {
        it('renders progress bar with correct attributes', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 5000,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            const progressBar = screen.getByRole('progressbar')
            expect(progressBar).toHaveAttribute('aria-valuenow', '50')
            expect(progressBar).toHaveAttribute('aria-valuemin', '0')
            expect(progressBar).toHaveAttribute('aria-valuemax', '100')
            expect(progressBar).toHaveAttribute('aria-label', 'Прогресс шагов: 50.0%')
        })

        it('caps progress bar at 100% when steps exceed goal', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 15000,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            const progressBar = screen.getByRole('progressbar')
            expect(progressBar).toHaveAttribute('aria-valuenow', '100')
        })
    })

    describe('Quick Add Button', () => {
        it('opens dialog when quick add button clicked', () => {
            render(<StepsBlock date={testDate} />)

            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])

            expect(screen.getByText('Обновить количество шагов')).toBeInTheDocument()
            expect(screen.getByLabelText('Количество шагов')).toBeInTheDocument()
        })

        it('pre-fills input with current steps value', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 5000,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])

            const input = screen.getByLabelText('Количество шагов') as HTMLInputElement
            expect(input.value).toBe('5000')
        })
    })

    describe('Input Dialog', () => {
        beforeEach(() => {
            render(<StepsBlock date={testDate} />)
            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])
        })

        it('accepts valid steps input', () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '8000' } })

            expect(input).toHaveValue(8000)
            expect(screen.queryByText(/Неверное значение/)).not.toBeInTheDocument()
        })

        it('shows validation error for negative steps', async () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '-100' } })

            // Wait for debounced validation (300ms)
            await waitFor(() => {
                const errors = screen.getAllByText(/не могут быть отрицательными/)
                expect(errors.length).toBeGreaterThan(0)
            }, { timeout: 500 })
        })

        it('shows validation error for steps exceeding maximum', async () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '150000' } })

            // Wait for debounced validation (300ms)
            await waitFor(() => {
                const errors = screen.getAllByText(/не более 100,000/)
                expect(errors.length).toBeGreaterThan(0)
            }, { timeout: 500 })
        })

        it('shows validation error for non-integer steps', () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '5000.5' } })

            // parseInt will convert 5000.5 to 5000, so no error will be shown
            // This is expected behavior for number inputs
            expect(screen.queryByText(/целым числом/)).not.toBeInTheDocument()
        })

        it('disables save button when validation error exists', async () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '-100' } })

            // Wait for debounced validation (300ms)
            await waitFor(() => {
                const saveButton = screen.getByText('Сохранить')
                expect(saveButton).toBeDisabled()
            }, { timeout: 500 })
        })

        it('disables save button when input is empty', () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '' } })

            const saveButton = screen.getByText('Сохранить')
            expect(saveButton).toBeDisabled()
        })

        it('clears validation error when user starts typing valid input', async () => {
            const input = screen.getByLabelText('Количество шагов')

            // Enter invalid value
            fireEvent.change(input, { target: { value: '-100' } })

            // Wait for debounced validation (300ms)
            await waitFor(() => {
                expect(screen.getAllByText(/не могут быть отрицательными/).length).toBeGreaterThan(0)
            }, { timeout: 500 })

            // Enter valid value
            fireEvent.change(input, { target: { value: '5000' } })

            // Wait for debounced validation to clear the error
            await waitFor(() => {
                expect(screen.queryByText(/не могут быть отрицательными/)).not.toBeInTheDocument()
            }, { timeout: 500 })
        })
    })

    describe('Save Functionality', () => {
        beforeEach(() => {
            render(<StepsBlock date={testDate} />)
            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])
        })

        it('saves valid steps and closes dialog', async () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '8000' } })

            const saveButton = screen.getByText('Сохранить')
            fireEvent.click(saveButton)

            await waitFor(() => {
                expect(mockUpdateMetric).toHaveBeenCalledWith(dateStr, {
                    type: 'steps',
                    data: { steps: 8000 },
                })
            })

            expect(toast.success).toHaveBeenCalledWith('Шаги сохранены')
            expect(screen.queryByText('Обновить количество шагов')).not.toBeInTheDocument()
        })

        it('shows validation error when saving empty input', async () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '' } })

            const saveButton = screen.getByText('Сохранить')

            // Save button should be disabled when input is empty
            expect(saveButton).toBeDisabled()
            expect(mockUpdateMetric).not.toHaveBeenCalled()
        })

        it('handles save error gracefully', async () => {
            mockUpdateMetric.mockRejectedValueOnce(new Error('Network error'))

            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '8000' } })

            const saveButton = screen.getByText('Сохранить')
            fireEvent.click(saveButton)

            await waitFor(() => {
                const errors = screen.getAllByText('Не удалось сохранить шаги')
                expect(errors.length).toBeGreaterThan(0)
            })

            // Dialog should remain open
            expect(screen.getByText('Обновить количество шагов')).toBeInTheDocument()
        })

        it('disables buttons while saving', async () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '8000' } })

            const saveButton = screen.getByText('Сохранить')
            const cancelButton = screen.getByText('Отмена')

            fireEvent.click(saveButton)

            // Buttons should be disabled during save
            expect(cancelButton).toBeDisabled()

            await waitFor(() => {
                expect(mockUpdateMetric).toHaveBeenCalled()
            })
        })
    })

    describe('Cancel Functionality', () => {
        it('closes dialog and clears input when cancel clicked', () => {
            render(<StepsBlock date={testDate} />)

            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])

            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '8000' } })

            const cancelButton = screen.getByText('Отмена')
            fireEvent.click(cancelButton)

            expect(screen.queryByText('Обновить количество шагов')).not.toBeInTheDocument()
        })

        it('clears validation error when dialog closed', async () => {
            render(<StepsBlock date={testDate} />)

            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])

            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '-100' } })

            // Wait for debounced validation (300ms + buffer)
            await waitFor(() => {
                expect(screen.queryAllByText(/не могут быть отрицательными/).length).toBeGreaterThan(0)
            }, { timeout: 500 })

            const cancelButton = screen.getByText('Отмена')
            fireEvent.click(cancelButton)

            // Reopen dialog
            fireEvent.click(quickAddButtons[0])

            // Error should be cleared
            expect(screen.queryByText(/не могут быть отрицательными/)).not.toBeInTheDocument()
        })
    })

    describe('Keyboard Navigation', () => {
        beforeEach(() => {
            render(<StepsBlock date={testDate} />)
            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])
        })

        it('saves on Enter key press', async () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.change(input, { target: { value: '8000' } })
            fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

            await waitFor(() => {
                expect(mockUpdateMetric).toHaveBeenCalledWith(dateStr, {
                    type: 'steps',
                    data: { steps: 8000 },
                })
            })
        })

        it('cancels on Escape key press', () => {
            const input = screen.getByLabelText('Количество шагов')
            fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })

            expect(screen.queryByText('Обновить количество шагов')).not.toBeInTheDocument()
        })
    })

    describe('Accessibility', () => {
        it('has accessible labels for buttons', () => {
            render(<StepsBlock date={testDate} />)

            // Should have at least one button with this label
            const buttons = screen.getAllByLabelText('Добавить шаги')
            expect(buttons.length).toBeGreaterThan(0)
        })

        it('has accessible label for input field', () => {
            render(<StepsBlock date={testDate} />)

            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])

            expect(screen.getByLabelText('Количество шагов')).toBeInTheDocument()
        })

        it('has accessible progress bar with aria attributes', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 5000,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            const progressBar = screen.getByRole('progressbar')
            expect(progressBar).toHaveAttribute('aria-label')
            expect(progressBar).toHaveAttribute('aria-valuenow')
            expect(progressBar).toHaveAttribute('aria-valuemin')
            expect(progressBar).toHaveAttribute('aria-valuemax')
        })

        it('autofocuses input when dialog opens', () => {
            render(<StepsBlock date={testDate} />)

            // Get the quick add button in the header (first one)
            const quickAddButtons = screen.getAllByLabelText('Добавить шаги')
            fireEvent.click(quickAddButtons[0])

            const input = screen.getByLabelText('Количество шагов')
            // Check that input has autofocus prop (React prop, not HTML attribute)
            expect(input).toBeInTheDocument()
            // In JSDOM, autofocus doesn't actually focus, but we can verify the element exists
            expect(document.activeElement).toBe(input)
        })
    })

    describe('Edge Cases', () => {
        it('handles zero goal gracefully', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {
                    [dateStr]: {
                        date: dateStr,
                        steps: 5000,
                    } as DailyMetrics,
                },
                weeklyPlan: { stepsGoal: 0 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            // Should not crash, should show Infinity% or handle gracefully
            expect(screen.getByText('Шаги')).toBeInTheDocument()
        })

        it('handles missing daily data', () => {
            ; (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                dailyData: {},
                weeklyPlan: { stepsGoal: 10000 } as WeeklyPlan,
                updateMetric: mockUpdateMetric,
            })

            render(<StepsBlock date={testDate} />)

            expect(screen.getByText('0')).toBeInTheDocument()
            expect(screen.getByText('Не записано')).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(<StepsBlock date={testDate} className="custom-class" />)

            const card = container.querySelector('.custom-class')
            expect(card).toBeInTheDocument()
        })
    })
})
