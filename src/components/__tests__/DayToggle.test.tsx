/**
 * Component Tests: DayToggle
 * Tests day type toggle component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DayToggle from '../DayToggle'

describe('DayToggle Component', () => {
  const mockOnChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render both training and rest buttons', () => {
    render(<DayToggle value="training" onChange={mockOnChange} />)

    expect(screen.getByText('Тренировка')).toBeInTheDocument()
    expect(screen.getByText('Отдых')).toBeInTheDocument()
  })

  it('should highlight training button when value is training', () => {
    render(<DayToggle value="training" onChange={mockOnChange} />)

    const trainingButton = screen.getByText('Тренировка')
    expect(trainingButton).toHaveClass('bg-white')
  })

  it('should highlight rest button when value is rest', () => {
    render(<DayToggle value="rest" onChange={mockOnChange} />)

    const restButton = screen.getByText('Отдых')
    expect(restButton).toHaveClass('bg-white')
  })

  it('should call onChange when training button is clicked', async () => {
    render(<DayToggle value="rest" onChange={mockOnChange} />)

    const trainingButton = screen.getByText('Тренировка')
    await userEvent.click(trainingButton)

    expect(mockOnChange).toHaveBeenCalledWith('training')
  })

  it('should call onChange when rest button is clicked', async () => {
    render(<DayToggle value="training" onChange={mockOnChange} />)

    const restButton = screen.getByText('Отдых')
    await userEvent.click(restButton)

    expect(mockOnChange).toHaveBeenCalledWith('rest')
  })

  it('should disable buttons when disabled prop is true', () => {
    render(<DayToggle value="training" onChange={mockOnChange} disabled />)

    const trainingButton = screen.getByText('Тренировка')
    const restButton = screen.getByText('Отдых')

    expect(trainingButton).toBeDisabled()
    expect(restButton).toBeDisabled()
  })

  it('should not call onChange when disabled and button is clicked', async () => {
    render(<DayToggle value="training" onChange={mockOnChange} disabled />)

    const restButton = screen.getByText('Отдых')
    await userEvent.click(restButton)

    expect(mockOnChange).not.toHaveBeenCalled()
  })

  it('should show disabled title when disabled', () => {
    render(<DayToggle value="training" onChange={mockOnChange} disabled />)

    const trainingButton = screen.getByText('Тренировка')
    expect(trainingButton).toHaveAttribute('title', 'Тип дня уже сохранен и не может быть изменен')
  })

  it('should not show title when not disabled', () => {
    render(<DayToggle value="training" onChange={mockOnChange} />)

    const trainingButton = screen.getByText('Тренировка')
    expect(trainingButton).toHaveAttribute('title', '')
  })
})
