import { render, screen, fireEvent } from '@testing-library/react'
import { AdminLayout } from '../AdminLayout'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/features/dashboard/components/DashboardHeader', () => ({
    DashboardHeader: ({ userName, onLogoClick, onAvatarClick, onNotificationClick }: {
        userName: string
        onLogoClick: () => void
        onAvatarClick: () => void
        onNotificationClick: () => void
    }) => (
        <header data-testid="dashboard-header">
            <span data-testid="user-name">{userName}</span>
            <button data-testid="logo-btn" onClick={onLogoClick}>Logo</button>
            <button data-testid="avatar-btn" onClick={onAvatarClick}>Avatar</button>
            <button data-testid="notification-btn" onClick={onNotificationClick}>Notifications</button>
        </header>
    ),
}))

jest.mock('../AdminFooterNavigation', () => ({
    AdminFooterNavigation: ({ activeItem }: { activeItem: string }) => (
        <nav data-testid="admin-footer-nav" data-active={activeItem}>Footer Nav</nav>
    ),
}))

describe('AdminLayout', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders children', () => {
        render(
            <AdminLayout userName="Test User">
                <div data-testid="child-content">Page Content</div>
            </AdminLayout>
        )

        expect(screen.getByTestId('child-content')).toBeInTheDocument()
    })

    it('renders layout with correct test ids', () => {
        render(
            <AdminLayout userName="Admin">
                <div>Content</div>
            </AdminLayout>
        )

        expect(screen.getByTestId('admin-layout')).toBeInTheDocument()
        expect(screen.getByTestId('admin-main-content')).toBeInTheDocument()
    })

    it('passes userName to header', () => {
        render(
            <AdminLayout userName="John Doe">
                <div>Content</div>
            </AdminLayout>
        )

        expect(screen.getByTestId('user-name')).toHaveTextContent('John Doe')
    })

    it('renders footer navigation with default active item', () => {
        render(
            <AdminLayout userName="Admin">
                <div>Content</div>
            </AdminLayout>
        )

        expect(screen.getByTestId('admin-footer-nav')).toHaveAttribute('data-active', 'dashboard')
    })

    it('renders footer navigation with custom active item', () => {
        render(
            <AdminLayout userName="Admin" activeNavItem="users">
                <div>Content</div>
            </AdminLayout>
        )

        expect(screen.getByTestId('admin-footer-nav')).toHaveAttribute('data-active', 'users')
    })

    it('navigates to /admin on logo click', () => {
        render(
            <AdminLayout userName="Admin">
                <div>Content</div>
            </AdminLayout>
        )

        fireEvent.click(screen.getByTestId('logo-btn'))
        expect(mockPush).toHaveBeenCalledWith('/admin')
    })

    it('navigates to /profile on avatar click', () => {
        render(
            <AdminLayout userName="Admin">
                <div>Content</div>
            </AdminLayout>
        )

        fireEvent.click(screen.getByTestId('avatar-btn'))
        expect(mockPush).toHaveBeenCalledWith('/profile')
    })

    it('navigates to /notifications on notification click', () => {
        render(
            <AdminLayout userName="Admin">
                <div>Content</div>
            </AdminLayout>
        )

        fireEvent.click(screen.getByTestId('notification-btn'))
        expect(mockPush).toHaveBeenCalledWith('/notifications')
    })

    it('applies custom className', () => {
        render(
            <AdminLayout userName="Admin" className="custom-class">
                <div>Content</div>
            </AdminLayout>
        )

        expect(screen.getByTestId('admin-layout')).toHaveClass('custom-class')
    })

    it('forwards ref', () => {
        const ref = { current: null } as React.RefObject<HTMLDivElement | null>
        render(
            <AdminLayout userName="Admin" ref={ref}>
                <div>Content</div>
            </AdminLayout>
        )

        expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
})
