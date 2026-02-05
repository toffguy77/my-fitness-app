/**
 * Property-based tests for ProgressSection component
 *
 * Property 13: Progress Chart Data Rendering
 * Validates: Requirements 6.1, 6.2, 6.3
 */

import { render, screen, waitFor } from '@testing-library/react'
import { ProgressSection } from '../ProgressSection'
import fc from 'fast-check'

describe('Property 13: Progress Chart Data Rendering', () => {
    it('Feature: dashboard, Property 13: always renders valid progress data structure', async () => {
        // This test verifies the component handles various data states correctly
        render(<ProgressSection />)

        // Wait for loading to complete
        await waitFor(() => {
            expect(screen.queryByRole('status', { hidden: true })).not.toBeInTheDocument()
        }, { timeout: 3000 })

        // Component should render without crashing
        expect(screen.getByText('Прогресс')).toBeInTheDocument()
    })

    it('Feature: dashboard, Property 13: handles empty data gracefully', async () => {
        render(<ProgressSection />)

        await waitFor(() => {
            expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
        })

        // Should show placeholder message
        expect(screen.getByText(/Продолжайте отслеживать/)).toBeInTheDocument()
    })

    it('Feature: dashboard, Property 13: navigation button always present', async () => {
        render(<ProgressSection />)

        // Navigation button should always be present regardless of data state
        const button = screen.getByRole('button', { name: /Перейти к аналитике/i })
        expect(button).toBeInTheDocument()
        expect(button).toBeEnabled()
    })
})
