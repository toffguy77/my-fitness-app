import { render, fireEvent } from '@testing-library/react'
import fc from 'fast-check'
import { NotificationIcon } from '../NotificationIcon'

describe('NotificationIcon', () => {
    describe('Property 1: Header Completeness - NotificationIcon Presence', () => {
        it('Feature: dashboard-layout, Property 1: NotificationIcon should always render for any notification count', () => {
            // **Validates: Requirements 1.3**

            fc.assert(
                fc.property(
                    fc.nat({ max: 999 }),
                    (count) => {
                        const { container } = render(<NotificationIcon count={count} />)

                        // Property: For any notification count, the NotificationIcon should be present
                        const notificationIcon = container.querySelector('[data-testid="notification-icon"]')
                        expect(notificationIcon).toBeInTheDocument()
                        expect(notificationIcon).toBeTruthy()

                        // Property: Badge should only be visible when count > 0
                        const badge = container.querySelector('[data-testid="notification-badge"]')
                        if (count > 0) {
                            expect(badge).toBeInTheDocument()
                            // Badge should display count or "9+" for counts > 9
                            const expectedText = count > 9 ? '9+' : count.toString()
                            expect(badge?.textContent).toBe(expectedText)
                        } else {
                            expect(badge).not.toBeInTheDocument()
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard-layout, Property 1: NotificationIcon should render with or without click handler', () => {
            // **Validates: Requirements 1.3**

            fc.assert(
                fc.property(
                    fc.record({
                        count: fc.nat({ max: 999 }),
                        hasClickHandler: fc.boolean(),
                    }),
                    (data) => {
                        const mockOnClick = data.hasClickHandler ? jest.fn() : undefined

                        const { container } = render(
                            <NotificationIcon count={data.count} onClick={mockOnClick} />
                        )

                        // Property: NotificationIcon should always be present
                        const notificationIcon = container.querySelector('[data-testid="notification-icon"]')
                        expect(notificationIcon).toBeInTheDocument()

                        // Property: Should be button when clickable, div otherwise
                        if (data.hasClickHandler) {
                            expect(notificationIcon?.tagName).toBe('BUTTON')
                            const expectedLabel = data.count > 0
                                ? `Notifications (${data.count} unread)`
                                : 'Notifications'
                            expect(notificationIcon).toHaveAttribute('aria-label', expectedLabel)
                        } else {
                            expect(notificationIcon?.tagName).toBe('DIV')
                            expect(notificationIcon).toHaveAttribute('aria-label', 'Notifications')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard-layout, Property 1: NotificationIcon badge should display correctly for edge cases', () => {
            // **Validates: Requirements 1.3**

            fc.assert(
                fc.property(
                    fc.constantFrom(0, 1, 9, 10, 99, 100, 999),
                    (count) => {
                        const { container } = render(<NotificationIcon count={count} />)

                        const notificationIcon = container.querySelector('[data-testid="notification-icon"]')
                        expect(notificationIcon).toBeInTheDocument()

                        const badge = container.querySelector('[data-testid="notification-badge"]')

                        // Property: Badge behavior at boundaries
                        if (count === 0) {
                            expect(badge).not.toBeInTheDocument()
                        } else if (count <= 9) {
                            expect(badge).toBeInTheDocument()
                            expect(badge?.textContent).toBe(count.toString())
                        } else {
                            expect(badge).toBeInTheDocument()
                            expect(badge?.textContent).toBe('9+')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Unit Tests - Specific Examples', () => {
        it('should render without badge when count is 0', () => {
            const { container } = render(<NotificationIcon count={0} />)
            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')
            const badge = container.querySelector('[data-testid="notification-badge"]')

            expect(notificationIcon).toBeInTheDocument()
            expect(badge).not.toBeInTheDocument()
        })

        it('should render without badge when count is undefined', () => {
            const { container } = render(<NotificationIcon />)
            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')
            const badge = container.querySelector('[data-testid="notification-badge"]')

            expect(notificationIcon).toBeInTheDocument()
            expect(badge).not.toBeInTheDocument()
        })

        it('should render with badge when count is greater than 0', () => {
            const { container } = render(<NotificationIcon count={5} />)
            const badge = container.querySelector('[data-testid="notification-badge"]')

            expect(badge).toBeInTheDocument()
            expect(badge?.textContent).toBe('5')
        })

        it('should display "9+" when count is greater than 9', () => {
            const { container } = render(<NotificationIcon count={15} />)
            const badge = container.querySelector('[data-testid="notification-badge"]')

            expect(badge).toBeInTheDocument()
            expect(badge?.textContent).toBe('9+')
        })

        it('should display exact count when count is 9 or less', () => {
            const { container } = render(<NotificationIcon count={9} />)
            const badge = container.querySelector('[data-testid="notification-badge"]')

            expect(badge).toBeInTheDocument()
            expect(badge?.textContent).toBe('9')
        })

        it('should handle click when onClick is provided', () => {
            const mockOnClick = jest.fn()
            const { container } = render(<NotificationIcon count={3} onClick={mockOnClick} />)
            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')

            fireEvent.click(notificationIcon!)
            expect(mockOnClick).toHaveBeenCalledTimes(1)
        })

        it('should render as button when onClick is provided', () => {
            const mockOnClick = jest.fn()
            const { container } = render(<NotificationIcon onClick={mockOnClick} />)
            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')

            expect(notificationIcon?.tagName).toBe('BUTTON')
        })

        it('should render as div when onClick is not provided', () => {
            const { container } = render(<NotificationIcon />)
            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')

            expect(notificationIcon?.tagName).toBe('DIV')
        })

        it('should have proper accessibility label without count', () => {
            const { container } = render(<NotificationIcon count={0} />)
            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')

            expect(notificationIcon).toHaveAttribute('aria-label', 'Notifications')
        })

        it('should have proper accessibility label with count when clickable', () => {
            const mockOnClick = jest.fn()
            const { container } = render(<NotificationIcon count={5} onClick={mockOnClick} />)
            const notificationIcon = container.querySelector('[data-testid="notification-icon"]')

            expect(notificationIcon).toHaveAttribute('aria-label', 'Notifications (5 unread)')
        })

        it('should have proper accessibility label on badge', () => {
            const { container } = render(<NotificationIcon count={3} />)
            const badge = container.querySelector('[data-testid="notification-badge"]')

            expect(badge).toHaveAttribute('aria-label', '3 unread notifications')
        })

        it('should render Bell icon', () => {
            const { container } = render(<NotificationIcon />)
            const bellIcon = container.querySelector('svg')

            expect(bellIcon).toBeInTheDocument()
        })
    })
})
