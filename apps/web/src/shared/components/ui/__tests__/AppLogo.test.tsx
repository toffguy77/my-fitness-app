import { render, fireEvent } from '@testing-library/react'
import fc from 'fast-check'
import { AppLogo } from '../AppLogo'

describe('AppLogo', () => {
    describe('Property 1: Header Completeness - AppLogo Presence', () => {
        it('Feature: dashboard-layout, Property 1: AppLogo should always render with testid for any size variant', () => {
            // **Validates: Requirements 1.2**

            fc.assert(
                fc.property(
                    fc.constantFrom('sm', 'md', 'lg'),
                    (size) => {
                        const { container } = render(<AppLogo size={size} />)

                        // Property: For any size variant, the AppLogo should be present and identifiable
                        const appLogo = container.querySelector('[data-testid="app-logo"]')
                        expect(appLogo).toBeInTheDocument()
                        expect(appLogo).toBeTruthy()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard-layout, Property 1: AppLogo should render with or without click handler', () => {
            // **Validates: Requirements 1.2**

            fc.assert(
                fc.property(
                    fc.boolean(),
                    fc.constantFrom('sm', 'md', 'lg'),
                    (hasClickHandler, size) => {
                        const mockOnClick = hasClickHandler ? jest.fn() : undefined

                        const { container } = render(
                            <AppLogo size={size} onClick={mockOnClick} />
                        )

                        // Property: AppLogo should always be present regardless of click handler
                        const appLogo = container.querySelector('[data-testid="app-logo"]')
                        expect(appLogo).toBeInTheDocument()

                        // If click handler provided, element should be a button
                        if (hasClickHandler) {
                            expect(appLogo?.tagName).toBe('BUTTON')
                            expect(appLogo).toHaveAttribute('aria-label', 'Go to dashboard')
                        } else {
                            expect(appLogo?.tagName).toBe('DIV')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Unit Tests - Specific Examples', () => {
        it('should render with default medium size', () => {
            const { container } = render(<AppLogo />)
            const appLogo = container.querySelector('[data-testid="app-logo"]')
            expect(appLogo).toBeInTheDocument()
        })

        it('should render as button when onClick is provided', () => {
            const mockOnClick = jest.fn()
            const { container } = render(<AppLogo onClick={mockOnClick} />)
            const appLogo = container.querySelector('[data-testid="app-logo"]')

            expect(appLogo?.tagName).toBe('BUTTON')
            fireEvent.click(appLogo!)
            expect(mockOnClick).toHaveBeenCalledTimes(1)
        })

        it('should render as div when onClick is not provided', () => {
            const { container } = render(<AppLogo />)
            const appLogo = container.querySelector('[data-testid="app-logo"]')
            expect(appLogo?.tagName).toBe('DIV')
        })

        it('should render all size variants correctly', () => {
            const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg']

            sizes.forEach(size => {
                const { container } = render(<AppLogo size={size} />)
                const appLogo = container.querySelector('[data-testid="app-logo"]')
                expect(appLogo).toBeInTheDocument()
            })
        })

        it('should have proper accessibility attributes when clickable', () => {
            const mockOnClick = jest.fn()
            const { container } = render(<AppLogo onClick={mockOnClick} />)
            const appLogo = container.querySelector('[data-testid="app-logo"]')

            expect(appLogo).toHaveAttribute('aria-label', 'Go to dashboard')
        })
    })
})
