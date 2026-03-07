import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnitSelector } from '../UnitSelector'

describe('UnitSelector', () => {
    const defaultProps = {
        value: 'metric' as const,
        onChange: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders the section heading', () => {
        render(<UnitSelector {...defaultProps} />)

        expect(screen.getByText('Единицы измерения')).toBeInTheDocument()
    })

    it('renders both unit options', () => {
        render(<UnitSelector {...defaultProps} />)

        expect(screen.getByText('Кг, см')).toBeInTheDocument()
        expect(screen.getByText('Фунты, дюймы')).toBeInTheDocument()
    })

    it('marks metric as pressed when value is "metric"', () => {
        render(<UnitSelector {...defaultProps} value="metric" />)

        expect(screen.getByText('Кг, см').closest('button')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByText('Фунты, дюймы').closest('button')).toHaveAttribute('aria-pressed', 'false')
    })

    it('marks imperial as pressed when value is "imperial"', () => {
        render(<UnitSelector {...defaultProps} value="imperial" />)

        expect(screen.getByText('Кг, см').closest('button')).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByText('Фунты, дюймы').closest('button')).toHaveAttribute('aria-pressed', 'true')
    })

    it('calls onChange with "imperial" when imperial option is clicked', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<UnitSelector value="metric" onChange={onChange} />)

        await user.click(screen.getByText('Фунты, дюймы'))

        expect(onChange).toHaveBeenCalledWith('imperial')
    })

    it('calls onChange with "metric" when metric option is clicked', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<UnitSelector value="imperial" onChange={onChange} />)

        await user.click(screen.getByText('Кг, см'))

        expect(onChange).toHaveBeenCalledWith('metric')
    })

    it('disables both buttons when disabled prop is true', () => {
        render(<UnitSelector {...defaultProps} disabled />)

        const buttons = screen.getAllByRole('button')
        buttons.forEach((button) => {
            expect(button).toBeDisabled()
        })
    })

    it('does not call onChange when disabled', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<UnitSelector value="metric" onChange={onChange} disabled />)

        await user.click(screen.getByText('Фунты, дюймы'))

        expect(onChange).not.toHaveBeenCalled()
    })
})
