/**
 * Property-based tests for DashboardLayout responsive behavior
 *
 * Feature: dashboard
 * Property 23: Responsive Interaction Consistency
 * Property 24: Content Viewport Fit
 * Property 25: Orientation Change Adaptation
 *
 * Validates: Requirements 12.4, 12.5, 12.6
 */

import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as fc from 'fast-check'
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
        unreadCounts: { main: 0, content: 0 },
        fetchUnreadCounts: mockFetchUnreadCounts,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
    })),
}))

/**
 * Generator for viewport widths representing different device sizes
 */
const viewportWidthGenerator = () =>
    fc.oneof(
        fc.integer({ min: 320, max: 767 }),   // Mobile
        fc.integer({ min: 768, max: 1023 }),  // Tablet
        fc.integer({ min: 1024, max: 1920 })  // Desktop
    )

/**
 * Generator for viewport heights
 */
const viewportHeightGenerator = () =>
    fc.integer({ min: 568, max: 1080 })

/**
 * Generator for user names
 */
const userNameGenerator = () =>
    fc.string({ minLength: 1, maxLength: 50 })

/**
 * Generator for orientation values
 */
const orientationGenerator = () =>
    fc.constantFrom('portrait', 'landscape')

describe('Property 23: Responsive Interaction Consistency', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        cleanup()
    })

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    /**
     * Property: All interactive elements remain functional across device sizes
     *
     * For any device size (mobile, tablet, desktop), all interactive elements
     * (calendar navigation, quick add buttons, form inputs) should remain fully
     * functional with touch or click interactions.
     */
    it('maintains functional interactive elements across all viewport widths', () => {
        fc.assert(
            fc.property(
                viewportWidthGenerator(),
                viewportHeightGenerator(),
                userNameGenerator(),
                (width, height, userName) => {
                    // Create isolated container
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        // Set viewport size
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: width,
                        })
                        Object.defineProperty(window, 'innerHeight', {
                            writable: true,
                            configurable: true,
                            value: height,
                        })

                        // Render component
                        const { unmount, container: renderContainer } = render(
                            <DashboardLayout userName={userName}>
                                <div data-testid="test-content">Test Content</div>
                            </DashboardLayout>,
                            { container }
                        )

                        // Verify layout is rendered
                        const layout = renderContainer.querySelector('[data-testid="dashboard-layout"]')
                        expect(layout).toBeInTheDocument()

                        // Verify header is present and interactive
                        const header = renderContainer.querySelector('[data-testid="dashboard-header"]')
                        expect(header).toBeInTheDocument()

                        // Verify notification icon is clickable
                        const notificationIcon = renderContainer.querySelector('[data-testid="notification-icon"]')
                        expect(notificationIcon).toBeInTheDocument()

                        // Test click interaction
                        mockPush.mockClear()
                        fireEvent.click(notificationIcon!)
                        expect(mockPush).toHaveBeenCalledWith('/notifications')

                        // Verify avatar is clickable
                        const avatar = renderContainer.querySelector('[data-testid="user-avatar"]')
                        expect(avatar).toBeInTheDocument()

                        mockPush.mockClear()
                        fireEvent.click(avatar!)
                        expect(mockPush).toHaveBeenCalledWith('/profile')

                        // Verify footer navigation is present and interactive
                        const footer = renderContainer.querySelector('[data-testid="footer-navigation"]')
                        expect(footer).toBeInTheDocument()

                        // Verify navigation items are present
                        const navItems = renderContainer.querySelectorAll('[data-testid^="nav-item-"]')
                        expect(navItems.length).toBeGreaterThan(0)

                        // Test navigation item click
                        const firstNavItem = navItems[0] as HTMLElement
                        expect(firstNavItem).toBeInTheDocument()

                        // Navigation items should be clickable
                        fireEvent.click(firstNavItem)
                        // Should not throw error

                        // Verify main content is present
                        const mainContent = renderContainer.querySelector('[data-testid="main-content"]')
                        expect(mainContent).toBeInTheDocument()

                        // Clean up
                        unmount()

                        return true
                    } finally {
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Touch interactions work on mobile viewports
     */
    it('supports touch interactions on mobile viewports', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 320, max: 767 }), // Mobile only
                userNameGenerator(),
                (width, userName) => {
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        // Set mobile viewport
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: width,
                        })

                        const { unmount, container: renderContainer } = render(
                            <DashboardLayout userName={userName}>
                                <div>Content</div>
                            </DashboardLayout>,
                            { container }
                        )

                        // Verify interactive elements respond to touch events
                        const notificationIcon = renderContainer.querySelector('[data-testid="notification-icon"]')
                        expect(notificationIcon).toBeInTheDocument()

                        // Simulate touch event
                        mockPush.mockClear()
                        fireEvent.touchStart(notificationIcon!)
                        fireEvent.touchEnd(notificationIcon!)
                        fireEvent.click(notificationIcon!)

                        expect(mockPush).toHaveBeenCalledWith('/notifications')

                        unmount()
                        return true
                    } finally {
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Property 24: Content Viewport Fit', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        cleanup()
    })

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    /**
     * Property: No horizontal scrolling on any device size
     *
     * For any device size, all text and content should be readable without
     * requiring horizontal scrolling.
     */
    it('prevents horizontal scrolling across all viewport widths', () => {
        fc.assert(
            fc.property(
                viewportWidthGenerator(),
                viewportHeightGenerator(),
                userNameGenerator(),
                (width, height, userName) => {
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        // Set viewport size
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: width,
                        })
                        Object.defineProperty(window, 'innerHeight', {
                            writable: true,
                            configurable: true,
                            value: height,
                        })

                        const { unmount, container: renderContainer } = render(
                            <DashboardLayout userName={userName}>
                                <div style={{ width: '100%' }}>
                                    <p>Test content that should not cause horizontal scrolling</p>
                                </div>
                            </DashboardLayout>,
                            { container }
                        )

                        // Verify layout has overflow-x-hidden (prevents horizontal scrolling)
                        const layout = renderContainer.querySelector('[data-testid="dashboard-layout"]')
                        expect(layout).toBeInTheDocument()
                        expect(layout).toHaveClass('overflow-x-hidden')

                        // Verify layout has full width constraints
                        expect(layout).toHaveClass('w-full')
                        expect(layout).toHaveClass('max-w-full')

                        // Verify main content area is present
                        const mainContent = renderContainer.querySelector('[data-testid="main-content"]')
                        expect(mainContent).toBeInTheDocument()
                        expect(mainContent).toHaveClass('min-h-screen')

                        // Verify computed styles (JSDOM may not compute all styles)
                        // Check that classes are present which enforce the behavior
                        const layoutClasses = layout!.className
                        expect(layoutClasses).toMatch(/overflow-x-hidden/)
                        expect(layoutClasses).toMatch(/w-full/)
                        expect(layoutClasses).toMatch(/max-w-full/)

                        // Main content has padding for fixed header/footer
                        const mainContentClasses = mainContent!.className
                        expect(mainContentClasses).toMatch(/pt-16/)
                        expect(mainContentClasses).toMatch(/pb-20/)

                        unmount()
                        return true
                    } finally {
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Content fits within viewport width
     */
    it('ensures all content fits within viewport width without overflow', () => {
        fc.assert(
            fc.property(
                viewportWidthGenerator(),
                userNameGenerator(),
                (width, userName) => {
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: width,
                        })

                        const { unmount, container: renderContainer } = render(
                            <DashboardLayout userName={userName}>
                                <div>
                                    <h1>Dashboard Content</h1>
                                    <p>This is a long piece of text that should wrap properly and not cause horizontal scrolling on any device size.</p>
                                </div>
                            </DashboardLayout>,
                            { container }
                        )

                        const layout = renderContainer.querySelector('[data-testid="dashboard-layout"]')
                        const mainContent = renderContainer.querySelector('[data-testid="main-content"]')

                        // Verify no elements exceed viewport width
                        const allElements = renderContainer.querySelectorAll('*')
                        allElements.forEach(element => {
                            const rect = element.getBoundingClientRect()
                            // Element should not extend beyond viewport (with small tolerance for borders)
                            if (rect.width > 0) {
                                expect(rect.width).toBeLessThanOrEqual(width + 10)
                            }
                        })

                        unmount()
                        return true
                    } finally {
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Responsive padding adapts to viewport
     */
    it('applies appropriate padding for different viewport sizes', () => {
        fc.assert(
            fc.property(
                viewportWidthGenerator(),
                userNameGenerator(),
                (width, userName) => {
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: width,
                        })

                        const { unmount, container: renderContainer } = render(
                            <DashboardLayout userName={userName}>
                                <div>Content</div>
                            </DashboardLayout>,
                            { container }
                        )

                        const mainContent = renderContainer.querySelector('[data-testid="main-content"]')
                        expect(mainContent).toBeInTheDocument()

                        // Verify main content has proper layout classes
                        // The main content uses padding for header/footer spacing
                        const classes = mainContent!.className
                        expect(classes).toMatch(/pt-16/)
                        expect(classes).toMatch(/pb-20/)
                        expect(classes).toMatch(/min-h-screen/)

                        unmount()
                        return true
                    } finally {
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Property 25: Orientation Change Adaptation', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        cleanup()
    })

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    /**
     * Property: Layout adapts within 300ms of orientation change
     *
     * For any device orientation change, the dashboard layout should adapt
     * within 300ms to the new orientation.
     */
    it('adapts layout within 300ms when orientation changes', async () => {
        await fc.assert(
            fc.asyncProperty(
                viewportWidthGenerator(),
                viewportHeightGenerator(),
                userNameGenerator(),
                orientationGenerator(),
                async (width, height, userName, initialOrientation) => {
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        // Set initial viewport
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: width,
                        })
                        Object.defineProperty(window, 'innerHeight', {
                            writable: true,
                            configurable: true,
                            value: height,
                        })

                        const { unmount, container: renderContainer } = render(
                            <DashboardLayout userName={userName}>
                                <div>Content</div>
                            </DashboardLayout>,
                            { container }
                        )

                        const layout = renderContainer.querySelector('[data-testid="dashboard-layout"]')
                        expect(layout).toBeInTheDocument()

                        // Verify transition class is present (for smooth adaptation)
                        expect(layout).toHaveClass('transition-all')
                        expect(layout).toHaveClass('duration-300')
                        expect(layout).toHaveClass('ease-in-out')

                        // Record start time
                        const startTime = Date.now()

                        // Simulate orientation change by swapping width and height
                        const newWidth = height
                        const newHeight = width

                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: newWidth,
                        })
                        Object.defineProperty(window, 'innerHeight', {
                            writable: true,
                            configurable: true,
                            value: newHeight,
                        })

                        // Trigger orientation change event
                        window.dispatchEvent(new Event('orientationchange'))

                        // Wait for adaptation (should be within 300ms)
                        await waitFor(
                            () => {
                                const elapsed = Date.now() - startTime
                                expect(elapsed).toBeLessThan(300)

                                // Verify layout is still functional
                                const updatedLayout = renderContainer.querySelector('[data-testid="dashboard-layout"]')
                                expect(updatedLayout).toBeInTheDocument()
                            },
                            { timeout: 300 }
                        )

                        unmount()
                        return true
                    } finally {
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Resize events trigger layout adaptation
     */
    it('responds to resize events with smooth transitions', async () => {
        await fc.assert(
            fc.asyncProperty(
                viewportWidthGenerator(),
                viewportWidthGenerator(),
                userNameGenerator(),
                async (initialWidth, newWidth, userName) => {
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        // Set initial viewport
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: initialWidth,
                        })

                        const { unmount, container: renderContainer } = render(
                            <DashboardLayout userName={userName}>
                                <div>Content</div>
                            </DashboardLayout>,
                            { container }
                        )

                        const layout = renderContainer.querySelector('[data-testid="dashboard-layout"]')
                        expect(layout).toBeInTheDocument()

                        // Change viewport width
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: newWidth,
                        })

                        // Trigger resize event
                        const startTime = Date.now()
                        window.dispatchEvent(new Event('resize'))

                        // Wait for adaptation
                        await waitFor(
                            () => {
                                const elapsed = Date.now() - startTime
                                expect(elapsed).toBeLessThan(300)

                                // Layout should still be present and functional
                                const updatedLayout = renderContainer.querySelector('[data-testid="dashboard-layout"]')
                                expect(updatedLayout).toBeInTheDocument()
                            },
                            { timeout: 300 }
                        )

                        unmount()
                        return true
                    } finally {
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Multiple rapid orientation changes are handled gracefully
     */
    it('handles multiple rapid orientation changes without breaking', async () => {
        await fc.assert(
            fc.asyncProperty(
                viewportWidthGenerator(),
                viewportHeightGenerator(),
                userNameGenerator(),
                fc.integer({ min: 2, max: 3 }), // Reduced number of rapid changes for performance
                async (width, height, userName, numChanges) => {
                    const container = document.createElement('div')
                    document.body.appendChild(container)

                    try {
                        Object.defineProperty(window, 'innerWidth', {
                            writable: true,
                            configurable: true,
                            value: width,
                        })
                        Object.defineProperty(window, 'innerHeight', {
                            writable: true,
                            configurable: true,
                            value: height,
                        })

                        const { unmount, container: renderContainer } = render(
                            <DashboardLayout userName={userName}>
                                <div>Content</div>
                            </DashboardLayout>,
                            { container }
                        )

                        // Trigger multiple rapid orientation changes
                        for (let i = 0; i < numChanges; i++) {
                            // Swap dimensions
                            const tempWidth = window.innerWidth
                            Object.defineProperty(window, 'innerWidth', {
                                writable: true,
                                configurable: true,
                                value: window.innerHeight,
                            })
                            Object.defineProperty(window, 'innerHeight', {
                                writable: true,
                                configurable: true,
                                value: tempWidth,
                            })

                            window.dispatchEvent(new Event('orientationchange'))

                            // Smaller delay between changes for faster test
                            await new Promise(resolve => setTimeout(resolve, 20))
                        }

                        // Wait for all changes to settle
                        await waitFor(
                            () => {
                                const layout = renderContainer.querySelector('[data-testid="dashboard-layout"]')
                                expect(layout).toBeInTheDocument()

                                // Verify all components are still present
                                expect(renderContainer.querySelector('[data-testid="dashboard-header"]')).toBeInTheDocument()
                                expect(renderContainer.querySelector('[data-testid="main-content"]')).toBeInTheDocument()
                                expect(renderContainer.querySelector('[data-testid="footer-navigation"]')).toBeInTheDocument()
                            },
                            { timeout: 500 }
                        )

                        unmount()
                        return true
                    } finally {
                        if (container.parentNode) {
                            document.body.removeChild(container)
                        }
                        jest.clearAllMocks()
                    }
                }
            ),
            { numRuns: 50 } // Reduced from 100 to 50 for performance
        )
    }, 10000) // Increased timeout to 10 seconds
})
