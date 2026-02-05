import { render } from '@testing-library/react'
import fc from 'fast-check'
import { MainContent } from '../MainContent'

describe('MainContent', () => {
    describe('Property 8: Main Content Layout', () => {
        it('Feature: dashboard-layout, Property 8: Main content should be positioned between header and footer with proper layout', () => {
            // **Validates: Requirements 3.1, 3.3, 3.4**

            fc.assert(
                fc.property(
                    fc.string({ minLength: 0, maxLength: 1000 }),
                    (content) => {
                        const { container } = render(
                            <MainContent>
                                <div>{content}</div>
                            </MainContent>
                        )

                        const mainContent = container.querySelector('[data-testid="main-content"]')
                        expect(mainContent).toBeInTheDocument()

                        // Property: Main content should have flex-grow to fill available space (Requirement 3.1, 3.3)
                        expect(mainContent).toHaveClass('flex-grow')

                        // Property: Main content should be scrollable when content exceeds viewport height (Requirement 3.4)
                        expect(mainContent).toHaveClass('overflow-y-auto')

                        // Property: Main content should have consistent padding (Requirement 3.1)
                        expect(mainContent).toHaveClass('px-4')
                        expect(mainContent).toHaveClass('py-6')
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property 9: Placeholder Content Presence', () => {
        it('Feature: dashboard-layout, Property 9: Main content should display children content', () => {
            // **Validates: Requirements 3.2**

            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
                    (placeholderText) => {
                        const { container } = render(
                            <MainContent>
                                <div>{placeholderText}</div>
                            </MainContent>
                        )

                        const mainContent = container.querySelector('[data-testid="main-content"]')

                        // Property: For any dashboard render, the main content area should display placeholder content
                        expect(mainContent).toBeInTheDocument()
                        expect(mainContent?.textContent).toBe(placeholderText)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Unit Tests - Specific Examples', () => {
        it('should render with simple text content', () => {
            const { getByText } = render(
                <MainContent>
                    <p>Dashboard content</p>
                </MainContent>
            )

            expect(getByText('Dashboard content')).toBeInTheDocument()
        })

        it('should render with complex nested content', () => {
            const { getByTestId } = render(
                <MainContent>
                    <div data-testid="complex-content">
                        <h1>Title</h1>
                        <p>Paragraph</p>
                        <ul>
                            <li>Item 1</li>
                            <li>Item 2</li>
                        </ul>
                    </div>
                </MainContent>
            )

            expect(getByTestId('complex-content')).toBeInTheDocument()
        })

        it('should apply custom className when provided', () => {
            const { container } = render(
                <MainContent className="custom-class">
                    <p>Content</p>
                </MainContent>
            )

            const mainContent = container.querySelector('[data-testid="main-content"]')
            expect(mainContent).toHaveClass('custom-class')
        })

        it('should render with empty content', () => {
            const { container } = render(
                <MainContent>
                    <></>
                </MainContent>
            )

            const mainContent = container.querySelector('[data-testid="main-content"]')
            expect(mainContent).toBeInTheDocument()
            expect(mainContent).toBeEmptyDOMElement()
        })

        it('should maintain layout classes regardless of content', () => {
            const { container, rerender } = render(
                <MainContent>
                    <p>Short content</p>
                </MainContent>
            )

            let mainContent = container.querySelector('[data-testid="main-content"]')
            expect(mainContent).toHaveClass('flex-grow', 'overflow-y-auto', 'px-4', 'py-6')

            // Rerender with long content
            rerender(
                <MainContent>
                    <div>{Array(100).fill('Long content ').join('')}</div>
                </MainContent>
            )

            mainContent = container.querySelector('[data-testid="main-content"]')
            expect(mainContent).toHaveClass('flex-grow', 'overflow-y-auto', 'px-4', 'py-6')
        })
    })
})
