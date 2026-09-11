import { render, screen } from '@testing-library/react'

import { SegmentLoading } from '../SegmentLoading'

describe('SegmentLoading', () => {
    it('says what is being waited for', () => {
        render(<SegmentLoading label="Загружаем дневник..." />)

        expect(screen.getByText('Загружаем дневник...')).toBeInTheDocument()
    })

    it('announces itself to a screen reader', () => {
        // Without this the screen simply goes quiet: somebody not looking at
        // the spinner has no way to know anything is happening.
        render(<SegmentLoading label="Загружаем трекер..." />)

        const status = screen.getByRole('status')
        expect(status).toHaveAttribute('aria-live', 'polite')
    })
})
