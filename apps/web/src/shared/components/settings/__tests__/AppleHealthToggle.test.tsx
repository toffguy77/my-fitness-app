import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { AppleHealthToggle } from '../AppleHealthToggle'

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: jest.fn(),
}))

describe('AppleHealthToggle', () => {
    const defaultProps = {
        enabled: false,
        onChange: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders the toggle label', () => {
        render(<AppleHealthToggle {...defaultProps} />)

        expect(screen.getByText('Синхронизация с Apple Здоровье')).toBeInTheDocument()
    })

    it('renders the help link', () => {
        render(<AppleHealthToggle {...defaultProps} />)

        expect(screen.getByText('Как настроить Apple Health')).toBeInTheDocument()
    })

    it('renders the toggle switch with role="switch"', () => {
        render(<AppleHealthToggle {...defaultProps} />)

        const toggle = screen.getByRole('switch')
        expect(toggle).toBeInTheDocument()
    })

    it('reflects enabled state via aria-checked', () => {
        const { rerender } = render(<AppleHealthToggle enabled={false} onChange={jest.fn()} />)

        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')

        rerender(<AppleHealthToggle enabled={true} onChange={jest.fn()} />)

        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    })

    it('has the correct aria-label on the toggle', () => {
        render(<AppleHealthToggle {...defaultProps} />)

        expect(screen.getByRole('switch')).toHaveAttribute(
            'aria-label',
            'Синхронизация с Apple Здоровье'
        )
    })

    it('shows toast and calls onChange(false) when toggling on (not enabled)', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<AppleHealthToggle enabled={false} onChange={onChange} />)

        await user.click(screen.getByRole('switch'))

        expect(onChange).toHaveBeenCalledWith(false)
        expect(toast).toHaveBeenCalledWith('Скоро будет доступно')
    })

    it('calls onChange(false) when toggling off (currently enabled)', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<AppleHealthToggle enabled={true} onChange={onChange} />)

        await user.click(screen.getByRole('switch'))

        expect(onChange).toHaveBeenCalledWith(false)
        expect(toast).not.toHaveBeenCalled()
    })
})
