import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Button } from '../ui/Button'

describe('Button', () => {
    it('renders with children text', () => {
        render(<Button>Click me</Button>)
        expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
    })

    it('applies primary variant classes by default', () => {
        render(<Button>Primary</Button>)
        const button = screen.getByRole('button')
        expect(button.className).toContain('bg-blue-600')
    })

    it('applies secondary variant classes', () => {
        render(<Button variant="secondary">Secondary</Button>)
        const button = screen.getByRole('button')
        expect(button.className).toContain('bg-gray-200')
    })

    it('applies outline variant classes', () => {
        render(<Button variant="outline">Outline</Button>)
        const button = screen.getByRole('button')
        expect(button.className).toContain('border-gray-300')
    })

    it('applies ghost variant classes', () => {
        render(<Button variant="ghost">Ghost</Button>)
        const button = screen.getByRole('button')
        expect(button.className).toContain('hover:bg-gray-100')
    })

    it('applies danger variant classes', () => {
        render(<Button variant="danger">Delete</Button>)
        const button = screen.getByRole('button')
        expect(button.className).toContain('bg-red-600')
    })

    it('applies small size classes', () => {
        render(<Button size="sm">Small</Button>)
        const button = screen.getByRole('button')
        expect(button.className).toContain('h-8')
        expect(button.className).toContain('text-sm')
    })

    it('applies medium size classes by default', () => {
        render(<Button>Medium</Button>)
        const button = screen.getByRole('button')
        expect(button.className).toContain('h-10')
        expect(button.className).toContain('text-base')
    })

    it('applies large size classes', () => {
        render(<Button size="lg">Large</Button>)
        const button = screen.getByRole('button')
        expect(button.className).toContain('h-12')
        expect(button.className).toContain('text-lg')
    })

    it('fires onClick handler when clicked', async () => {
        const user = userEvent.setup()
        const handleClick = jest.fn()
        render(<Button onClick={handleClick}>Click</Button>)

        await user.click(screen.getByRole('button'))
        expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('does not fire onClick when disabled', async () => {
        const user = userEvent.setup()
        const handleClick = jest.fn()
        render(<Button disabled onClick={handleClick}>Disabled</Button>)

        const button = screen.getByRole('button')
        await user.click(button)
        expect(handleClick).not.toHaveBeenCalled()
        expect(button).toBeDisabled()
    })

    it('sets aria-disabled when disabled', () => {
        render(<Button disabled>Disabled</Button>)
        expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows spinner and disables button when isLoading', () => {
        render(<Button isLoading>Loading</Button>)
        const button = screen.getByRole('button')

        expect(button).toBeDisabled()
        expect(button).toHaveAttribute('aria-busy', 'true')
        expect(button).toHaveAttribute('aria-disabled', 'true')
        expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('does not show spinner when not loading', () => {
        render(<Button>Not loading</Button>)
        const button = screen.getByRole('button')

        expect(button).not.toHaveAttribute('aria-busy', 'true')
        expect(button.querySelector('svg')).not.toBeInTheDocument()
    })

    it('forwards additional className', () => {
        render(<Button className="custom-class">Custom</Button>)
        expect(screen.getByRole('button').className).toContain('custom-class')
    })

    it('forwards ref to the button element', () => {
        const ref = createRef<HTMLButtonElement>()
        render(<Button ref={ref}>Ref</Button>)
        expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    })

    it('passes through native button attributes', () => {
        render(<Button type="submit" data-testid="submit-btn">Submit</Button>)
        const button = screen.getByTestId('submit-btn')
        expect(button).toHaveAttribute('type', 'submit')
    })
})
