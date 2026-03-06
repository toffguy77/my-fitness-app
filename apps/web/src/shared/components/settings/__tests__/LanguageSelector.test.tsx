import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageSelector } from '../LanguageSelector'

describe('LanguageSelector', () => {
    const defaultProps = {
        value: 'ru' as const,
        onChange: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders the section heading', () => {
        render(<LanguageSelector {...defaultProps} />)

        expect(screen.getByText('Язык интерфейса')).toBeInTheDocument()
    })

    it('renders both language options', () => {
        render(<LanguageSelector {...defaultProps} />)

        expect(screen.getByText('Русский')).toBeInTheDocument()
        expect(screen.getByText('English')).toBeInTheDocument()
    })

    it('marks the selected language as pressed', () => {
        render(<LanguageSelector {...defaultProps} value="ru" />)

        expect(screen.getByText('Русский').closest('button')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByText('English').closest('button')).toHaveAttribute('aria-pressed', 'false')
    })

    it('marks English as pressed when value is "en"', () => {
        render(<LanguageSelector {...defaultProps} value="en" />)

        expect(screen.getByText('Русский').closest('button')).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByText('English').closest('button')).toHaveAttribute('aria-pressed', 'true')
    })

    it('calls onChange with "en" when English is clicked', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<LanguageSelector value="ru" onChange={onChange} />)

        await user.click(screen.getByText('English'))

        expect(onChange).toHaveBeenCalledWith('en')
    })

    it('calls onChange with "ru" when Русский is clicked', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<LanguageSelector value="en" onChange={onChange} />)

        await user.click(screen.getByText('Русский'))

        expect(onChange).toHaveBeenCalledWith('ru')
    })

    it('disables both buttons when disabled prop is true', () => {
        render(<LanguageSelector {...defaultProps} disabled />)

        const buttons = screen.getAllByRole('button')
        buttons.forEach((button) => {
            expect(button).toBeDisabled()
        })
    })

    it('does not call onChange when disabled', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<LanguageSelector value="ru" onChange={onChange} disabled />)

        await user.click(screen.getByText('English'))

        expect(onChange).not.toHaveBeenCalled()
    })
})
