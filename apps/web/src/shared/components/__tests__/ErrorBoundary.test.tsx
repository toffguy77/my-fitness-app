import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../ErrorBoundary'

// Component that throws an error
const ThrowError = () => {
    throw new Error('Test error')
}

// Component that works fine
const WorkingComponent = () => <div>Working</div>

describe('ErrorBoundary', () => {
    // Suppress console.error for these tests
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('renders children when there is no error', () => {
        render(
            <ErrorBoundary>
                <WorkingComponent />
            </ErrorBoundary>
        )

        expect(screen.getByText('Working')).toBeInTheDocument()
    })

    it('renders error UI when there is an error', () => {
        render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        )

        expect(screen.getByText(/что-то пошло не так/i)).toBeInTheDocument()
    })

    it('shows error message in error UI', () => {
        render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        )

        expect(screen.getByText(/test error/i)).toBeInTheDocument()
    })
})
