import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'

describe('Card', () => {
    it('renders children', () => {
        render(<Card>Card content</Card>)
        expect(screen.getByText('Card content')).toBeInTheDocument()
    })

    it('applies default variant classes', () => {
        render(<Card data-testid="card">Default</Card>)
        const card = screen.getByTestId('card')
        expect(card.className).toContain('bg-white')
        expect(card.className).toContain('rounded-lg')
    })

    it('applies bordered variant classes', () => {
        render(<Card variant="bordered" data-testid="card">Bordered</Card>)
        const card = screen.getByTestId('card')
        expect(card.className).toContain('border')
        expect(card.className).toContain('border-gray-200')
    })

    it('applies elevated variant classes', () => {
        render(<Card variant="elevated" data-testid="card">Elevated</Card>)
        const card = screen.getByTestId('card')
        expect(card.className).toContain('shadow-lg')
    })

    it('forwards additional className', () => {
        render(<Card className="my-custom" data-testid="card">Custom</Card>)
        expect(screen.getByTestId('card').className).toContain('my-custom')
    })

    it('forwards ref to the div element', () => {
        const ref = createRef<HTMLDivElement>()
        render(<Card ref={ref}>Ref</Card>)
        expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })

    it('passes through native div attributes', () => {
        render(<Card role="region" aria-label="Test card">Accessible</Card>)
        expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Test card')
    })
})

describe('CardHeader', () => {
    it('renders children', () => {
        render(<CardHeader>Header</CardHeader>)
        expect(screen.getByText('Header')).toBeInTheDocument()
    })

    it('forwards className', () => {
        render(<CardHeader className="extra" data-testid="header">H</CardHeader>)
        expect(screen.getByTestId('header').className).toContain('extra')
    })

    it('forwards ref', () => {
        const ref = createRef<HTMLDivElement>()
        render(<CardHeader ref={ref}>Header</CardHeader>)
        expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
})

describe('CardTitle', () => {
    it('renders as an h3 element', () => {
        render(<CardTitle>Title</CardTitle>)
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Title')
    })

    it('applies font styling', () => {
        render(<CardTitle data-testid="title">Title</CardTitle>)
        const title = screen.getByTestId('title')
        expect(title.className).toContain('text-xl')
        expect(title.className).toContain('font-semibold')
    })

    it('forwards ref', () => {
        const ref = createRef<HTMLHeadingElement>()
        render(<CardTitle ref={ref}>Title</CardTitle>)
        expect(ref.current).toBeInstanceOf(HTMLHeadingElement)
    })
})

describe('CardContent', () => {
    it('renders children', () => {
        render(<CardContent>Content here</CardContent>)
        expect(screen.getByText('Content here')).toBeInTheDocument()
    })

    it('forwards className', () => {
        render(<CardContent className="special" data-testid="content">C</CardContent>)
        expect(screen.getByTestId('content').className).toContain('special')
    })

    it('forwards ref', () => {
        const ref = createRef<HTMLDivElement>()
        render(<CardContent ref={ref}>Content</CardContent>)
        expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
})

describe('Card composition', () => {
    it('renders a full card with header, title, and content', () => {
        render(
            <Card data-testid="card">
                <CardHeader>
                    <CardTitle>My Title</CardTitle>
                </CardHeader>
                <CardContent>Body text</CardContent>
            </Card>
        )

        expect(screen.getByTestId('card')).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('My Title')
        expect(screen.getByText('Body text')).toBeInTheDocument()
    })
})
