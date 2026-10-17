import React from 'react'
import { render, screen } from '@testing-library/react'
import { SettingsAppleHealth } from '../SettingsAppleHealth'

const mockSaveSettings = jest.fn().mockResolvedValue(undefined)
let mockEnabled = false

jest.mock('../SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) =>
    <div data-testid="settings-layout">{children({
      profile: { settings: { apple_health_enabled: mockEnabled } },
      isLoading: false,
      saveSettings: mockSaveSettings,
    })}</div>,
}))

describe('SettingsAppleHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('показывает «Подключено на iPhone» по признаку из профиля', () => {
    mockEnabled = true
    render(<SettingsAppleHealth />)
    expect(screen.getByTestId('apple-health-state')).toHaveTextContent('Подключено на iPhone')
  })

  it('показывает «Не подключено» и объяснение, когда признак снят', () => {
    mockEnabled = false
    render(<SettingsAppleHealth />)
    expect(screen.getByTestId('apple-health-state')).toHaveTextContent('Не подключено')
    expect(screen.getByText(/Подключается в приложении на iPhone/)).toBeInTheDocument()
  })

  it('ничего не сохраняет: признак принадлежит приложению', () => {
    render(<SettingsAppleHealth />)
    expect(mockSaveSettings).not.toHaveBeenCalled()
  })
})
