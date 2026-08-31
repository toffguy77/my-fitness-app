import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'

function Exploding(): never {
    throw new Error('widget failed')
}

// A failing widget must not take the page with it. Route-level error.tsx is too
// coarse for a dashboard of independently-loading sections.
describe('widget isolation', () => {
    let consoleError: jest.SpyInstance

    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => consoleError.mockRestore())

    it('keeps sibling widgets rendered when one throws', () => {
        render(
            <div>
                <div>Соседний блок</div>
                <ErrorBoundary variant="inline" label="dashboard-test">
                    <Exploding />
                </ErrorBoundary>
                <div>Ещё один блок</div>
            </div>,
        )

        expect(screen.getByText('Соседний блок')).toBeInTheDocument()
        expect(screen.getByText('Ещё один блок')).toBeInTheDocument()
        expect(screen.getByText(/Не удалось загрузить блок/)).toBeInTheDocument()
    })

    it('offers a retry for the failed widget alone', () => {
        render(
            <ErrorBoundary variant="inline" label="dashboard-test">
                <Exploding />
            </ErrorBoundary>,
        )

        expect(screen.getByRole('button', { name: /Повторить/ })).toBeInTheDocument()
        // "На главную" would wrongly suggest the whole page is broken.
        expect(screen.queryByText('На главную')).not.toBeInTheDocument()
    })
})
