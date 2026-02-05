import { render } from '@testing-library/react'
import fc from 'fast-check'
import { DashboardHeader } from '../DashboardHeader'

describe('DashboardHeader', () => {
    describe('Property 1: Header Completeness', () => {
        it('Feature: dashboard-layout, Property 1: Header should contain all required elements for any user data', () => {
            // **Validates: Requirements 1.1, 1.2, 1.3**

            fc.assert(
                fc.property(
                    fc.record({
                        userName: fc.string({ minLength: 1, maxLength: 100 }),
                        avatarUrl: fc.option(fc.webUrl(), { nil: undefined }),
                        notificationCount: fc.nat({ max: 999 }),
                    }),
                    (userData) => {
                        const mockOnAvatarClick = jest.fn()
                        const mockOnNotificationClick = jest.fn()

                        const { container } = render(
                            <DashboardHeader
                                userName={userData.userName}
                                avatarUrl={userData.avatarUrl}
                                notificationCount={userData.notificationCount}
                                onAvatarClick={mockOnAvatarClick}
                                onNotificationClick={mockOnNotificationClick}
                            />
                        )

                        // Property: For any dashboard render, the header should contain all required elements:
                        // 1. Application logo
                        const appLogo = container.querySelector('[data-testid="app-logo"]')
                        expect(appLogo).toBeInTheDocument()

                        // 2. User avatar
                        const userAvatar = container.querySelector('[data-testid="user-avatar"]')
                        expect(userAvatar).toBeInTheDocument()

                        // 3. User name (should be visible in the avatar's aria-label or as text)
                        const avatarLabel = userAvatar?.getAttribute('aria-label')
                        expect(avatarLabel).toContain(userData.userName)

                        // 4. Notification icon
                        const notificationIcon = container.querySelector('[data-testid="notification-icon"]')
                        expect(notificationIcon).toBeInTheDocument()

                        // All four required elements must be present for any valid user data
                        expect(appLogo).toBeTruthy()
                        expect(userAvatar).toBeTruthy()
                        expect(notificationIcon).toBeTruthy()
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 3: Fixed Positioning (Header)', () => {
        it('Feature: dashboard-layout, Property 3: Header should remain fixed at the top of the viewport for any user data and viewport size', () => {
            // **Validates: Requirements 1.5**

            fc.assert(
                fc.property(
                    fc.record({
                        userName: fc.string({ minLength: 1, maxLength: 100 }),
                        avatarUrl: fc.option(fc.webUrl(), { nil: undefined }),
                        notificationCount: fc.nat({ max: 999 }),
                    }),
                    (userData) => {
                        const mockOnAvatarClick = jest.fn()
                        const mockOnNotificationClick = jest.fn()

                        const { container } = render(
                            <DashboardHeader
                                userName={userData.userName}
                                avatarUrl={userData.avatarUrl}
                                notificationCount={userData.notificationCount}
                                onAvatarClick={mockOnAvatarClick}
                                onNotificationClick={mockOnNotificationClick}
                            />
                        )

                        // Property: For any viewport size and scroll position, the header should remain fixed at the top
                        const header = container.querySelector('[data-testid="dashboard-header"]')
                        expect(header).toBeInTheDocument()

                        // Verify fixed positioning classes are applied
                        expect(header).toHaveClass('fixed')
                        expect(header).toHaveClass('top-0')
                        expect(header).toHaveClass('left-0')
                        expect(header).toHaveClass('right-0')

                        // Verify z-index is set to ensure header stays on top
                        expect(header).toHaveClass('z-50')
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Unit Tests - Specific Examples', () => {
        it('should render with minimal user data', () => {
            const mockOnAvatarClick = jest.fn()
            const mockOnNotificationClick = jest.fn()

            const { container } = render(
                <DashboardHeader
                    userName="A"
                    onAvatarClick={mockOnAvatarClick}
                    onNotificationClick={mockOnNotificationClick}
                />
            )

            expect(container.querySelector('[data-testid="app-logo"]')).toBeInTheDocument()
            expect(container.querySelector('[data-testid="user-avatar"]')).toBeInTheDocument()
            expect(container.querySelector('[data-testid="notification-icon"]')).toBeInTheDocument()
        })

        it('should render with full user data including avatar and notifications', () => {
            const mockOnAvatarClick = jest.fn()
            const mockOnNotificationClick = jest.fn()

            const { container } = render(
                <DashboardHeader
                    userName="John Doe"
                    avatarUrl="https://example.com/avatar.jpg"
                    notificationCount={5}
                    onAvatarClick={mockOnAvatarClick}
                    onNotificationClick={mockOnNotificationClick}
                />
            )

            expect(container.querySelector('[data-testid="app-logo"]')).toBeInTheDocument()
            expect(container.querySelector('[data-testid="user-avatar"]')).toBeInTheDocument()
            expect(container.querySelector('[data-testid="notification-icon"]')).toBeInTheDocument()
            expect(container.querySelector('[data-testid="notification-badge"]')).toBeInTheDocument()
        })

        it('should render without notification badge when count is zero', () => {
            const mockOnAvatarClick = jest.fn()
            const mockOnNotificationClick = jest.fn()

            const { container } = render(
                <DashboardHeader
                    userName="Jane Smith"
                    notificationCount={0}
                    onAvatarClick={mockOnAvatarClick}
                    onNotificationClick={mockOnNotificationClick}
                />
            )

            expect(container.querySelector('[data-testid="notification-icon"]')).toBeInTheDocument()
            expect(container.querySelector('[data-testid="notification-badge"]')).not.toBeInTheDocument()
        })

        it('should render with long user names', () => {
            const mockOnAvatarClick = jest.fn()
            const mockOnNotificationClick = jest.fn()
            const longName = 'A'.repeat(100)

            const { container } = render(
                <DashboardHeader
                    userName={longName}
                    onAvatarClick={mockOnAvatarClick}
                    onNotificationClick={mockOnNotificationClick}
                />
            )

            const userAvatar = container.querySelector('[data-testid="user-avatar"]')
            expect(userAvatar).toBeInTheDocument()
            expect(userAvatar?.getAttribute('aria-label')).toContain(longName)
        })
    })
})
