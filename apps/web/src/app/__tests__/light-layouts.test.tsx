/**
 * Tests for lightweight layout wrappers (dashboard, food-tracker, content,
 * notifications, legal). These layouts have minimal dependencies.
 */
import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}))

jest.mock('@/shared/components/ui', () => ({
    Logo: (props: Record<string, unknown>) => <div data-testid="logo" {...props}>Logo</div>,
}))

jest.mock('@/shared/components/AuthGuard', () => ({
    AuthGuard: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="auth-guard">{children}</div>
    ),
}))

jest.mock('@/shared/hooks/useSession', () => ({
    useSession: jest.fn(() => 'anonymous'),
}))

jest.mock('@/features/curator', () => ({
    CuratorLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="curator-layout" data-user={userName}>{children}</div>
    ),
}))

jest.mock('@/features/admin', () => ({
    AdminLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="admin-layout" data-user={userName}>{children}</div>
    ),
}))

jest.mock('@/shared/hooks/useCurrentUser', () => ({
    useCurrentUser: jest.fn(),
}))

jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
    DashboardLayout: ({ children, userName, activeNavItem }: {
        children: React.ReactNode
        userName: string
        activeNavItem?: string
    }) => (
        <div data-testid="dashboard-layout" data-user={userName} data-nav={activeNavItem}>
            {children}
        </div>
    ),
}))

import { useSession } from '@/shared/hooks/useSession'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'
import DashboardLayout from '../dashboard/layout'
import FoodTrackerLayout from '../food-tracker/layout'
import ContentLayout from '../content/layout'
import NotificationsLayout from '../notifications/layout'
import LegalLayout from '../legal/layout'

const mockSession = useSession as jest.Mock
const currentUser = useCurrentUser as jest.Mock

/** Роль и имя приходят из сессии, а не из локального слепка. */
function sessionOf(role: string, name = 'Из сессии') {
    currentUser.mockReturnValue({
        user: { id: '1', email: 'u@example.com', full_name: name, role },
        state: 'ready',
    })
}

describe('Light Layouts', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
        sessionOf('client')
    })

    describe('DashboardLayout', () => {
        it('wraps children in AuthGuard', () => {
            render(
                <DashboardLayout>
                    <div data-testid="page">Dashboard Page</div>
                </DashboardLayout>
            )
            expect(screen.getByTestId('auth-guard')).toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })
    })

    describe('FoodTrackerLayout', () => {
        it('renders with DashboardLayout and food-tracker nav', () => {
            render(
                <FoodTrackerLayout>
                    <div data-testid="page">Food Tracker</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-nav', 'food-tracker')
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        // Раньше имя читалось из localStorage, а пустое хранилище давало пустой
        // заголовок. Слепок больше не участвует.
        it('берёт имя из сессии, а слепок в браузере игнорирует', () => {
            localStorage.setItem('user', JSON.stringify({ name: 'Из слепка' }))
            sessionOf('client', 'Из сессии')

            render(
                <FoodTrackerLayout>
                    <div>Content</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', 'Из сессии')
        })

        it('при пустом хранилище имя всё равно есть', () => {
            sessionOf('client', 'Из сессии')

            render(
                <FoodTrackerLayout>
                    <div>Content</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', 'Из сессии')
        })
    })

    describe('ContentLayout', () => {
        it('renders children without DashboardLayout when not authenticated', () => {
            mockSession.mockReturnValue('anonymous')

            render(
                <ContentLayout>
                    <div data-testid="page">Content Page</div>
                </ContentLayout>
            )

            expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('renders with DashboardLayout when authenticated', () => {
            mockSession.mockReturnValue('authenticated')

            render(
                <ContentLayout>
                    <div data-testid="page">Content Page</div>
                </ContentLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-nav', 'content')
        })
    })

    describe('NotificationsLayout', () => {
        it('renders with DashboardLayout', () => {
            render(
                <NotificationsLayout>
                    <div data-testid="page">Notifications</div>
                </NotificationsLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        // Сюда попадают по колокольчику из кураторской оболочки — и получали
        // клиентскую навигацию.
        it('даёт куратору кураторскую оболочку', () => {
            sessionOf('coordinator')

            render(
                <NotificationsLayout>
                    <div data-testid="page">Notifications</div>
                </NotificationsLayout>
            )

            expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
            expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
        })

        it('даёт администратору административную оболочку', () => {
            sessionOf('super_admin')

            render(
                <NotificationsLayout>
                    <div data-testid="page">Notifications</div>
                </NotificationsLayout>
            )

            expect(screen.getByTestId('admin-layout')).toBeInTheDocument()
        })
    })

    describe('LegalLayout', () => {
        it('renders header with logo and navigation links', () => {
            render(
                <LegalLayout>
                    <div data-testid="page">Legal Page</div>
                </LegalLayout>
            )

            expect(screen.getByTestId('logo')).toBeInTheDocument()
            expect(screen.getAllByText('Договор оферты').length).toBeGreaterThanOrEqual(1)
            expect(screen.getAllByText('Конфиденциальность').length).toBeGreaterThanOrEqual(1)
            expect(screen.getByText('Вход')).toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('renders footer with copyright and links', () => {
            render(
                <LegalLayout>
                    <div>Content</div>
                </LegalLayout>
            )

            expect(screen.getByText(/2026 BURCEV/)).toBeInTheDocument()
            expect(screen.getByText('Поддержка')).toBeInTheDocument()
        })
    })
})
