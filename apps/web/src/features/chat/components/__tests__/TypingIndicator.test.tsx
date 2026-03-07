import { render, screen } from '@testing-library/react'
import { TypingIndicator } from '../TypingIndicator'

describe('TypingIndicator', () => {
    it('renders nothing when isTyping is false', () => {
        const { container } = render(<TypingIndicator isTyping={false} />)
        expect(container.firstChild).toBeNull()
    })

    it('renders typing text when isTyping is true', () => {
        render(<TypingIndicator isTyping={true} />)
        expect(screen.getByText('печатает')).toBeInTheDocument()
    })

    it('renders three animated dots', () => {
        render(<TypingIndicator isTyping={true} />)
        const dots = screen.getAllByText('.')
        expect(dots).toHaveLength(3)
    })

    it('applies bounce animation with staggered delays', () => {
        render(<TypingIndicator isTyping={true} />)
        const dots = screen.getAllByText('.')
        expect(dots[0]).toHaveStyle({ animationDelay: '0ms' })
        expect(dots[1]).toHaveStyle({ animationDelay: '150ms' })
        expect(dots[2]).toHaveStyle({ animationDelay: '300ms' })
    })
})
