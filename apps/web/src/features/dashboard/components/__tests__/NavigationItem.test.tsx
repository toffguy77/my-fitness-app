import { render, fireEvent } from '@testing-library/react'
import fc from 'fast-check'
import { Home, Utensils, Dumbbell, MessageCircle, FileText } from 'lucide-react'
import { NavigationItem } from '../NavigationItem'
import type { NavigationItemId } from '../../types'

// Test icons for property-based testing
const testIcons = [Home, Utensils, Dumbbell, MessageCircle, FileText]
const testIds: NavigationItemId[] = ['dashboard', 'food-tracker', 'workout', 'chat', 'content']

describe('NavigationItem', () => {
    describe('Property 15: Active Item Visual Distinction', () => {
        it('Feature: dashboard-layout, Property 15: Active navigation items should have visually distinct styling', () => {
            // **Validates: Requirements 6.4**

            fc.assert(
                fc.property(
                    fc.record({
                        id: fc.constantFrom(...testIds),
                        label: fc.string({ minLength: 1, maxLength: 50 }),
                        icon: fc.constantFrom(...testIcons),
                        href: fc.webPath(),
                        isActive: fc.boolean(),
                    }),
                    (navData) => {
                        const { container } = render(
                            <NavigationItem
                                id={navData.id}
                                label={navData.label}
                                icon={navData.icon}
                                href={navData.href}
                                isActive={navData.isActive}
                            />
                        )

                        const navItem = container.querySelector(`[data-testid="nav-item-${navData.id}"]`)
                        expect(navItem).toBeInTheDocument()

                        // Property: Active items should have distinct visual styling
                        if (navData.isActive) {
                            // Active state: accent color (blue-600)
                            expect(navItem).toHaveClass('text-blue-600')

                            // Active state should have aria-current attribute
                            expect(navItem).toHaveAttribute('aria-current', 'page')

                            // Label should be bold/semibold
                            const label = navItem?.querySelector('span')
                            expect(label).toHaveClass('font-semibold')
                        } else {
                            // Inactive state: grey color
                            expect(navItem).toHaveClass('text-gray-600')

                            // Should not have aria-current
                            expect(navItem).not.toHaveAttribute('aria-current')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 16: Disabled Item Visual Indication', () => {
        it('Feature: dashboard-layout, Property 16: Disabled navigation items should have reduced opacity and greyed-out styling', () => {
            // **Validates: Requirements 6.5**

            fc.assert(
                fc.property(
                    fc.record({
                        id: fc.constantFrom(...testIds),
                        label: fc.string({ minLength: 1, maxLength: 50 }),
                        icon: fc.constantFrom(...testIcons),
                        href: fc.webPath(),
                        isDisabled: fc.boolean(),
                    }),
                    (navData) => {
                        const { container } = render(
                            <NavigationItem
                                id={navData.id}
                                label={navData.label}
                                icon={navData.icon}
                                href={navData.href}
                                isDisabled={navData.isDisabled}
                            />
                        )

                        const navItem = container.querySelector(`[data-testid="nav-item-${navData.id}"]`)
                        expect(navItem).toBeInTheDocument()

                        // Property: Disabled items should have reduced opacity and grey styling
                        if (navData.isDisabled) {
                            // Disabled state: reduced opacity (0.4)
                            expect(navItem).toHaveClass('opacity-40')

                            // Disabled state: grey color
                            expect(navItem).toHaveClass('text-gray-400')

                            // Disabled state: cursor not-allowed
                            expect(navItem).toHaveClass('cursor-not-allowed')

                            // Should have disabled attribute
                            expect(navItem).toHaveAttribute('disabled')
                            expect(navItem).toHaveAttribute('aria-disabled', 'true')
                        } else {
                            // Enabled state: no opacity reduction
                            expect(navItem).not.toHaveClass('opacity-40')

                            // Enabled state: cursor pointer
                            expect(navItem).toHaveClass('cursor-pointer')

                            // Should not have disabled attribute
                            expect(navItem).not.toHaveAttribute('disabled')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 12: Keyboard Focus Indicators', () => {
        it('Feature: dashboard-layout, Property 12: Navigation items should have visible focus indicators when focused via keyboard', () => {
            // **Validates: Requirements 5.1**

            fc.assert(
                fc.property(
                    fc.record({
                        id: fc.constantFrom(...testIds),
                        label: fc.string({ minLength: 1, maxLength: 50 }),
                        icon: fc.constantFrom(...testIcons),
                        href: fc.webPath(),
                    }),
                    (navData) => {
                        const { container } = render(
                            <NavigationItem
                                id={navData.id}
                                label={navData.label}
                                icon={navData.icon}
                                href={navData.href}
                            />
                        )

                        const navItem = container.querySelector(`[data-testid="nav-item-${navData.id}"]`)
                        expect(navItem).toBeInTheDocument()

                        // Property: All interactive elements should have focus indicators
                        // Verify focus-visible classes are present
                        expect(navItem).toHaveClass('focus-visible:outline-none')
                        expect(navItem).toHaveClass('focus-visible:ring-2')
                        expect(navItem).toHaveClass('focus-visible:ring-offset-2')
                        expect(navItem).toHaveClass('focus-visible:ring-blue-600')
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 13: Accessibility Attributes', () => {
        it('Feature: dashboard-layout, Property 13: Navigation items should have appropriate ARIA labels and disabled state communication', () => {
            // **Validates: Requirements 5.2, 5.3**

            fc.assert(
                fc.property(
                    fc.record({
                        id: fc.constantFrom(...testIds),
                        label: fc.string({ minLength: 1, maxLength: 50 }),
                        icon: fc.constantFrom(...testIcons),
                        href: fc.webPath(),
                        isActive: fc.boolean(),
                        isDisabled: fc.boolean(),
                    }),
                    (navData) => {
                        const { container } = render(
                            <NavigationItem
                                id={navData.id}
                                label={navData.label}
                                icon={navData.icon}
                                href={navData.href}
                                isActive={navData.isActive}
                                isDisabled={navData.isDisabled}
                            />
                        )

                        const navItem = container.querySelector(`[data-testid="nav-item-${navData.id}"]`)
                        expect(navItem).toBeInTheDocument()

                        // Property: All navigation items should have appropriate ARIA labels
                        expect(navItem).toHaveAttribute('aria-label', navData.label)

                        // Property: Active items should communicate their state
                        if (navData.isActive) {
                            expect(navItem).toHaveAttribute('aria-current', 'page')
                        }

                        // Property: Disabled items should communicate their disabled state
                        if (navData.isDisabled) {
                            expect(navItem).toHaveAttribute('aria-disabled', 'true')
                            expect(navItem).toHaveAttribute('disabled')
                        } else {
                            expect(navItem).toHaveAttribute('aria-disabled', 'false')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Unit Tests - Specific Examples', () => {
        it('should render with minimal props', () => {
            const { container } = render(
                <NavigationItem
                    id="dashboard"
                    label="Dashboard"
                    icon={Home}
                    href="/dashboard"
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            expect(navItem).toBeInTheDocument()
            expect(navItem?.textContent).toContain('Dashboard')
        })

        it('should render active state correctly', () => {
            const { container } = render(
                <NavigationItem
                    id="dashboard"
                    label="Dashboard"
                    icon={Home}
                    href="/dashboard"
                    isActive={true}
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            expect(navItem).toHaveClass('text-blue-600')
            expect(navItem).toHaveAttribute('aria-current', 'page')

            const label = navItem?.querySelector('span')
            expect(label).toHaveClass('font-semibold')
        })

        it('should render disabled state correctly', () => {
            const { container } = render(
                <NavigationItem
                    id="workout"
                    label="Workout"
                    icon={Dumbbell}
                    href="/workout"
                    isDisabled={true}
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-workout"]')
            expect(navItem).toHaveClass('opacity-40')
            expect(navItem).toHaveClass('text-gray-400')
            expect(navItem).toHaveClass('cursor-not-allowed')
            expect(navItem).toHaveAttribute('disabled')
            expect(navItem).toHaveAttribute('aria-disabled', 'true')
        })

        it('should call onClick when clicked and not disabled', () => {
            const mockOnClick = jest.fn()
            const { container } = render(
                <NavigationItem
                    id="dashboard"
                    label="Dashboard"
                    icon={Home}
                    href="/dashboard"
                    onClick={mockOnClick}
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            fireEvent.click(navItem!)

            expect(mockOnClick).toHaveBeenCalledTimes(1)
            expect(mockOnClick).toHaveBeenCalledWith('dashboard')
        })

        it('should not call onClick when disabled', () => {
            const mockOnClick = jest.fn()
            const { container } = render(
                <NavigationItem
                    id="workout"
                    label="Workout"
                    icon={Dumbbell}
                    href="/workout"
                    isDisabled={true}
                    onClick={mockOnClick}
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-workout"]')
            fireEvent.click(navItem!)

            expect(mockOnClick).not.toHaveBeenCalled()
        })

        it('should support keyboard navigation with Enter key', () => {
            const mockOnClick = jest.fn()
            const { container } = render(
                <NavigationItem
                    id="dashboard"
                    label="Dashboard"
                    icon={Home}
                    href="/dashboard"
                    onClick={mockOnClick}
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            fireEvent.keyDown(navItem!, { key: 'Enter' })

            expect(mockOnClick).toHaveBeenCalledTimes(1)
            expect(mockOnClick).toHaveBeenCalledWith('dashboard')
        })

        it('should support keyboard navigation with Space key', () => {
            const mockOnClick = jest.fn()
            const { container } = render(
                <NavigationItem
                    id="dashboard"
                    label="Dashboard"
                    icon={Home}
                    href="/dashboard"
                    onClick={mockOnClick}
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            fireEvent.keyDown(navItem!, { key: ' ' })

            expect(mockOnClick).toHaveBeenCalledTimes(1)
            expect(mockOnClick).toHaveBeenCalledWith('dashboard')
        })

        it('should not respond to keyboard when disabled', () => {
            const mockOnClick = jest.fn()
            const { container } = render(
                <NavigationItem
                    id="workout"
                    label="Workout"
                    icon={Dumbbell}
                    href="/workout"
                    isDisabled={true}
                    onClick={mockOnClick}
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-workout"]')
            fireEvent.keyDown(navItem!, { key: 'Enter' })
            fireEvent.keyDown(navItem!, { key: ' ' })

            expect(mockOnClick).not.toHaveBeenCalled()
        })

        it('should render with Russian labels', () => {
            const { container } = render(
                <NavigationItem
                    id="food-tracker"
                    label="Фудтрекер"
                    icon={Utensils}
                    href="/food-tracker"
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-food-tracker"]')
            expect(navItem?.textContent).toContain('Фудтрекер')
            expect(navItem).toHaveAttribute('aria-label', 'Фудтрекер')
        })

        it('should render icon with proper aria-hidden attribute', () => {
            const { container } = render(
                <NavigationItem
                    id="dashboard"
                    label="Dashboard"
                    icon={Home}
                    href="/dashboard"
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            const icon = navItem?.querySelector('svg')

            expect(icon).toBeInTheDocument()
            expect(icon).toHaveAttribute('aria-hidden', 'true')
        })

        it('should have vertical layout with icon above label', () => {
            const { container } = render(
                <NavigationItem
                    id="dashboard"
                    label="Dashboard"
                    icon={Home}
                    href="/dashboard"
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-dashboard"]')

            // Verify flex-col class for vertical layout
            expect(navItem).toHaveClass('flex-col')
            expect(navItem).toHaveClass('items-center')
        })

        it('should store href in data attribute', () => {
            const { container } = render(
                <NavigationItem
                    id="dashboard"
                    label="Dashboard"
                    icon={Home}
                    href="/dashboard"
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-dashboard"]')
            expect(navItem).toHaveAttribute('data-href', '/dashboard')
        })

        it('should handle both active and disabled states (disabled takes precedence)', () => {
            const { container } = render(
                <NavigationItem
                    id="workout"
                    label="Workout"
                    icon={Dumbbell}
                    href="/workout"
                    isActive={true}
                    isDisabled={true}
                />
            )

            const navItem = container.querySelector('[data-testid="nav-item-workout"]')

            // Disabled styling should be present
            expect(navItem).toHaveClass('opacity-40')
            expect(navItem).toHaveAttribute('disabled')

            // But active state should still be communicated for accessibility
            expect(navItem).toHaveAttribute('aria-current', 'page')
        })
    })
})
