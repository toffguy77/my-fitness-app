import { render, screen } from '@testing-library/react'
import { AlertBadge } from '../AlertBadge'

describe('AlertBadge', () => {
    it('renders message text', () => {
        render(<AlertBadge level="red" message="Пропуск приёма пищи" />)

        expect(screen.getByText('Пропуск приёма пищи')).toBeInTheDocument()
    })

    it('applies red styling for red level', () => {
        render(<AlertBadge level="red" message="alert" />)

        const badge = screen.getByText('alert')
        expect(badge.className).toContain('bg-danger-soft')
        expect(badge.className).toContain('text-danger-fg')
    })

    it('applies yellow styling for yellow level', () => {
        render(<AlertBadge level="yellow" message="warning" />)

        const badge = screen.getByText('warning')
        expect(badge.className).toContain('bg-warning-soft')
        expect(badge.className).toContain('text-warning-fg')
    })

    it('applies green styling for green level', () => {
        render(<AlertBadge level="green" message="ok" />)

        const badge = screen.getByText('ok')
        expect(badge.className).toContain('bg-success-soft')
        expect(badge.className).toContain('text-success-fg')
    })

    it('renders as a span element', () => {
        render(<AlertBadge level="red" message="test" />)

        const badge = screen.getByText('test')
        expect(badge.tagName).toBe('SPAN')
    })

    it('has rounded-full class', () => {
        render(<AlertBadge level="green" message="ok" />)

        const badge = screen.getByText('ok')
        expect(badge.className).toContain('rounded-full')
    })
})
