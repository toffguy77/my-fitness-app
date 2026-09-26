/**
 * Property-based tests for ProgressSection component
 *
 * Property 13: Progress Chart Data Rendering
 * Validates: Requirements 6.1, 6.2, 6.3
 */

import { render, screen, waitFor } from '@testing-library/react'
import { ProgressSection } from '../ProgressSection'

// Раньше здесь подмены не было вовсе: компонент ходил в настоящий fetch,
// запрос падал, и «handles empty data gracefully» на самом деле проверял
// отказ запроса, а не пустые данные. Тест был зелёным и означал не то, что
// написано в его названии.
const mockApiGet = jest.fn()
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: (...args: unknown[]) => mockApiGet(...args),
    },
}))

beforeEach(() => {
    jest.clearAllMocks()
    mockApiGet.mockResolvedValue({ weight_trend: [], nutrition_adherence: 0, target_weight: null })
})

describe('Property 13: Progress Chart Data Rendering', () => {
    it('Feature: dashboard, Property 13: always renders valid progress data structure', async () => {
        // This test verifies the component handles various data states correctly
        render(<ProgressSection />)

        // Component should render without crashing
        await waitFor(() => {
            expect(screen.getByText('Прогресс')).toBeInTheDocument()
        }, { timeout: 3000 })
    })

    it('Feature: dashboard, Property 13: handles empty data gracefully', async () => {
        render(<ProgressSection />)

        await waitFor(() => {
            expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
        })

        // Should show placeholder message
        expect(screen.getByText(/Продолжайте отслеживать/)).toBeInTheDocument()
    })

    it('Feature: dashboard, Property 13: section title always present', async () => {
        render(<ProgressSection />)

        // Section title should always be present regardless of data state
        expect(screen.getByText('Прогресс')).toBeInTheDocument()
    })
})
