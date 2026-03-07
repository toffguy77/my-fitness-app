import { render, screen } from '@testing-library/react'
import { DateSeparator } from '../DateSeparator'

describe('DateSeparator', () => {
    it('renders the date string', () => {
        render(<DateSeparator date="5 января 2025 г." />)
        expect(screen.getByText('5 января 2025 г.')).toBeInTheDocument()
    })

    it('renders divider lines', () => {
        const { container } = render(<DateSeparator date="Today" />)
        const dividers = container.querySelectorAll('.h-px')
        expect(dividers).toHaveLength(2)
    })
})
