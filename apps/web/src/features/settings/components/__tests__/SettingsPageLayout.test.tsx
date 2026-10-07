import React from 'react'
import { render, screen } from '@testing-library/react'
import { SettingsPageLayout } from '../SettingsPageLayout'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('next/link', () => {
  const MockLink = ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
  DashboardLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => <div data-testid="dashboard-layout" data-user={userName}>{children}</div>,
}))

jest.mock('@/features/curator', () => ({
  CuratorLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="curator-layout">{children}</div>,
}))

jest.mock('@/features/admin', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>,
}))

jest.mock('@/shared/hooks/useCurrentUser', () => ({
  useCurrentUser: jest.fn(),
}))

jest.mock('lucide-react', () => ({
    ...jest.requireActual('lucide-react'),
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

const currentUser = useCurrentUser as jest.Mock

function sessionOf(role: string, name = 'Test User') {
  currentUser.mockReturnValue({
    user: { id: '1', email: 'test@example.com', full_name: name, role },
    state: 'ready',
  })
}

describe('SettingsPageLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sessionOf('client')
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

  // The guard lives in proxy.ts now, before the page renders.
  it('does not send anybody to sign in on its own', () => {
    mockUseSettings.mockReturnValue({
      profile: null,
      isLoading: true,
      loadProfile: jest.fn(),
      saveName: jest.fn(),
      saveSettings: jest.fn(),
      handleAvatarUpload: jest.fn(),
      handleAvatarDelete: jest.fn(),
    })

    render(<SettingsPageLayout title="My Title">{() => <div />}</SettingsPageLayout>)

    expect(mockPush).not.toHaveBeenCalledWith('/auth')
  })

  it('даёт куратору кураторскую оболочку, а не клиентскую', () => {
    // До этой правки настройки всегда оборачивались в DashboardLayout, и
    // куратор на любом экране настроек получал клиентскую навигацию.
    sessionOf('coordinator')
    mockUseSettings.mockReturnValue({
      profile: mockProfile,
      isLoading: false,
      loadProfile: jest.fn(),
      saveName: jest.fn(),
      saveSettings: jest.fn(),
      handleAvatarUpload: jest.fn(),
      handleAvatarDelete: jest.fn(),
    })

    render(<SettingsPageLayout title="Test">{() => <div />}</SettingsPageLayout>)

    expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
  })

  it('даёт администратору административную оболочку', () => {
    sessionOf('super_admin')
    mockUseSettings.mockReturnValue({
      profile: mockProfile,
      isLoading: false,
      loadProfile: jest.fn(),
      saveName: jest.fn(),
      saveSettings: jest.fn(),
      handleAvatarUpload: jest.fn(),
      handleAvatarDelete: jest.fn(),
    })

    render(<SettingsPageLayout title="Test">{() => <div />}</SettingsPageLayout>)

    expect(screen.getByTestId('admin-layout')).toBeInTheDocument()
  })

  it('берёт имя из сессии, когда локальное хранилище пусто', () => {
    // Слепок в localStorage здесь больше не читается: раньше пустое хранилище
    // давало пустой заголовок.
    sessionOf('client', 'Из сессии')
    mockUseSettings.mockReturnValue({
      profile: null,
      isLoading: false,
      loadProfile: jest.fn(),
      saveName: jest.fn(),
      saveSettings: jest.fn(),
      handleAvatarUpload: jest.fn(),
      handleAvatarDelete: jest.fn(),
    })

    render(<SettingsPageLayout title="Test">{() => <div />}</SettingsPageLayout>)

    expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', 'Из сессии')
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

    // Назад — кнопка-иконка: имя у неё в aria-label, не в видимом тексте.
    const link = screen.getByRole('link', { name: 'Назад в профиль' })
    expect(link).toHaveAttribute('href', '/profile')
  })
})
