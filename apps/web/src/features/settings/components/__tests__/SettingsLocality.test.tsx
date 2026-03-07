import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsLocality } from '../SettingsLocality'

// Mock SettingsPageLayout to directly render children with our props
const mockSaveName = jest.fn()
const mockSaveSettings = jest.fn().mockResolvedValue(undefined)
const mockHandleAvatarUpload = jest.fn().mockResolvedValue('url')
const mockHandleAvatarDelete = jest.fn().mockResolvedValue(undefined)

const baseSettings = {
  language: 'ru' as const,
  units: 'metric' as const,
  timezone: 'Europe/Moscow',
  telegram_username: '',
  instagram_username: '',
  apple_health_enabled: false,
  height: 175,
}

const mockProfile = {
  name: 'Test User',
  email: 'test@example.com',
  avatar_url: 'https://example.com/avatar.jpg',
  settings: baseSettings,
}

jest.mock('../SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) =>
    <div data-testid="settings-layout">{children({
      profile: mockProfile,
      isLoading: false,
      saveName: mockSaveName,
      saveSettings: mockSaveSettings,
      handleAvatarUpload: mockHandleAvatarUpload,
      handleAvatarDelete: mockHandleAvatarDelete,
    })}</div>,
}))

jest.mock('@/shared/components/settings', () => ({
  PhotoUploader: (props: { avatarUrl?: string; userName?: string }) => (
    <div data-testid="photo-uploader" data-avatar={props.avatarUrl} data-name={props.userName} />
  ),
  LanguageSelector: (props: { value: string; onChange: (v: string) => void }) => (
    <div data-testid="language-selector">
      <button onClick={() => props.onChange('en')}>change-lang</button>
    </div>
  ),
  UnitSelector: (props: { value: string; onChange: (v: string) => void }) => (
    <div data-testid="unit-selector">
      <button onClick={() => props.onChange('imperial')}>change-unit</button>
    </div>
  ),
  TimezoneSelector: (props: { value: string; onChange: (v: string) => void }) => (
    <div data-testid="timezone-selector">
      <button onClick={() => props.onChange('US/Eastern')}>change-tz</button>
    </div>
  ),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}))

describe('SettingsLocality', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSaveSettings.mockResolvedValue(undefined)
  })

  it('renders photo uploader with avatar info', () => {
    render(<SettingsLocality />)
    const uploader = screen.getByTestId('photo-uploader')
    expect(uploader).toHaveAttribute('data-avatar', 'https://example.com/avatar.jpg')
    expect(uploader).toHaveAttribute('data-name', 'Test User')
  })

  it('renders name input with current name', () => {
    render(<SettingsLocality />)
    const input = screen.getByPlaceholderText('Ваше имя')
    expect(input).toHaveValue('Test User')
  })

  it('shows save button when name changes', () => {
    render(<SettingsLocality />)
    const input = screen.getByPlaceholderText('Ваше имя')

    expect(screen.queryByText('Сохранить')).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'New Name' } })

    expect(screen.getByText('Сохранить')).toBeInTheDocument()
  })

  it('calls saveName when save button clicked', () => {
    render(<SettingsLocality />)
    const input = screen.getByPlaceholderText('Ваше имя')

    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.click(screen.getByText('Сохранить'))

    expect(mockSaveName).toHaveBeenCalledWith('New Name')
  })

  it('renders height input', () => {
    render(<SettingsLocality />)
    const input = screen.getByPlaceholderText('175')
    expect(input).toHaveValue(175)
  })

  it('renders language, unit, and timezone selectors', () => {
    render(<SettingsLocality />)
    expect(screen.getByTestId('language-selector')).toBeInTheDocument()
    expect(screen.getByTestId('unit-selector')).toBeInTheDocument()
    expect(screen.getByTestId('timezone-selector')).toBeInTheDocument()
  })

  it('calls saveSettings when language changes', () => {
    render(<SettingsLocality />)
    fireEvent.click(screen.getByText('change-lang'))
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' })
    )
  })

  it('calls saveSettings when unit changes', () => {
    render(<SettingsLocality />)
    fireEvent.click(screen.getByText('change-unit'))
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ units: 'imperial' })
    )
  })

  it('calls saveSettings when timezone changes', () => {
    render(<SettingsLocality />)
    fireEvent.click(screen.getByText('change-tz'))
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'US/Eastern' })
    )
  })
})
