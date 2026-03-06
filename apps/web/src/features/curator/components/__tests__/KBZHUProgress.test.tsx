import { render, screen } from '@testing-library/react'
import { KBZHUProgress } from '../KBZHUProgress'

describe('KBZHUProgress', () => {
    it('displays label, value, target, and percentage', () => {
        render(<KBZHUProgress label="Ккал" value={1500} target={2000} />)

        expect(screen.getByText('Ккал')).toBeInTheDocument()
        expect(screen.getByText(/1500 \/ 2000/)).toBeInTheDocument()
        expect(screen.getByText('(75%)')).toBeInTheDocument()
    })

    it('calculates progress bar width as value/target * 100', () => {
        const { container } = render(<KBZHUProgress label="Белки" value={80} target={100} />)

        const progressBar = container.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '80%' })
    })

    it('clamps progress bar width at 100%', () => {
        const { container } = render(<KBZHUProgress label="Ккал" value={2500} target={2000} />)

        const progressBar = container.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '100%' })
    })

    it('shows green color for 80-120% range', () => {
        const { container } = render(<KBZHUProgress label="Ккал" value={1900} target={2000} />)

        const bar = container.querySelector('[style*="width"]')
        expect(bar?.className).toContain('bg-green-500')
    })

    it('shows yellow color for 50-80% range', () => {
        const { container } = render(<KBZHUProgress label="Ккал" value={1200} target={2000} />)

        const bar = container.querySelector('[style*="width"]')
        expect(bar?.className).toContain('bg-yellow-500')
    })

    it('shows yellow color for 120-150% range', () => {
        const { container } = render(<KBZHUProgress label="Ккал" value={2600} target={2000} />)

        const bar = container.querySelector('[style*="width"]')
        expect(bar?.className).toContain('bg-yellow-500')
    })

    it('shows red color for below 50%', () => {
        const { container } = render(<KBZHUProgress label="Ккал" value={500} target={2000} />)

        const bar = container.querySelector('[style*="width"]')
        expect(bar?.className).toContain('bg-red-500')
    })

    it('shows red color for above 150%', () => {
        const { container } = render(<KBZHUProgress label="Ккал" value={3100} target={2000} />)

        const bar = container.querySelector('[style*="width"]')
        expect(bar?.className).toContain('bg-red-500')
    })

    it('handles zero target gracefully (0% width)', () => {
        const { container } = render(<KBZHUProgress label="Ккал" value={100} target={0} />)

        expect(screen.getByText('(0%)')).toBeInTheDocument()
        const progressBar = container.querySelector('[style*="width"]')
        expect(progressBar).toHaveStyle({ width: '0%' })
    })

    it('rounds displayed values', () => {
        render(<KBZHUProgress label="Белки" value={99.7} target={120.3} />)

        expect(screen.getByText(/100 \/ 120/)).toBeInTheDocument()
    })

    it('applies compact styling when compact=true', () => {
        const { container } = render(<KBZHUProgress label="Ккал" value={100} target={200} compact />)

        const barTrack = container.querySelector('.h-1\\.5')
        expect(barTrack).toBeInTheDocument()
    })
})
