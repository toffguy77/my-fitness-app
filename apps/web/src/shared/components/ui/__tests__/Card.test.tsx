import { render, screen } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../Card'

describe('Card components', () => {
    describe('Card', () => {
        it('renders children', () => {
            render(<Card>Card content</Card>)
            expect(screen.getByText('Card content')).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(<Card className="custom-class">Content</Card>)
            expect(container.firstChild).toHaveClass('custom-class')
        })
    })

    describe('CardHeader', () => {
        it('renders children', () => {
            render(<CardHeader>Header content</CardHeader>)
            expect(screen.getByText('Header content')).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(<CardHeader className="custom-class">Content</CardHeader>)
            expect(container.firstChild).toHaveClass('custom-class')
        })
    })

    describe('CardTitle', () => {
        it('renders children', () => {
            render(<CardTitle>Title</CardTitle>)
            expect(screen.getByText('Title')).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(<CardTitle className="custom-class">Title</CardTitle>)
            expect(container.firstChild).toHaveClass('custom-class')
        })
    })

    describe('CardDescription', () => {
        it('renders children', () => {
            render(<CardDescription>Description</CardDescription>)
            expect(screen.getByText('Description')).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(
                <CardDescription className="custom-class">Description</CardDescription>
            )
            expect(container.firstChild).toHaveClass('custom-class')
        })
    })

    describe('CardContent', () => {
        it('renders children', () => {
            render(<CardContent>Content</CardContent>)
            expect(screen.getByText('Content')).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(<CardContent className="custom-class">Content</CardContent>)
            expect(container.firstChild).toHaveClass('custom-class')
        })
    })

    describe('CardFooter', () => {
        it('renders children', () => {
            render(<CardFooter>Footer</CardFooter>)
            expect(screen.getByText('Footer')).toBeInTheDocument()
        })

        it('applies custom className', () => {
            const { container } = render(<CardFooter className="custom-class">Footer</CardFooter>)
            expect(container.firstChild).toHaveClass('custom-class')
        })
    })

    describe('Complete Card', () => {
        it('renders all card components together', () => {
            render(
                <Card>
                    <CardHeader>
                        <CardTitle>Test Title</CardTitle>
                        <CardDescription>Test Description</CardDescription>
                    </CardHeader>
                    <CardContent>Test Content</CardContent>
                    <CardFooter>Test Footer</CardFooter>
                </Card>
            )

            expect(screen.getByText('Test Title')).toBeInTheDocument()
            expect(screen.getByText('Test Description')).toBeInTheDocument()
            expect(screen.getByText('Test Content')).toBeInTheDocument()
            expect(screen.getByText('Test Footer')).toBeInTheDocument()
        })
    })
})
