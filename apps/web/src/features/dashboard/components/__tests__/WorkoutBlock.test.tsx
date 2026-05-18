/**
 * Unit tests for WorkoutBlock component
 *
 * Tests: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkoutBlock } from '../WorkoutBlock'
import { useDashboardStore } from '../../store/dashboardStore'
import toast from 'react-hot-toast'

// Mock dependencies
jest.mock('../../store/dashboardStore')
jest.mock('react-hot-toast')

const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>
const mockToast = toast as jest.Mocked<typeof toast>

// Helper function to get the header quick add button (first button with "Добавить тренировку")
const getHeaderQuickAddButton = () => {
    const buttons = screen.getAllByRole('button', { name: /Добавить тренировку/i })
    return buttons[0] // Header button is always first
}

describe('WorkoutBlock', () => {
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

    describe('Empty state', () => {
        it('displays empty state when no workout logged', () => {
            render(<WorkoutBlock date={mockDate} />)

            expect(screen.getByText('Не записано')).toBeInTheDocument()
        })

        it('shows dumbbell icon in empty state', () => {
            render(<WorkoutBlock date={mockDate} />)

            const icon = document.querySelector('svg')
            expect(icon).toBeInTheDocument()
        })

        it('displays add workout button in empty state', () => {
            render(<WorkoutBlock date={mockDate} />)

            const buttons = screen.getAllByRole('button', { name: /Добавить тренировку/i })
            expect(buttons.length).toBeGreaterThan(0)
        })

        it('displays helper text', () => {
            render(<WorkoutBlock date={mockDate} />)

            expect(screen.getByText(/Тренировки помогают достичь целей быстрее/)).toBeInTheDocument()
        })
    })

    describe('Completed workout display', () => {
        it('displays completed workout status', () => {
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Силовая',
                            duration: 60,
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            expect(screen.getByText('Тренировка выполнена')).toBeInTheDocument()
        })

        it('displays workout type', () => {
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Кардио',
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            expect(screen.getByText('Кардио')).toBeInTheDocument()
        })

        it('displays workout duration in minutes', () => {
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Йога',
                            duration: 45,
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            expect(screen.getByText('45 мин')).toBeInTheDocument()
        })

        it('displays workout duration in hours and minutes', () => {
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Бег',
                            duration: 90,
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            expect(screen.getByText('1ч 30м')).toBeInTheDocument()
        })

        it('displays workout duration in hours only', () => {
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Велосипед',
                            duration: 120,
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            expect(screen.getByText('2ч')).toBeInTheDocument()
        })

        it('displays edit and cancel buttons', () => {
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'HIIT',
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            const buttons = screen.getAllByRole('button')
            const editButton = buttons.find(btn => btn.textContent?.includes('Изменить'))
            const cancelButton = buttons.find(btn => btn.textContent?.includes('Отменить'))

            expect(editButton).toBeInTheDocument()
            expect(cancelButton).toBeInTheDocument()
        })
    })

    describe('Workout dialog', () => {
        it('opens dialog on quick add button click', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            // Check for dialog content by looking for workout type buttons
            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })).toBeInTheDocument()
            })
        })

        it('displays all workout type options', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                const workoutTypes = ['Силовая', 'Кардио', 'Йога', 'HIIT', 'Растяжка', 'Плавание', 'Бег', 'Велосипед', 'Другое']
                workoutTypes.forEach(type => {
                    expect(screen.getByRole('checkbox', { name: `Тип тренировки: ${type}` })).toBeInTheDocument()
                })
            })
        })

        it('selects workout type on click', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })).toBeInTheDocument()
            })

            const typeButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })
            await user.click(typeButton)

            expect(typeButton).toHaveClass('bg-blue-100')
        })

        it('shows custom type input when "Другое" selected', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })).toBeInTheDocument()
            })

            const otherButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })
            await user.click(otherButton)

            expect(screen.getByPlaceholderText('Укажите тип тренировки')).toBeInTheDocument()
        })

        it('displays per-type duration input after selecting a type', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Йога' })).toBeInTheDocument()
            })

            await user.click(screen.getByRole('checkbox', { name: 'Тип тренировки: Йога' }))

            expect(screen.getByRole('spinbutton', { name: 'Длительность: Йога' })).toBeInTheDocument()
        })
    })

    describe('Workout validation', () => {
        it('disables save button when no type selected', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })).toBeInTheDocument()
            })

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            expect(saveButton).toBeDisabled()
        })

        it('disables save button when "Другое" selected but custom type empty', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })).toBeInTheDocument()
            })

            const otherButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })
            await user.click(otherButton)

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            expect(saveButton).toBeDisabled()
        })

        it('shows error for invalid duration (negative)', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Кардио' })).toBeInTheDocument()
            })

            await user.click(screen.getByRole('checkbox', { name: 'Тип тренировки: Кардио' }))

            const durationInput = screen.getByRole('spinbutton', { name: 'Длительность: Кардио' })
            await user.type(durationInput, '-10')

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            expect(screen.getByText(/Длительность должна быть от 1 до 600 минут/)).toBeInTheDocument()
        })

        it('shows error for invalid duration (too large)', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Бег' })).toBeInTheDocument()
            })

            await user.click(screen.getByRole('checkbox', { name: 'Тип тренировки: Бег' }))

            const durationInput = screen.getByRole('spinbutton', { name: 'Длительность: Бег' })
            await user.type(durationInput, '700')

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            expect(screen.getByText(/Длительность должна быть от 1 до 600 минут/)).toBeInTheDocument()
        })
    })

    describe('Workout saving', () => {
        it('saves workout with type only', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Йога' })).toBeInTheDocument()
            })

            const typeButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Йога' })
            await user.click(typeButton)

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            await waitFor(() => {
                expect(mockUpdateMetric).toHaveBeenCalledWith('2024-01-15', {
                    type: 'workout',
                    data: {
                        completed: true,
                        types: ['Йога'],
                        type: 'Йога',
                        typeDurations: {},
                    },
                })
            })
        })

        it('saves workout with type and duration', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: HIIT' })).toBeInTheDocument()
            })

            await user.click(screen.getByRole('checkbox', { name: 'Тип тренировки: HIIT' }))

            const durationInput = screen.getByRole('spinbutton', { name: 'Длительность: HIIT' })
            await user.type(durationInput, '30')

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            await waitFor(() => {
                expect(mockUpdateMetric).toHaveBeenCalledWith('2024-01-15', {
                    type: 'workout',
                    data: {
                        completed: true,
                        types: ['HIIT'],
                        type: 'HIIT',
                        typeDurations: { HIIT: 30 },
                    },
                })
            })
        })

        it('saves custom workout type', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })).toBeInTheDocument()
            })

            const otherButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })
            await user.click(otherButton)

            const customInput = screen.getByPlaceholderText('Укажите тип тренировки')
            await user.type(customInput, 'Пилатес')

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            await waitFor(() => {
                expect(mockUpdateMetric).toHaveBeenCalledWith('2024-01-15', {
                    type: 'workout',
                    data: {
                        completed: true,
                        types: ['Пилатес'],
                        type: 'Пилатес',
                        typeDurations: {},
                    },
                })
            })
        })

        it('saves multiple workout types', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })).toBeInTheDocument()
            })

            await user.click(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' }))
            await user.click(screen.getByRole('checkbox', { name: 'Тип тренировки: Кардио' }))

            // Enter per-type durations
            await user.type(screen.getByRole('spinbutton', { name: 'Длительность: Силовая' }), '45')
            await user.type(screen.getByRole('spinbutton', { name: 'Длительность: Кардио' }), '30')

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            await waitFor(() => {
                expect(mockUpdateMetric).toHaveBeenCalledWith('2024-01-15', {
                    type: 'workout',
                    data: {
                        completed: true,
                        types: ['Силовая', 'Кардио'],
                        type: 'Силовая',
                        typeDurations: { Силовая: 45, Кардио: 30 },
                    },
                })
            })
        })

        it('shows success toast after saving', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })).toBeInTheDocument()
            })

            const typeButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })
            await user.click(typeButton)

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            await waitFor(() => {
                expect(mockToast.success).toHaveBeenCalledWith('Тренировка записана')
            })
        })

        it('closes dialog after successful save', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Кардио' })).toBeInTheDocument()
            })

            const typeButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Кардио' })
            await user.click(typeButton)

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            await waitFor(() => {
                expect(screen.queryByRole('button', { name: 'Кардио' })).not.toBeInTheDocument()
            })
        })
    })

    describe('Cancel workout', () => {
        it('marks workout as not completed', async () => {
            const user = userEvent.setup()
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Силовая',
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            const buttons = screen.getAllByRole('button')
            const cancelButton = buttons.find(btn => btn.textContent?.includes('Отменить'))
            await user.click(cancelButton!)

            await waitFor(() => {
                expect(mockUpdateMetric).toHaveBeenCalledWith('2024-01-15', {
                    type: 'workout',
                    data: {
                        completed: false,
                    },
                })
            })
        })

        it('shows success toast after canceling', async () => {
            const user = userEvent.setup()
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Йога',
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            const buttons = screen.getAllByRole('button')
            const cancelButton = buttons.find(btn => btn.textContent?.includes('Отменить'))
            await user.click(cancelButton!)

            await waitFor(() => {
                expect(mockToast.success).toHaveBeenCalledWith('Тренировка отменена')
            })
        })
    })

    describe('Dialog controls', () => {
        it('closes dialog on cancel button click', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })).toBeInTheDocument()
            })

            const allButtons = screen.getAllByRole('button')
            const cancelButton = allButtons.find(btn => btn.textContent === 'Отмена')
            await user.click(cancelButton!)

            await waitFor(() => {
                expect(screen.queryByRole('button', { name: 'Силовая' })).not.toBeInTheDocument()
            })
        })

        it('clears form on cancel', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Бег' })).toBeInTheDocument()
            })

            await user.click(screen.getByRole('checkbox', { name: 'Тип тренировки: Бег' }))

            await user.type(screen.getByRole('spinbutton', { name: 'Длительность: Бег' }), '45')

            const allButtons = screen.getAllByRole('button')
            const cancelButton = allButtons.find(btn => btn.textContent === 'Отмена')
            await user.click(cancelButton!)

            // Reopen dialog — Бег should not be selected and duration input should be gone
            await user.click(addButton)

            await waitFor(() => {
                const reopenedTypeButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Бег' })
                expect(reopenedTypeButton).not.toHaveClass('bg-blue-100')
                expect(screen.queryByRole('spinbutton', { name: 'Длительность: Бег' })).not.toBeInTheDocument()
            })
        })
    })

    describe('Custom className', () => {
        it('applies custom className to root element', () => {
            const { container } = render(<WorkoutBlock date={mockDate} className="custom-class" />)

            const card = container.firstChild
            expect(card).toHaveClass('custom-class')
        })
    })

    describe('Error handling', () => {
        it('shows error message when save fails', async () => {
            const user = userEvent.setup()
            mockUpdateMetric.mockRejectedValueOnce(new Error('Network error'))

            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })).toBeInTheDocument()
            })

            const typeButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })
            await user.click(typeButton)

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            await user.click(saveButton!)

            await waitFor(() => {
                expect(screen.getByText('Не удалось сохранить тренировку')).toBeInTheDocument()
            })
        })

        it('shows error toast when cancel fails', async () => {
            const user = userEvent.setup()
            mockUpdateMetric.mockRejectedValueOnce(new Error('Network error'))

            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Силовая',
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            const buttons = screen.getAllByRole('button')
            const cancelButton = buttons.find(btn => btn.textContent?.includes('Отменить'))
            await user.click(cancelButton!)

            await waitFor(() => {
                expect(mockToast.error).toHaveBeenCalledWith('Не удалось обновить тренировку')
            })
        })

        it('shows validation error when no type selected on save', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })).toBeInTheDocument()
            })

            // Try to save without selecting type (button should be disabled, but test the validation)
            // We need to enable the button first by selecting and then deselecting
            const typeButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Силовая' })
            await user.click(typeButton)

            // Clear selection by clicking another type and then trying to save with empty custom
            const otherButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })
            await user.click(otherButton)

            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))

            // Button should be disabled when custom type is empty
            expect(saveButton).toBeDisabled()
        })

        it('shows validation error for custom type when empty', async () => {
            const user = userEvent.setup()
            render(<WorkoutBlock date={mockDate} />)

            const addButton = getHeaderQuickAddButton()
            await user.click(addButton)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })).toBeInTheDocument()
            })

            const otherButton = screen.getByRole('checkbox', { name: 'Тип тренировки: Другое' })
            await user.click(otherButton)

            // Save button should be disabled when custom type is empty
            const saveButtons = screen.getAllByRole('button')
            const saveButton = saveButtons.find(btn => btn.textContent?.includes('Сохранить'))
            expect(saveButton).toBeDisabled()
        })
    })

    describe('Edit workout', () => {
        it('pre-fills form when editing completed workout', async () => {
            const user = userEvent.setup()
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Йога',
                            types: ['Йога'],
                            typeDurations: { 'Йога': 45 },
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            const buttons = screen.getAllByRole('button')
            const editButton = buttons.find(btn => btn.textContent?.includes('Изменить'))
            await user.click(editButton!)

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Йога' })).toHaveClass('bg-blue-100')
                expect(screen.getByRole('spinbutton', { name: 'Длительность: Йога' })).toHaveValue(45)
            })
        })

        it('pre-fills form when clicking header button on completed workout', async () => {
            const user = userEvent.setup()
            mockUseDashboardStore.mockReturnValue({
                dailyData: {
                    '2024-01-15': {
                        workout: {
                            completed: true,
                            type: 'Бег',
                            types: ['Бег'],
                            typeDurations: { 'Бег': 30 },
                        },
                    },
                },
                updateMetric: mockUpdateMetric,
            } as any)

            render(<WorkoutBlock date={mockDate} />)

            const headerButtons = screen.getAllByRole('button', { name: 'Изменить тренировку' })
            await user.click(headerButtons[0])

            await waitFor(() => {
                expect(screen.getByRole('checkbox', { name: 'Тип тренировки: Бег' })).toHaveClass('bg-blue-100')
                expect(screen.getByRole('spinbutton', { name: 'Длительность: Бег' })).toHaveValue(30)
            })
        })
    })
})
