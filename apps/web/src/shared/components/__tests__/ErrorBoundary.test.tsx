import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '../ErrorBoundary'

jest.mock('../../utils/logger', () => ({
    logger: {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    },
}))

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) {
        throw new Error('Test error')
    }
    return <div>Child content</div>
}

describe('ErrorBoundary', () => {
    // Suppress React error boundary console errors during tests
    beforeAll(() => {
        jest.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterAll(() => {
        jest.restoreAllMocks()
    })

    it('renders children when no error occurs', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={false} />
            </ErrorBoundary>
        )
        expect(screen.getByText('Child content')).toBeInTheDocument()
    })

    it('shows default fallback UI when a child throws', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        )

        expect(screen.queryByText('Child content')).not.toBeInTheDocument()
        expect(screen.getByText(/Что-то пошло не так/)).toBeInTheDocument()
        expect(screen.getByText(/Произошла непредвиденная ошибка/)).toBeInTheDocument()
    })

    it('shows reload button in default fallback', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        )

        expect(screen.getByRole('button', { name: /Перезагрузить страницу/ })).toBeInTheDocument()
    })

    it('renders a clickable reload button in default fallback', async () => {
        const user = userEvent.setup()

        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        )

        const reloadButton = screen.getByRole('button', { name: /Перезагрузить страницу/ })
        expect(reloadButton).toBeEnabled()

        // Verify the button can be clicked without throwing
        await user.click(reloadButton)
    })

    it('shows custom fallback when provided', () => {
        render(
            <ErrorBoundary fallback={<div>Custom error view</div>}>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        )

        expect(screen.queryByText('Child content')).not.toBeInTheDocument()
        expect(screen.getByText('Custom error view')).toBeInTheDocument()
        expect(screen.queryByText(/Что-то пошло не так/)).not.toBeInTheDocument()
    })

    it('calls onError callback when error is caught', () => {
        const handleError = jest.fn()
        render(
            <ErrorBoundary onError={handleError}>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        )

        expect(handleError).toHaveBeenCalledTimes(1)
        expect(handleError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Test error' }),
            expect.objectContaining({ componentStack: expect.any(String) })
        )
    })

    it('logs error via logger when error is caught', () => {
        const { logger } = jest.requireMock('../../utils/logger')

        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        )

        expect(logger.error).toHaveBeenCalledWith(
            'React Error Boundary caught an error',
            expect.objectContaining({ message: 'Test error' }),
            expect.objectContaining({ errorBoundary: true })
        )
    })
})
