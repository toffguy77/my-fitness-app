import { render, screen, fireEvent } from '@testing-library/react'
import { ArticleCta } from '../ArticleCta'
import { track } from '@/shared/analytics'

jest.mock('@/shared/analytics', () => ({
    track: jest.fn(),
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
}))

const mockTrack = track as jest.MockedFunction<typeof track>

describe('ArticleCta', () => {
    beforeEach(() => mockTrack.mockClear())

    it('leads to the calculator and to the pricing page', () => {
        render(<ArticleCta />)

        expect(screen.getByRole('link', { name: 'Рассчитать мою норму' })).toHaveAttribute(
            'href',
            '/kalkulyator-kbzhu',
        )
        expect(screen.getByRole('link', { name: 'Тарифы' })).toHaveAttribute('href', '/pricing')
    })

    it('records which way the reader went', () => {
        render(<ArticleCta />)

        fireEvent.click(screen.getByRole('link', { name: 'Рассчитать мою норму' }))
        expect(mockTrack).toHaveBeenLastCalledWith('article_cta_clicked', { target: 'calculator' })

        fireEvent.click(screen.getByRole('link', { name: 'Тарифы' }))
        expect(mockTrack).toHaveBeenLastCalledWith('article_cta_clicked', { target: 'pricing' })
    })
})
