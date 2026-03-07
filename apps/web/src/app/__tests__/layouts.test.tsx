import { render, screen } from '@testing-library/react'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
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

jest.mock('@/features/admin', () => ({
    AdminLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="admin-layout" data-user={userName}>{children}</div>
    ),
}))

jest.mock('@/features/curator', () => ({
    CuratorLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="curator-layout" data-user={userName}>{children}</div>
    ),
}))

import { isAuthenticated } from '@/shared/utils/token-storage'

const mockIsAuthenticated = isAuthenticated as jest.MockedFunction<typeof isAuthenticated>

describe('App Layouts', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
    })

    describe('DashboardLayout', () => {
        it('wraps children in AuthGuard', async () => {
            const DashboardLayout = (await import('../dashboard/layout')).default
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
        it('renders with DashboardLayout and food-tracker nav', async () => {
            localStorage.setItem('user', JSON.stringify({ name: 'Test User' }))
            const FoodTrackerLayout = (await import('../food-tracker/layout')).default

            render(
                <FoodTrackerLayout>
                    <div data-testid="page">Food Tracker</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-nav', 'food-tracker')
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('reads user name from localStorage', async () => {
            localStorage.setItem('user', JSON.stringify({ name: 'Alice' }))
            const FoodTrackerLayout = (await import('../food-tracker/layout')).default

            render(
                <FoodTrackerLayout>
                    <div>Content</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', 'Alice')
        })

        it('handles missing user gracefully', async () => {
            const FoodTrackerLayout = (await import('../food-tracker/layout')).default

            render(
                <FoodTrackerLayout>
                    <div>Content</div>
                </FoodTrackerLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-user', '')
        })
    })

    describe('ContentLayout', () => {
        it('renders children without DashboardLayout when not authenticated', async () => {
            mockIsAuthenticated.mockReturnValue(false)
            const ContentLayout = (await import('../content/layout')).default

            render(
                <ContentLayout>
                    <div data-testid="page">Content Page</div>
                </ContentLayout>
            )

            expect(screen.queryByTestId('dashboard-layout')).not.toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('renders with DashboardLayout when authenticated', async () => {
            mockIsAuthenticated.mockReturnValue(true)
            localStorage.setItem('user', JSON.stringify({ name: 'Author' }))
            const ContentLayout = (await import('../content/layout')).default

            render(
                <ContentLayout>
                    <div data-testid="page">Content Page</div>
                </ContentLayout>
            )

            expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-nav', 'content')
        })
    })

    describe('AdminAppLayout', () => {
        it('renders AdminLayout for super_admin', async () => {
            localStorage.setItem('user', JSON.stringify({
                full_name: 'Super Admin',
                role: 'super_admin',
            }))
            const AdminAppLayout = (await import('../admin/layout')).default

            render(
                <AdminAppLayout>
                    <div data-testid="page">Admin Page</div>
                </AdminAppLayout>
            )

            expect(screen.getByTestId('admin-layout')).toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('redirects non-admin users to /dashboard', async () => {
            localStorage.setItem('user', JSON.stringify({
                full_name: 'Regular User',
                role: 'client',
            }))
            const AdminAppLayout = (await import('../admin/layout')).default

            render(
                <AdminAppLayout>
                    <div data-testid="page">Admin Page</div>
                </AdminAppLayout>
            )

            expect(mockPush).toHaveBeenCalledWith('/dashboard')
            expect(screen.queryByTestId('page')).not.toBeInTheDocument()
        })

        it('redirects to /auth when no user', async () => {
            const AdminAppLayout = (await import('../admin/layout')).default

            render(
                <AdminAppLayout>
                    <div data-testid="page">Admin Page</div>
                </AdminAppLayout>
            )

            expect(mockPush).toHaveBeenCalledWith('/auth')
        })
    })

    describe('CuratorAppLayout', () => {
        it('renders CuratorLayout for coordinator', async () => {
            localStorage.setItem('user', JSON.stringify({
                full_name: 'Curator Name',
                role: 'coordinator',
            }))
            const CuratorAppLayout = (await import('../curator/layout')).default

            render(
                <CuratorAppLayout>
                    <div data-testid="page">Curator Page</div>
                </CuratorAppLayout>
            )

            expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('redirects non-coordinator to /dashboard', async () => {
            localStorage.setItem('user', JSON.stringify({
                full_name: 'User',
                role: 'client',
            }))
            const CuratorAppLayout = (await import('../curator/layout')).default

            render(
                <CuratorAppLayout>
                    <div data-testid="page">Curator Page</div>
                </CuratorAppLayout>
            )

            expect(mockPush).toHaveBeenCalledWith('/dashboard')
        })

        it('redirects to /auth when no user', async () => {
            const CuratorAppLayout = (await import('../curator/layout')).default

            render(
                <CuratorAppLayout>
                    <div>Page</div>
                </CuratorAppLayout>
            )

            expect(mockPush).toHaveBeenCalledWith('/auth')
        })
    })

    describe('NotificationsLayout', () => {
        it('renders with DashboardLayout', async () => {
            localStorage.setItem('user', JSON.stringify({ name: 'User' }))
            const NotificationsLayout = (await import('../notifications/layout')).default

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
        it('renders header with logo and navigation links', async () => {
            const LegalLayout = (await import('../legal/layout')).default

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

        it('renders footer with copyright and links', async () => {
            const LegalLayout = (await import('../legal/layout')).default

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
