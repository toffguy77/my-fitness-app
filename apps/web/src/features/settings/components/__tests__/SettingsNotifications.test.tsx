import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsNotifications } from '../SettingsNotifications'

const mockGetPrefs = jest.fn()
const mockUpdatePrefs = jest.fn()

jest.mock('@/features/notifications/api/preferencesApi', () => ({
  getNotificationPreferences: () => mockGetPrefs(),
  updateNotificationPreferences: (req: unknown) => mockUpdatePrefs(req),
}))

jest.mock('@/features/content/types', () => ({
  CATEGORY_LABELS: {
    nutrition: 'Питание',
    training: 'Тренировки',
    recipes: 'Рецепты',
  },
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}))

import toast from 'react-hot-toast'

describe('SettingsNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetPrefs.mockResolvedValue({
      muted: false,
      mutedCategories: [],
    })
    mockUpdatePrefs.mockResolvedValue(undefined)
  })

  it('shows loading spinner initially', () => {
    mockGetPrefs.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SettingsNotifications />)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders global mute toggle and category toggles after load', async () => {
    render(<SettingsNotifications />)

    await waitFor(() => {
      expect(screen.getByText('Не беспокоить')).toBeInTheDocument()
    })

    expect(screen.getByText('Питание')).toBeInTheDocument()
    expect(screen.getByText('Тренировки')).toBeInTheDocument()
    expect(screen.getByText('Рецепты')).toBeInTheDocument()
  })

  it('disables category toggles when global mute is on', async () => {
    mockGetPrefs.mockResolvedValueOnce({
      muted: true,
      mutedCategories: [],
    })

    render(<SettingsNotifications />)

    await waitFor(() => {
      expect(screen.getByText('Не беспокоить')).toBeInTheDocument()
    })

    // All category toggles should be disabled
    const switches = screen.getAllByRole('switch')
    // First switch is the global mute, rest are categories
    const categoryToggles = switches.slice(1)
    categoryToggles.forEach(toggle => {
      expect(toggle).toBeDisabled()
    })
  })

  it('calls updateNotificationPreferences when global mute toggled', async () => {
    render(<SettingsNotifications />)

    await waitFor(() => {
      expect(screen.getByText('Не беспокоить')).toBeInTheDocument()
    })

    // The global mute switch (first one)
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[0])

    await waitFor(() => {
      expect(mockUpdatePrefs).toHaveBeenCalledWith({
        muted: true,
        mutedCategories: [],
      })
    })
  })

  it('calls updateNotificationPreferences when category toggled', async () => {
    render(<SettingsNotifications />)

    await waitFor(() => {
      expect(screen.getByText('Питание')).toBeInTheDocument()
    })

    // Category switches start at index 1
    const switches = screen.getAllByRole('switch')
    // Toggle off the first category (nutrition) - it's currently enabled (not muted)
    fireEvent.click(switches[1])

    await waitFor(() => {
      expect(mockUpdatePrefs).toHaveBeenCalledWith(
        expect.objectContaining({
          muted: false,
          mutedCategories: expect.arrayContaining(['nutrition']),
        })
      )
    })
  })

  it('shows error toast when loading preferences fails', async () => {
    mockGetPrefs.mockRejectedValueOnce(new Error('Failed'))

    render(<SettingsNotifications />)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Не удалось загрузить настройки')
    })
  })
})
