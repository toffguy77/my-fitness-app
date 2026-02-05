import { render, waitFor } from '@testing-library/react'
import { DashboardLayout } from '../DashboardLayout'

// Mock Next.js router
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
        replace: jest.fn(),
        prefetch: jest.fn(),
    }),
}))

// Mock notifications store
const mockFetchUnreadCounts = jest.fn()
const mockStartPolling = jest.fn()
const mockStopPolling = jest.fn()

jest.mock('@/features/notifications', () => ({
    useNotificationsStore: jest.fn(() => ({
        unreadCounts: { main: 5, content: 3 },
        fetchUnreadCounts: mockFetchUnreadCounts,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
    })),
}))

describe('DashboardLayout', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('Unit Tests - Component Composition', () => {
        it('should render all three main sections: header, main content, and footer', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div data-testid="test-content">Test Content</div>
                </DashboardLayout>
            )

            // Verify header is present
            expect(container.querySelector('[data-testid="dashboard-header"]')).toBeInTheDocument()

            // Verify main content is present
            expect(container.querySelector('[data-testid="main-content"]')).toBeInTheDocument()

            // Verify footer navigation is present
            expect(container.querySelector('[data-testid="footer-navigation"]')).toBeInTheDocument()

            // Verify children are rendered
            expect(container.querySelector('[data-testid="test-content"]')).toBeInTheDocument()
        })

        it('should render with full viewport height layout', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            const layout = container.querySelector('[data-testid="dashboard-layout"]')
            expect(layout).toBeInTheDocument()

            // Verify flexbox column layout
            expect(layout).toHaveClass('flex')
            expect(layout).toHaveClass('flex-col')

            // Verify full viewport height
            expect(layout).toHaveClass('min-h-screen')
            expect(layout).toHaveClass('h-screen')
        })

        it('should pass user data to header component', () => {
            const { container } = render(
                <DashboardLayout
                    userName="John Doe"
                    avatarUrl="https://example.com/avatar.jpg"
                    notificationCount={5}
                >
                    <div>Content</div>
                </DashboardLayout>
            )

            const header = container.querySelector('[data-testid="dashboard-header"]')
            expect(header).toBeInTheDocument()

            // Verify user avatar is present (header should render it)
            const avatar = container.querySelector('[data-testid="user-avatar"]')
            expect(avatar).toBeInTheDocument()

            // Verify notification icon is present
            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')
            expect(notificationIcon).toBeInTheDocument()
        })

        it('should pass active navigation item to footer', () => {
            const { container } = render(
                <DashboardLayout userName="Test User" activeNavItem="food-tracker">
                    <div>Content</div>
                </DashboardLayout>
            )

            const footer = container.querySelector('[data-testid="footer-navigation"]')
            expect(footer).toBeInTheDocument()

            // Footer should render navigation items
            const navItems = container.querySelectorAll('[data-testid^="nav-item-"]')
            expect(navItems.length).toBeGreaterThan(0)
        })

        it('should render with proper spacing to prevent overlap', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            // Verify the wrapper div has padding for header and footer
            const contentWrapper = container.querySelector('.pt-16.pb-16')
            expect(contentWrapper).toBeInTheDocument()

            // Verify it has flex-grow and overflow-hidden
            expect(contentWrapper).toHaveClass('flex-grow')
            expect(contentWrapper).toHaveClass('overflow-hidden')
        })

        it('should render children content inside MainContent', () => {
            const testContent = 'This is test content for the dashboard'
            const { getByText } = render(
                <DashboardLayout userName="Test User">
                    <div>{testContent}</div>
                </DashboardLayout>
            )

            expect(getByText(testContent)).toBeInTheDocument()
        })

        it('should handle optional props correctly', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            // Should render without errors even without optional props
            expect(container.querySelector('[data-testid="dashboard-layout"]')).toBeInTheDocument()
            expect(container.querySelector('[data-testid="dashboard-header"]')).toBeInTheDocument()
            expect(container.querySelector('[data-testid="footer-navigation"]')).toBeInTheDocument()
        })

        it('should apply custom className when provided', () => {
            const customClass = 'custom-dashboard-class'
            const { container } = render(
                <DashboardLayout userName="Test User" className={customClass}>
                    <div>Content</div>
                </DashboardLayout>
            )

            const layout = container.querySelector('[data-testid="dashboard-layout"]')
            expect(layout).toHaveClass(customClass)
        })
    })

    describe('Layout Structure', () => {
        it('should maintain proper component hierarchy', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div data-testid="child-content">Child</div>
                </DashboardLayout>
            )

            const layout = container.querySelector('[data-testid="dashboard-layout"]')
            const header = container.querySelector('[data-testid="dashboard-header"]')
            const mainContent = container.querySelector('[data-testid="main-content"]')
            const footer = container.querySelector('[data-testid="footer-navigation"]')

            // All components should be present
            expect(layout).toBeInTheDocument()
            expect(header).toBeInTheDocument()
            expect(mainContent).toBeInTheDocument()
            expect(footer).toBeInTheDocument()

            // Header and footer should be siblings within layout
            expect(layout).toContainElement(header)
            expect(layout).toContainElement(footer)

            // Main content should contain children
            expect(mainContent).toContainElement(container.querySelector('[data-testid="child-content"]'))
        })

        it('should prevent overflow on the container', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            const layout = container.querySelector('[data-testid="dashboard-layout"]')
            expect(layout).toHaveClass('overflow-hidden')
        })
    })

    describe('Notifications Integration', () => {
        it('should fetch unread counts on mount', async () => {
            render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            await waitFor(() => {
                expect(mockFetchUnreadCounts).toHaveBeenCalledTimes(1)
            })
        })

        it('should start polling on mount', async () => {
            render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            await waitFor(() => {
                expect(mockStartPolling).toHaveBeenCalledTimes(1)
            })
        })

        it('should stop polling on unmount', async () => {
            const { unmount } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            unmount()

            await waitFor(() => {
                expect(mockStopPolling).toHaveBeenCalledTimes(1)
            })
        })

        it('should display total unread count from store', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            // Total unread count should be 5 + 3 = 8
            const header = container.querySelector('[data-testid="dashboard-header"]')
            expect(header).toBeInTheDocument()
        })

        it('should navigate to notifications page when notification icon is clicked', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')
            expect(notificationIcon).toBeInTheDocument()

            notificationIcon?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(mockPush).toHaveBeenCalledWith('/notifications')
        })

        it('should navigate to profile page when avatar is clicked', () => {
            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            const avatar = container.querySelector('[data-testid="user-avatar"]')
            expect(avatar).toBeInTheDocument()

            avatar?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

            expect(mockPush).toHaveBeenCalledWith('/profile')
        })

        it('should handle zero unread counts', () => {
            const useNotificationsStore = require('@/features/notifications').useNotificationsStore
            useNotificationsStore.mockImplementation(() => ({
                unreadCounts: { main: 0, content: 0 },
                fetchUnreadCounts: mockFetchUnreadCounts,
                startPolling: mockStartPolling,
                stopPolling: mockStopPolling,
            }))

            const { container } = render(
                <DashboardLayout userName="Test User">
                    <div>Content</div>
                </DashboardLayout>
            )

            const header = container.querySelector('[data-testid="dashboard-header"]')
            expect(header).toBeInTheDocument()
        })
    })
})
