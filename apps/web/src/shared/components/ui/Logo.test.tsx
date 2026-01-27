import React from 'react'
import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

describe('Logo', () => {
    it('renders the logo SVG', () => {
        const { container } = render(<Logo />)
        const svg = container.querySelector('svg')
        expect(svg).toBeInTheDocument()
    })

    it('renders with default dimensions', () => {
        const { container } = render(<Logo />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('width', '200')
        expect(svg).toHaveAttribute('height', '60')
    })

    it('renders with custom width and height', () => {
        const { container } = render(<Logo width={300} height={90} />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('width', '300')
        expect(svg).toHaveAttribute('height', '90')
    })

    it('applies default className', () => {
        const { container } = render(<Logo />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveClass('text-gray-900')
    })

    it('applies custom className', () => {
        const { container } = render(<Logo className="text-blue-500" />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveClass('text-blue-500')
        expect(svg).not.toHaveClass('text-gray-900')
    })

    it('renders the BURCEV text', () => {
        const { container } = render(<Logo />)
        const text = container.querySelector('text')
        expect(text).toBeInTheDocument()
        expect(text).toHaveTextContent('BURCEV')
    })

    it('renders all weight rectangles', () => {
        const { container } = render(<Logo />)
        const rects = container.querySelectorAll('rect')
        expect(rects).toHaveLength(4) // 2 left weights + 2 right weights
    })

    it('maintains correct viewBox for scaling', () => {
        const { container } = render(<Logo width={100} height={30} />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('viewBox', '0 0 200 60')
    })

    it('uses currentColor for fill to support theming', () => {
        const { container } = render(<Logo />)
        const text = container.querySelector('text')
        const rects = container.querySelectorAll('rect')

        expect(text).toHaveAttribute('fill', 'currentColor')
        rects.forEach(rect => {
            expect(rect).toHaveAttribute('fill', 'currentColor')
        })
    })

    it('renders with zero dimensions', () => {
        const { container } = render(<Logo width={0} height={0} />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('width', '0')
        expect(svg).toHaveAttribute('height', '0')
    })

    it('renders with very large dimensions', () => {
        const { container } = render(<Logo width={1000} height={300} />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('width', '1000')
        expect(svg).toHaveAttribute('height', '300')
    })
})
