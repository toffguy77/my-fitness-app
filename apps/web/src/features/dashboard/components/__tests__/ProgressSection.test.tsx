/**
 * Unit tests for ProgressSection component
 *
 * Tests: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressSection } from '../ProgressSection'

// Mock window.location.href
delete (window as any).location
window.location = { href: '' } as any

describe('ProgressSection', () => {
    beforeEach(() => {
        window.location.href = ''
        jest.clearAllMocks()
    })

    describe('Loading state', () => {
        it('displays loading spinner initially', () => {
            render(<ProgressSection />)

            // Look for the spinner div with animate-spin class
            const spinner = document.querySelector('.animate-spin')
            expect(spinner).toBeInTheDocument()
        })
    })

    describe('Insufficient data placeholder', () => {
        it('displays placeholder when no data available', async () => {
            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
            }, { timeout: 3000 })

            expect(screen.getByText(/Продолжайте отслеживать свой прогресс/)).toBeInTheDocument()
        })

        it('displays Activity icon in placeholder', async () => {
            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
            }, { timeout: 3000 })

            // Icon should be present
            const icon = document.querySelector('svg')
            expect(icon).toBeInTheDocument()
        })
    })

    describe('Header', () => {
        it('renders section title', () => {
            render(<ProgressSection />)

            expect(screen.getByText('Прогресс')).toBeInTheDocument()
        })
    })

    describe('Custom className', () => {
        it('applies custom className to root element', () => {
            const { container } = render(<ProgressSection className="custom-class" />)

            const card = container.firstChild
            expect(card).toHaveClass('custom-class')
        })
    })
})
