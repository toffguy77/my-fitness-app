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

jest.mock('@/shared/utils/token-storage', () => ({
    isAuthenticated: jest.fn(() => false),
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

import { isAuthenticated } from '@/shared/utils/token-storage'
import DashboardLayout from '../dashboard/layout'
import FoodTrackerLayout from '../food-tracker/layout'
import ContentLayout from '../content/layout'
import NotificationsLayout from '../notifications/layout'
import LegalLayout from '../legal/layout'

const mockIsAuthenticated = isAuthenticated as jest.MockedFunction<typeof isAuthenticated>

describe('Light Layouts', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
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
            localStorage.setItem('user', JSON.stringify({ name: 'Test User' }))

            render(
                <FoodTrackerLayout>
                    <div data-testid="page">Food Tracker</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-nav', 'food-tracker')
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('reads user name from localStorage', () => {
            localStorage.setItem('user', JSON.stringify({ name: 'Alice' }))

            render(
                <FoodTrackerLayout>
                    <div>Content</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', 'Alice')
        })

        it('handles missing user gracefully', () => {
            render(
                <FoodTrackerLayout>
                    <div>Content</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', '')
        })
    })

    describe('ContentLayout', () => {
        it('renders children without DashboardLayout when not authenticated', () => {
            mockIsAuthenticated.mockReturnValue(false)

            render(
                <ContentLayout>
                    <div data-testid="page">Content Page</div>
                </ContentLayout>
            )

            expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('renders with DashboardLayout when authenticated', () => {
            mockIsAuthenticated.mockReturnValue(true)
            localStorage.setItem('user', JSON.stringify({ name: 'Author' }))

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
            localStorage.setItem('user', JSON.stringify({ name: 'User' }))

            render(
                <NotificationsLayout>
                    <div data-testid="page">Notifications</div>
                </NotificationsLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
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
