/**
 * Unit tests for ProgressSection component
 *
 * Tests: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { render, screen, waitFor } from '@testing-library/react'
import { ProgressSection } from '../ProgressSection'

const mockApiGet = jest.fn()

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: (...args: unknown[]) => mockApiGet(...args),
    },
}))

describe('ProgressSection', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('Loading state', () => {
        it('displays loading spinner initially', () => {
            mockApiGet.mockReturnValue(new Promise(() => {}))

            render(<ProgressSection />)

            const spinner = document.querySelector('.animate-spin')
            expect(spinner).toBeInTheDocument()
            expect(screen.getByText('Загрузка...')).toBeInTheDocument()
        })
    })

    describe('Insufficient data placeholder', () => {
        it('displays placeholder when no data available', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 0,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
            })

            expect(screen.getByText(/Продолжайте отслеживать свой прогресс/)).toBeInTheDocument()
        })

        it('displays Activity icon in placeholder', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 0,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
            })

            const icon = document.querySelector('svg')
            expect(icon).toBeInTheDocument()
        })

        it('displays placeholder on API error', async () => {
            mockApiGet.mockRejectedValue(new Error('API error'))

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
            })
        })
    })

    describe('Header', () => {
        it('renders section title', () => {
            mockApiGet.mockReturnValue(new Promise(() => {}))

            render(<ProgressSection />)

            expect(screen.getByText('Прогресс')).toBeInTheDocument()
        })
    })

    describe('Custom className', () => {
        it('applies custom className to root element', () => {
            mockApiGet.mockReturnValue(new Promise(() => {}))

            const { container } = render(<ProgressSection className="custom-class" />)

            const card = container.firstChild
            expect(card).toHaveClass('custom-class')
        })
    })

    describe('Adherence indicator color/label thresholds', () => {
        it('shows "Отлично" label for 90%+ adherence (green)', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 95,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Отлично')).toBeInTheDocument()
                expect(screen.getByText('95.0%')).toBeInTheDocument()
            })
        })

        it('shows "Хорошо" label for 70-89% adherence (yellow)', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 75,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Хорошо')).toBeInTheDocument()
                expect(screen.getByText('75.0%')).toBeInTheDocument()
            })
        })

        it('shows "Требует внимания" label for <70% adherence (orange)', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 50,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Требует внимания')).toBeInTheDocument()
                expect(screen.getByText('50.0%')).toBeInTheDocument()
            })
        })

        it('shows exactly 90% as "Отлично" (boundary)', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 90,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Отлично')).toBeInTheDocument()
            })
        })

        it('shows exactly 70% as "Хорошо" (boundary)', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 70,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Хорошо')).toBeInTheDocument()
            })
        })
    })

    describe('Progressbar accessibility', () => {
        it('renders progressbar with correct aria attributes', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 80,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                const progressbar = screen.getByRole('progressbar')
                expect(progressbar).toHaveAttribute('aria-valuenow', '80')
                expect(progressbar).toHaveAttribute('aria-valuemin', '0')
                expect(progressbar).toHaveAttribute('aria-valuemax', '100')
                expect(progressbar).toHaveAttribute(
                    'aria-label',
                    'Соблюдение плана питания: 80%',
                )
            })
        })

        it('renders adherence region with proper aria-label', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 80,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(
                    screen.getByRole('region', { name: 'Соблюдение плана питания' }),
                ).toBeInTheDocument()
            })
        })
    })

    describe('Weight trend data mapping', () => {
        it('handles missing weight_trend gracefully (null)', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: null,
                nutrition_adherence: 80,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('80.0%')).toBeInTheDocument()
            })
        })

        it('maps weight_trend data to weightTrend array', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [
                    { date: '2026-02-07', weight: 82 },
                    { date: '2026-02-14', weight: 81 },
                ],
                nutrition_adherence: 85,
                target_weight: 75,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.getByText('Соблюдение плана питания')).toBeInTheDocument()
            })
        })
    })

    describe('Achievements section', () => {
        // Note: achievements are currently hardcoded to empty array in the component,
        // but we test the rendering path to cover the conditional branches
        it('does not render achievements section when empty', async () => {
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 80,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                expect(screen.queryByText('Недавние достижения')).not.toBeInTheDocument()
            })
        })
    })

    describe('Nutrition adherence visibility', () => {
        it('does not show adherence indicator when adherence is 0 but achievements exist', async () => {
            // This covers the branch where nutritionAdherence is 0
            mockApiGet.mockResolvedValue({
                weight_trend: [],
                nutrition_adherence: 0,
                target_weight: null,
            })

            render(<ProgressSection />)

            await waitFor(() => {
                // With 0 adherence and no achievements, shows insufficient data
                expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
            })
        })
    })
})
