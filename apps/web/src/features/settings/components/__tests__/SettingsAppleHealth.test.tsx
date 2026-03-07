import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsAppleHealth } from '../SettingsAppleHealth'

const mockSaveSettings = jest.fn().mockResolvedValue(undefined)

const mockProfile = {
  settings: {
    apple_health_enabled: false,
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

let capturedToggleProps: Record<string, unknown> = {}

jest.mock('@/shared/components/settings', () => ({
  AppleHealthToggle: (props: { enabled: boolean; onChange: (v: boolean) => void }) => {
    capturedToggleProps = props
    return (
      <div data-testid="apple-health-toggle">
        <button onClick={() => props.onChange(!props.enabled)}>toggle</button>
        <span>{props.enabled ? 'on' : 'off'}</span>
      </div>
    )
  },
}))

describe('SettingsAppleHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSaveSettings.mockResolvedValue(undefined)
  })

  it('renders Apple Health toggle', () => {
    render(<SettingsAppleHealth />)
    expect(screen.getByTestId('apple-health-toggle')).toBeInTheDocument()
  })

  it('passes enabled=false from profile settings', () => {
    render(<SettingsAppleHealth />)
    expect(capturedToggleProps.enabled).toBe(false)
    expect(screen.getByText('off')).toBeInTheDocument()
  })

  it('calls saveSettings with apple_health_enabled when toggled', () => {
    render(<SettingsAppleHealth />)

    fireEvent.click(screen.getByText('toggle'))

    expect(mockSaveSettings).toHaveBeenCalledWith({ apple_health_enabled: true })
  })
})
