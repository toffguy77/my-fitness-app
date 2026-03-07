import { renderHook, act, waitFor } from '@testing-library/react'
import { useSettings } from '../useSettings'
import {
  getProfile,
  updateProfile,
  updateSettings,
  uploadAvatar,
  deleteAvatar,
} from '../../api/settings'
import type { FullProfile, UserSettings } from '../../api/settings'

jest.mock('../../api/settings')
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    error: jest.fn(),
    success: jest.fn(),
  }),
}))

import toast from 'react-hot-toast'

const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>
const mockUpdateProfile = updateProfile as jest.MockedFunction<typeof updateProfile>
const mockUpdateSettings = updateSettings as jest.MockedFunction<typeof updateSettings>
const mockUploadAvatar = uploadAvatar as jest.MockedFunction<typeof uploadAvatar>
const mockDeleteAvatar = deleteAvatar as jest.MockedFunction<typeof deleteAvatar>

const baseSettings: UserSettings = {
  language: 'ru',
  units: 'metric',
  timezone: 'Europe/Moscow',
  telegram_username: '',
  instagram_username: '',
  apple_health_enabled: false,
}

const baseProfile: FullProfile = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  avatar_url: 'https://example.com/avatar.jpg',
  onboarding_completed: true,
  settings: baseSettings,
}

describe('useSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetProfile.mockResolvedValue(baseProfile)
  })

  it('loads profile on mount', async () => {
    const { result } = renderHook(() => useSettings())

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockGetProfile).toHaveBeenCalledTimes(1)
    expect(result.current.profile).toEqual(baseProfile)
  })

  it('shows toast.error on load failure', async () => {
    mockGetProfile.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(toast.error).toHaveBeenCalledWith('Не удалось загрузить профиль')
    expect(result.current.profile).toBeNull()
  })

  it('saveName calls updateProfile and shows success toast', async () => {
    const updatedProfile = { ...baseProfile, name: 'New Name' }
    mockUpdateProfile.mockResolvedValueOnce(updatedProfile)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.saveName('New Name')
    })

    expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'New Name' })
    expect(toast.success).toHaveBeenCalledWith('Имя обновлено')
    expect(result.current.profile?.name).toBe('New Name')
  })

  it('saveName shows error toast on failure', async () => {
    mockUpdateProfile.mockRejectedValueOnce(new Error('Failed'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.saveName('New Name')
    })

    expect(toast.error).toHaveBeenCalledWith('Не удалось обновить имя')
  })

  it('saveSettings calls updateSettings and updates profile state', async () => {
    const newSettings: UserSettings = { ...baseSettings, language: 'en' }
    mockUpdateSettings.mockResolvedValueOnce({ settings: newSettings })

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.saveSettings({ language: 'en' })
    })

    expect(mockUpdateSettings).toHaveBeenCalledWith({ language: 'en' })
    expect(toast.success).toHaveBeenCalledWith('Настройки сохранены')
    expect(result.current.profile?.settings.language).toBe('en')
  })

  it('saveSettings shows error toast on failure and rethrows', async () => {
    const err = { response: { data: { message: 'Custom error' } } }
    mockUpdateSettings.mockRejectedValueOnce(err)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await expect(result.current.saveSettings({ language: 'en' })).rejects.toBe(err)
    })

    expect(toast.error).toHaveBeenCalledWith('Custom error')
  })

  it('saveSettings shows default error message when no response message', async () => {
    mockUpdateSettings.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await expect(result.current.saveSettings({})).rejects.toThrow()
    })

    expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить настройки')
  })

  it('handleAvatarUpload uploads file and updates profile avatar_url', async () => {
    const file = new File(['img'], 'avatar.png', { type: 'image/png' })
    mockUploadAvatar.mockResolvedValueOnce('https://example.com/new-avatar.jpg')

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let url: string = ''
    await act(async () => {
      url = await result.current.handleAvatarUpload(file)
    })

    expect(mockUploadAvatar).toHaveBeenCalledWith(file)
    expect(url).toBe('https://example.com/new-avatar.jpg')
    expect(result.current.profile?.avatar_url).toBe('https://example.com/new-avatar.jpg')
    expect(toast.success).toHaveBeenCalledWith('Фото обновлено')
  })

  it('handleAvatarDelete deletes avatar and clears avatar_url', async () => {
    mockDeleteAvatar.mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.handleAvatarDelete()
    })

    expect(mockDeleteAvatar).toHaveBeenCalledTimes(1)
    expect(result.current.profile?.avatar_url).toBe('')
    expect(toast.success).toHaveBeenCalledWith('Фото удалено')
  })
})
