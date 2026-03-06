import React from 'react'
import { render, screen } from '@testing-library/react'
import { SettingsPageLayout } from '../SettingsPageLayout'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  )
})

jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="dashboard-layout">{children}</div>,
}))

jest.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="arrow-left" />,
}))

const mockUseSettings = jest.fn()
jest.mock('../../hooks/useSettings', () => ({
  useSettings: () => mockUseSettings(),
}))

const baseSettings = {
  language: 'ru',
  units: 'metric',
  timezone: 'Europe/Moscow',
  telegram_username: '',
  instagram_username: '',
  apple_health_enabled: false,
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

describe('SettingsPageLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn().mockReturnValue('test-token'),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    })
  })

  it('shows loading spinner when isLoading is true', () => {
    mockUseSettings.mockReturnValue({
      profile: null,
      isLoading: true,
      loadProfile: jest.fn(),
      saveName: jest.fn(),
      saveSettings: jest.fn(),
      handleAvatarUpload: jest.fn(),
      handleAvatarDelete: jest.fn(),
    })

    render(
      <SettingsPageLayout title="Test Title">
        {() => <div>Content</div>}
      </SettingsPageLayout>
    )

    expect(screen.queryByText('Content')).not.toBeInTheDocument()
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders children with hook result when loaded', () => {
    const hookResult = {
      profile: mockProfile,
      isLoading: false,
      loadProfile: jest.fn(),
      saveName: jest.fn(),
      saveSettings: jest.fn(),
      handleAvatarUpload: jest.fn(),
      handleAvatarDelete: jest.fn(),
    }
    mockUseSettings.mockReturnValue(hookResult)

    const childFn = jest.fn(() => <div>Child Content</div>)

    render(
      <SettingsPageLayout title="My Title">
        {childFn}
      </SettingsPageLayout>
    )

    expect(childFn).toHaveBeenCalledWith(hookResult)
    expect(screen.getByText('Child Content')).toBeInTheDocument()
    expect(screen.getByText('My Title')).toBeInTheDocument()
  })

  it('redirects to /auth when no auth_token', () => {
    ;(localStorage.getItem as jest.Mock).mockReturnValue(null)

    mockUseSettings.mockReturnValue({
      profile: null,
      isLoading: true,
      loadProfile: jest.fn(),
      saveName: jest.fn(),
      saveSettings: jest.fn(),
      handleAvatarUpload: jest.fn(),
      handleAvatarDelete: jest.fn(),
    })

    render(
      <SettingsPageLayout title="Test">
        {() => <div />}
      </SettingsPageLayout>
    )

    expect(mockPush).toHaveBeenCalledWith('/auth')
  })

  it('renders back link to /profile', () => {
    mockUseSettings.mockReturnValue({
      profile: mockProfile,
      isLoading: false,
      loadProfile: jest.fn(),
      saveName: jest.fn(),
      saveSettings: jest.fn(),
      handleAvatarUpload: jest.fn(),
      handleAvatarDelete: jest.fn(),
    })

    render(
      <SettingsPageLayout title="Test">
        {() => <div />}
      </SettingsPageLayout>
    )

    const link = screen.getByText('Профиль')
    expect(link.closest('a')).toHaveAttribute('href', '/profile')
  })
})
