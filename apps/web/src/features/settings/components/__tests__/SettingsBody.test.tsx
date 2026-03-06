import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsBody } from '../SettingsBody'

const mockSaveSettings = jest.fn().mockResolvedValue(undefined)
const mockRecalculate = jest.fn().mockResolvedValue({})

jest.mock('@/features/nutrition-calc/api/nutritionCalc', () => ({
  recalculate: () => mockRecalculate(),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}))

import toast from 'react-hot-toast'

const baseSettings = {
  language: 'ru',
  units: 'metric',
  timezone: 'Europe/Moscow',
  telegram_username: '',
  instagram_username: '',
  apple_health_enabled: false,
  birth_date: '1990-01-15',
  biological_sex: 'male',
  height: 180,
  target_weight: 75,
  activity_level: 'moderate',
  fitness_goal: 'maintain',
}

const mockProfile = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  avatar_url: '',
  onboarding_completed: true,
  settings: baseSettings,
}

jest.mock('../SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) =>
    <div data-testid="settings-layout">{children({
      profile: mockProfile,
      isLoading: false,
      saveSettings: mockSaveSettings,
    })}</div>,
}))

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
})

describe('SettingsBody', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSaveSettings.mockResolvedValue(undefined)
    mockRecalculate.mockResolvedValue({})
  })

  it('renders all form fields', () => {
    render(<SettingsBody />)

    expect(screen.getByText('Дата рождения')).toBeInTheDocument()
    expect(screen.getByText('Биологический пол')).toBeInTheDocument()
    expect(screen.getByText('Рост (см)')).toBeInTheDocument()
    expect(screen.getByText('Целевой вес (кг)')).toBeInTheDocument()
    expect(screen.getByText('Уровень активности')).toBeInTheDocument()
    expect(screen.getByText('Цель')).toBeInTheDocument()
  })

  it('populates form fields from profile settings', () => {
    render(<SettingsBody />)

    const dateInput = screen.getByDisplayValue('1990-01-15')
    expect(dateInput).toBeInTheDocument()

    const heightInput = screen.getByDisplayValue('180')
    expect(heightInput).toBeInTheDocument()

    const weightInput = screen.getByDisplayValue('75')
    expect(weightInput).toBeInTheDocument()
  })

  it('validates height must be 50-300', async () => {
    render(<SettingsBody />)

    const heightInput = screen.getByDisplayValue('180')
    fireEvent.change(heightInput, { target: { value: '10' } })

    fireEvent.click(screen.getByText('Сохранить'))

    expect(toast.error).toHaveBeenCalledWith('Рост должен быть от 50 до 300 см')
    expect(mockSaveSettings).not.toHaveBeenCalled()
  })

  it('validates weight must be 20-500', async () => {
    render(<SettingsBody />)

    const weightInput = screen.getByDisplayValue('75')
    fireEvent.change(weightInput, { target: { value: '10' } })

    fireEvent.click(screen.getByText('Сохранить'))

    expect(toast.error).toHaveBeenCalledWith('Целевой вес должен быть от 20 до 500 кг')
    expect(mockSaveSettings).not.toHaveBeenCalled()
  })

  it('calls saveSettings with combined payload on save', async () => {
    render(<SettingsBody />)

    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          birth_date: '1990-01-15',
          biological_sex: 'male',
          height: 180,
          target_weight: 75,
          activity_level: 'moderate',
          fitness_goal: 'maintain',
          language: 'ru',
          units: 'metric',
          timezone: 'Europe/Moscow',
        })
      )
    })
  })

  it('calls recalculate after successful save', async () => {
    render(<SettingsBody />)

    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() => {
      expect(mockRecalculate).toHaveBeenCalled()
    })
  })

  it('shows saving state on button', async () => {
    let resolveSettings: () => void
    mockSaveSettings.mockReturnValueOnce(new Promise<void>(r => { resolveSettings = r }))

    render(<SettingsBody />)

    fireEvent.click(screen.getByText('Сохранить'))

    expect(screen.getByText('Сохранение...')).toBeInTheDocument()

    await waitFor(() => {
      resolveSettings!()
    })
  })

  it('renders sex radio buttons', () => {
    render(<SettingsBody />)
    expect(screen.getByText('Мужской')).toBeInTheDocument()
    expect(screen.getByText('Женский')).toBeInTheDocument()
  })

  it('renders fitness goals', () => {
    render(<SettingsBody />)
    expect(screen.getByText('Снижение веса')).toBeInTheDocument()
    expect(screen.getByText('Поддержание')).toBeInTheDocument()
    expect(screen.getByText('Набор массы')).toBeInTheDocument()
  })
})
