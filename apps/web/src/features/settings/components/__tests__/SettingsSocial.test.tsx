import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsSocial } from '../SettingsSocial'

const mockSaveSettings = jest.fn().mockResolvedValue(undefined)

const mockProfile = {
  settings: {
    telegram_username: '@user_tg',
    instagram_username: 'user_ig',
  },
}

jest.mock('../SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) =>
    <div data-testid="settings-layout">{children({
      profile: mockProfile,
      isLoading: false,
      saveSettings: mockSaveSettings,
    })}</div>,
}))

let capturedProps: Record<string, unknown> = {}

jest.mock('@/shared/components/settings', () => ({
  SocialAccountsForm: (props: Record<string, unknown>) => {
    capturedProps = props
    return (
      <div data-testid="social-form">
        <input
          data-testid="telegram-input"
          value={props.telegram as string}
          onChange={(e) => (props.onTelegramChange as (v: string) => void)(e.target.value)}
        />
        <input
          data-testid="instagram-input"
          value={props.instagram as string}
          onChange={(e) => (props.onInstagramChange as (v: string) => void)(e.target.value)}
        />
      </div>
    )
  },
}))

describe('SettingsSocial', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSaveSettings.mockResolvedValue(undefined)
  })

  it('renders social accounts form with current values', () => {
    render(<SettingsSocial />)
    expect(screen.getByTestId('social-form')).toBeInTheDocument()
    expect(capturedProps.telegram).toBe('@user_tg')
    expect(capturedProps.instagram).toBe('user_ig')
  })

  it('renders save button', () => {
    render(<SettingsSocial />)
    expect(screen.getByText('Сохранить')).toBeInTheDocument()
  })

  it('calls saveSettings with username data on save', async () => {
    render(<SettingsSocial />)

    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledWith({
        telegram_username: '@user_tg',
        instagram_username: 'user_ig',
      })
    })
  })

  it('shows loading state while saving', async () => {
    let resolveSettings: () => void
    mockSaveSettings.mockReturnValueOnce(new Promise<void>(r => { resolveSettings = r }))

    render(<SettingsSocial />)

    fireEvent.click(screen.getByText('Сохранить'))

    expect(screen.getByText('Проверяем...')).toBeInTheDocument()

    await waitFor(() => {
      resolveSettings!()
    })
  })

  it('updates telegram value when changed', () => {
    render(<SettingsSocial />)

    const input = screen.getByTestId('telegram-input')
    fireEvent.change(input, { target: { value: '@new_tg' } })

    expect(screen.getByTestId('telegram-input')).toHaveValue('@new_tg')
  })
})
