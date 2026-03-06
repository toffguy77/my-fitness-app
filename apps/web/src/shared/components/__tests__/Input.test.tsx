import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Input } from '../ui/Input'

describe('Input', () => {
    it('renders with placeholder', () => {
        render(<Input placeholder="Enter text" />)
        expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
    })

    it('renders with a label', () => {
        render(<Input label="Email" />)
        expect(screen.getByLabelText('Email')).toBeInTheDocument()
        expect(screen.getByText('Email')).toBeInTheDocument()
    })

    it('generates id from label text', () => {
        render(<Input label="First Name" />)
        const input = screen.getByLabelText('First Name')
        expect(input).toHaveAttribute('id', 'first-name')
    })

    it('uses provided id over generated one', () => {
        render(<Input label="Email" id="custom-id" />)
        const input = screen.getByLabelText('Email')
        expect(input).toHaveAttribute('id', 'custom-id')
    })

    it('handles value changes via user typing', async () => {
        const user = userEvent.setup()
        const handleChange = jest.fn()
        render(<Input aria-label="test" onChange={handleChange} />)

        await user.type(screen.getByRole('textbox'), 'hello')
        expect(handleChange).toHaveBeenCalledTimes(5)
    })

    it('shows error message and sets aria-invalid', () => {
        render(<Input label="Name" error="Required field" />)

        expect(screen.getByRole('alert')).toHaveTextContent('Required field')
        expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    })

    it('applies error border styles', () => {
        render(<Input label="Name" error="Error" />)
        const input = screen.getByLabelText('Name')
        expect(input.className).toContain('border-red-500')
    })

    it('links error message via aria-describedby', () => {
        render(<Input label="Name" id="name" error="Required" />)
        const input = screen.getByLabelText('Name')
        expect(input).toHaveAttribute('aria-describedby', 'name-error')
    })

    it('shows helper text when no error', () => {
        render(<Input label="Name" helperText="Enter your full name" />)
        expect(screen.getByText('Enter your full name')).toBeInTheDocument()
    })

    it('hides helper text when error is present', () => {
        render(<Input label="Name" helperText="Helper" error="Error" />)
        expect(screen.queryByText('Helper')).not.toBeInTheDocument()
        expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('links helper text via aria-describedby', () => {
        render(<Input label="Name" id="name" helperText="Help text" />)
        const input = screen.getByLabelText('Name')
        expect(input).toHaveAttribute('aria-describedby', 'name-helper')
    })

    it('renders as disabled', () => {
        render(<Input label="Name" disabled />)
        expect(screen.getByLabelText('Name')).toBeDisabled()
    })

    it('sets aria-invalid to false when no error', () => {
        render(<Input label="Name" />)
        expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'false')
    })

    it('sets aria-required when required prop is passed', () => {
        render(<Input label="Name" required />)
        expect(screen.getByLabelText('Name')).toHaveAttribute('aria-required', 'true')
    })

    it('supports different type props', () => {
        const { rerender } = render(<Input label="Password" type="password" />)
        expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')

        rerender(<Input label="Email" type="email" />)
        expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    })

    it('forwards ref to the input element', () => {
        const ref = createRef<HTMLInputElement>()
        render(<Input ref={ref} aria-label="test" />)
        expect(ref.current).toBeInstanceOf(HTMLInputElement)
    })

    it('forwards additional className', () => {
        render(<Input aria-label="test" className="my-input" />)
        const input = screen.getByRole('textbox')
        expect(input.className).toContain('my-input')
    })
})
