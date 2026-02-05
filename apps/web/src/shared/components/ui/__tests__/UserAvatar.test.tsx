import { render, fireEvent } from '@testing-library/react'
import fc from 'fast-check'
import { UserAvatar } from '../UserAvatar'

describe('UserAvatar', () => {
    describe('Property 1: Header Completeness - UserAvatar Presence', () => {
        it('Feature: dashboard-layout, Property 1: UserAvatar should always render with user name for any valid input', () => {
            // **Validates: Requirements 1.1**

            fc.assert(
                fc.property(
                    fc.record({
                        name: fc.string({ minLength: 1, maxLength: 100 }),
                        avatarUrl: fc.option(fc.webUrl(), { nil: undefined }),
                        size: fc.constantFrom('sm', 'md', 'lg'),
                    }),
                    (userData) => {
                        const { container } = render(
                            <UserAvatar
                                name={userData.name}
                                avatarUrl={userData.avatarUrl}
                                size={userData.size}
                            />
                        )

                        // Property: For any valid user data, the UserAvatar should be present
                        const userAvatar = container.querySelector('[data-testid="user-avatar"]')
                        expect(userAvatar).toBeInTheDocument()
                        expect(userAvatar).toBeTruthy()

                        // Property: User name should be reflected in aria-label
                        const ariaLabel = userAvatar?.getAttribute('aria-label')
                        expect(ariaLabel).toContain(userData.name)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard-layout, Property 1: UserAvatar should display initials when no avatar URL provided', () => {
            // **Validates: Requirements 1.1**

            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    (name) => {
                        const { container } = render(<UserAvatar name={name} />)

                        // Property: When no avatarUrl, initials should be displayed
                        const userAvatar = container.querySelector('[data-testid="user-avatar"]')
                        expect(userAvatar).toBeInTheDocument()

                        // Should contain the first letter as initial
                        const expectedInitial = name.charAt(0).toUpperCase()
                        expect(userAvatar?.textContent).toBe(expectedInitial)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Feature: dashboard-layout, Property 1: UserAvatar should render as button when onClick provided', () => {
            // **Validates: Requirements 1.1, 1.4**

            fc.assert(
                fc.property(
                    fc.record({
                        name: fc.string({ minLength: 1, maxLength: 100 }),
                        hasClickHandler: fc.boolean(),
                    }),
                    (userData) => {
                        const mockOnClick = userData.hasClickHandler ? jest.fn() : undefined

                        const { container } = render(
                            <UserAvatar name={userData.name} onClick={mockOnClick} />
                        )

                        const userAvatar = container.querySelector('[data-testid="user-avatar"]')
                        expect(userAvatar).toBeInTheDocument()

                        // Property: Should be button when clickable, div otherwise
                        if (userData.hasClickHandler) {
                            expect(userAvatar?.tagName).toBe('BUTTON')
                            expect(userAvatar).toHaveAttribute('aria-label', `${userData.name}'s profile`)
                        } else {
                            expect(userAvatar?.tagName).toBe('DIV')
                            expect(userAvatar).toHaveAttribute('aria-label', `${userData.name}'s avatar`)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Unit Tests - Specific Examples', () => {
        it('should render with minimal user data', () => {
            const { container } = render(<UserAvatar name="A" />)
            const userAvatar = container.querySelector('[data-testid="user-avatar"]')
            expect(userAvatar).toBeInTheDocument()
            expect(userAvatar?.textContent).toBe('A')
        })

        it('should display initials when no avatar URL provided', () => {
            const { container } = render(<UserAvatar name="John Doe" />)
            const userAvatar = container.querySelector('[data-testid="user-avatar"]')
            expect(userAvatar?.textContent).toBe('J')
        })

        it('should display image when avatar URL provided', () => {
            const { container } = render(
                <UserAvatar name="John Doe" avatarUrl="https://example.com/avatar.jpg" />
            )
            const img = container.querySelector('img')
            expect(img).toBeInTheDocument()
            expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
            expect(img).toHaveAttribute('alt', "John Doe's avatar")
        })

        it('should handle click when onClick is provided', () => {
            const mockOnClick = jest.fn()
            const { container } = render(
                <UserAvatar name="John Doe" onClick={mockOnClick} />
            )
            const userAvatar = container.querySelector('[data-testid="user-avatar"]')

            fireEvent.click(userAvatar!)
            expect(mockOnClick).toHaveBeenCalledTimes(1)
        })

        it('should render all size variants correctly', () => {
            const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg']

            sizes.forEach(size => {
                const { container } = render(<UserAvatar name="Test User" size={size} />)
                const userAvatar = container.querySelector('[data-testid="user-avatar"]')
                expect(userAvatar).toBeInTheDocument()
            })
        })

        it('should handle long user names', () => {
            const longName = 'A'.repeat(100)
            const { container } = render(<UserAvatar name={longName} />)
            const userAvatar = container.querySelector('[data-testid="user-avatar"]')

            expect(userAvatar).toBeInTheDocument()
            expect(userAvatar?.textContent).toBe('A')
            expect(userAvatar?.getAttribute('aria-label')).toContain(longName)
        })

        it('should have proper accessibility attributes', () => {
            const { container } = render(<UserAvatar name="Jane Smith" />)
            const userAvatar = container.querySelector('[data-testid="user-avatar"]')

            expect(userAvatar).toHaveAttribute('aria-label', "Jane Smith's avatar")
        })

        it('should have proper accessibility attributes when clickable', () => {
            const mockOnClick = jest.fn()
            const { container } = render(
                <UserAvatar name="Jane Smith" onClick={mockOnClick} />
            )
            const userAvatar = container.querySelector('[data-testid="user-avatar"]')

            expect(userAvatar).toHaveAttribute('aria-label', "Jane Smith's profile")
        })
    })
})
