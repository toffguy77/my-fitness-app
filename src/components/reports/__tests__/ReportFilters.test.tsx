/**
 * Tests for ReportFilters component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReportFilters from '../ReportFilters'

describe('ReportFilters', () => {
  const mockOnDateRangeChange = jest.fn()
  const mockOnDayTypeChange = jest.fn()
  const mockOnSortChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders filters button', () => {
    render(
      <ReportFilters
        onDateRangeChange={mockOnDateRangeChange}
        onDayTypeChange={mockOnDayTypeChange}
        onSortChange={mockOnSortChange}
      />
    )
    
    expect(screen.getByText('Фильтры')).toBeInTheDocument()
  })

  it('shows filter panel when clicked', async () => {
    const user = userEvent.setup()
    render(
      <ReportFilters
        onDateRangeChange={mockOnDateRangeChange}
        onDayTypeChange={mockOnDayTypeChange}
        onSortChange={mockOnSortChange}
      />
    )
    
    const button = screen.getByText('Фильтры')
    await user.click(button)
    
    expect(screen.getByText('Диапазон дат')).toBeInTheDocument()
    expect(screen.getByText('Тип дня')).toBeInTheDocument()
    expect(screen.getByText('Сортировка')).toBeInTheDocument()
  })

  it('calls onDayTypeChange when day type is selected', async () => {
    const user = userEvent.setup()
    render(
      <ReportFilters
        onDateRangeChange={mockOnDateRangeChange}
        onDayTypeChange={mockOnDayTypeChange}
        onSortChange={mockOnSortChange}
      />
    )
    
    const button = screen.getByText('Фильтры')
    await user.click(button)
    
    const trainingButton = screen.getByText('Тренировка')
    await user.click(trainingButton)
    
    expect(mockOnDayTypeChange).toHaveBeenCalledWith('training')
  })

  it('calls onSortChange when sort option is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ReportFilters
        onDateRangeChange={mockOnDateRangeChange}
        onDayTypeChange={mockOnDayTypeChange}
        onSortChange={mockOnSortChange}
      />
    )
    
    const button = screen.getByText('Фильтры')
    await user.click(button)
    
    const caloriesButton = screen.getByText('Калории')
    await user.click(caloriesButton)
    
    expect(mockOnSortChange).toHaveBeenCalledWith('calories', 'desc')
  })

  it('calls onDateRangeChange when dates are selected', async () => {
    const user = userEvent.setup()
    render(
      <ReportFilters
        onDateRangeChange={mockOnDateRangeChange}
        onDayTypeChange={mockOnDayTypeChange}
        onSortChange={mockOnSortChange}
      />
    )
    
    const button = screen.getByText('Фильтры')
    await user.click(button)
    
    const startDateInput = screen.getByLabelText(/От/i).closest('input')
    const endDateInput = screen.getByLabelText(/До/i).closest('input')
    
    if (startDateInput && endDateInput) {
      await user.type(startDateInput, '2024-01-01')
      await user.type(endDateInput, '2024-01-31')
      
      expect(mockOnDateRangeChange).toHaveBeenCalled()
    }
  })

  it('shows reset button when filters are active', async () => {
    const user = userEvent.setup()
    render(
      <ReportFilters
        onDateRangeChange={mockOnDateRangeChange}
        onDayTypeChange={mockOnDayTypeChange}
        onSortChange={mockOnSortChange}
      />
    )
    
    const button = screen.getByText('Фильтры')
    await user.click(button)
    
    const trainingButton = screen.getByText('Тренировка')
    await user.click(trainingButton)
    
    expect(screen.getByText('Сбросить фильтры')).toBeInTheDocument()
  })

  it('resets filters when reset button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ReportFilters
        onDateRangeChange={mockOnDateRangeChange}
        onDayTypeChange={mockOnDayTypeChange}
        onSortChange={mockOnSortChange}
      />
    )
    
    const button = screen.getByText('Фильтры')
    await user.click(button)
    
    const trainingButton = screen.getByText('Тренировка')
    await user.click(trainingButton)
    
    const resetButton = screen.getByText('Сбросить фильтры')
    await user.click(resetButton)
    
    expect(mockOnDateRangeChange).toHaveBeenCalledWith(null, null)
    expect(mockOnDayTypeChange).toHaveBeenCalledWith('all')
    expect(mockOnSortChange).toHaveBeenCalledWith('date', 'desc')
  })

  it('shows active filter count badge', async () => {
    const user = userEvent.setup()
    render(
      <ReportFilters
        onDateRangeChange={mockOnDateRangeChange}
        onDayTypeChange={mockOnDayTypeChange}
        onSortChange={mockOnSortChange}
      />
    )
    
    const button = screen.getByText('Фильтры')
    await user.click(button)
    
    const trainingButton = screen.getByText('Тренировка')
    await user.click(trainingButton)
    
    // Badge should show count of active filters
    const badge = screen.getByText(/^\d+$/)
    expect(badge).toBeInTheDocument()
  })
})

