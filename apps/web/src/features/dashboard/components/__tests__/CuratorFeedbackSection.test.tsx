/**
 * Unit tests for CuratorFeedbackSection component
 *
 * Tests:
 * - Renders nothing when no reportId
 * - Renders nothing when API fails
 * - Shows feedback in collapsed state
 * - Expands on click to show content
 * - Shows category rating badges
 * - Shows recommendations when present
 */

import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CuratorFeedbackSection } from '../CuratorFeedbackSection'
import { dashboardApi } from '../../api/dashboardApi'
import type { CuratorFeedback } from '../../types'

// Mock the dashboard API
jest.mock('../../api/dashboardApi')
const mockDashboardApi = dashboardApi as jest.Mocked<typeof dashboardApi>

/**
 * Helper: Create mock feedback
 */
function createMockFeedback(overrides?: Partial<CuratorFeedback>): CuratorFeedback {
    return {
        nutrition: { rating: 'excellent', comment: 'Great nutrition tracking' },
        activity: { rating: 'good' },
        water: { rating: 'needs_improvement', comment: 'Drink more water' },
        summary: 'Good progress this week!',
        recommendations: 'Try to drink at least 2L of water daily.',
        ...overrides,
    }
}

describe('CuratorFeedbackSection', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    describe('Empty state', () => {
        it('renders nothing when no reportId', () => {
            const { container } = render(<CuratorFeedbackSection />)
            expect(container.querySelector('section')).toBeNull()
        })

        it('renders nothing when API fails', async () => {
            mockDashboardApi.getReportFeedback.mockRejectedValue(
                new Error('Not found')
            )

            const { container } = render(
                <CuratorFeedbackSection reportId="report-1" />
            )

            await waitFor(() => {
                expect(mockDashboardApi.getReportFeedback).toHaveBeenCalledWith(
                    'report-1'
                )
            })

            expect(container.querySelector('section')).toBeNull()
        })
    })

    describe('Collapsed state', () => {
        it('shows heading when feedback is available', async () => {
            mockDashboardApi.getReportFeedback.mockResolvedValue(
                createMockFeedback()
            )

            render(<CuratorFeedbackSection reportId="report-1" />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', {
                        name: /обратная связь куратора/i,
                    })
                ).toBeInTheDocument()
            })
        })

        it('does not show content when collapsed', async () => {
            mockDashboardApi.getReportFeedback.mockResolvedValue(
                createMockFeedback()
            )

            render(<CuratorFeedbackSection reportId="report-1" />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', {
                        name: /обратная связь куратора/i,
                    })
                ).toBeInTheDocument()
            })

            // Summary text should not be visible in collapsed state
            expect(
                screen.queryByText('Good progress this week!')
            ).not.toBeInTheDocument()
        })
    })

    describe('Expanded state', () => {
        it('expands on click to show content', async () => {
            const user = userEvent.setup()
            mockDashboardApi.getReportFeedback.mockResolvedValue(
                createMockFeedback()
            )

            render(<CuratorFeedbackSection reportId="report-1" />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', {
                        name: /обратная связь куратора/i,
                    })
                ).toBeInTheDocument()
            })

            // Click to expand
            const toggleButton = screen.getByRole('button', {
                expanded: false,
            })
            await user.click(toggleButton)

            // Summary should now be visible
            expect(
                screen.getByText('Good progress this week!')
            ).toBeInTheDocument()
        })

        it('shows category rating badges', async () => {
            const user = userEvent.setup()
            mockDashboardApi.getReportFeedback.mockResolvedValue(
                createMockFeedback()
            )

            render(<CuratorFeedbackSection reportId="report-1" />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', {
                        name: /обратная связь куратора/i,
                    })
                ).toBeInTheDocument()
            })

            await user.click(screen.getByRole('button', { expanded: false }))

            // Check rating badges
            expect(screen.getByText('Отлично')).toBeInTheDocument()
            expect(screen.getByText('Хорошо')).toBeInTheDocument()
            expect(screen.getByText('Нужно улучшить')).toBeInTheDocument()
        })

        it('shows category labels', async () => {
            const user = userEvent.setup()
            mockDashboardApi.getReportFeedback.mockResolvedValue(
                createMockFeedback()
            )

            render(<CuratorFeedbackSection reportId="report-1" />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', {
                        name: /обратная связь куратора/i,
                    })
                ).toBeInTheDocument()
            })

            await user.click(screen.getByRole('button', { expanded: false }))

            expect(screen.getByText('Питание:')).toBeInTheDocument()
            expect(screen.getByText('Активность:')).toBeInTheDocument()
            expect(screen.getByText('Вода:')).toBeInTheDocument()
        })

        it('shows recommendations when present', async () => {
            const user = userEvent.setup()
            mockDashboardApi.getReportFeedback.mockResolvedValue(
                createMockFeedback()
            )

            render(<CuratorFeedbackSection reportId="report-1" />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', {
                        name: /обратная связь куратора/i,
                    })
                ).toBeInTheDocument()
            })

            await user.click(screen.getByRole('button', { expanded: false }))

            expect(screen.getByText('Рекомендации')).toBeInTheDocument()
            expect(
                screen.getByText('Try to drink at least 2L of water daily.')
            ).toBeInTheDocument()
        })

        it('hides recommendations block when no recommendations', async () => {
            const user = userEvent.setup()
            mockDashboardApi.getReportFeedback.mockResolvedValue(
                createMockFeedback({ recommendations: undefined })
            )

            render(<CuratorFeedbackSection reportId="report-1" />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', {
                        name: /обратная связь куратора/i,
                    })
                ).toBeInTheDocument()
            })

            await user.click(screen.getByRole('button', { expanded: false }))

            expect(screen.queryByText('Рекомендации')).not.toBeInTheDocument()
        })

        it('collapses on second click', async () => {
            const user = userEvent.setup()
            mockDashboardApi.getReportFeedback.mockResolvedValue(
                createMockFeedback()
            )

            render(<CuratorFeedbackSection reportId="report-1" />)

            await waitFor(() => {
                expect(
                    screen.getByRole('heading', {
                        name: /обратная связь куратора/i,
                    })
                ).toBeInTheDocument()
            })

            // Expand
            await user.click(screen.getByRole('button', { expanded: false }))
            expect(
                screen.getByText('Good progress this week!')
            ).toBeInTheDocument()

            // Collapse
            await user.click(screen.getByRole('button', { expanded: true }))
            expect(
                screen.queryByText('Good progress this week!')
            ).not.toBeInTheDocument()
        })
    })
})
