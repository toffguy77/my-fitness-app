import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from '../PasswordInput'

describe('PasswordInput', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders with password type by default', () => {
        render(<PasswordInput aria-label="Password" />)

        const input = screen.getByLabelText('Password')
        expect(input).toHaveAttribute('type', 'password')
    })

    it('toggles visibility when the eye button is clicked', async () => {
        const user = userEvent.setup()
        render(<PasswordInput aria-label="Password" />)

        const input = screen.getByLabelText('Password')
        const toggleButton = screen.getByLabelText('Показать пароль')

        expect(input).toHaveAttribute('type', 'password')

        await user.click(toggleButton)

        expect(input).toHaveAttribute('type', 'text')
        expect(screen.getByLabelText('Скрыть пароль')).toBeInTheDocument()
    })

    it('toggles back to password type on second click', async () => {
        const user = userEvent.setup()
        render(<PasswordInput aria-label="Password" />)

        const toggleButton = screen.getByLabelText('Показать пароль')

        await user.click(toggleButton)
        await user.click(screen.getByLabelText('Скрыть пароль'))

        const input = screen.getByLabelText('Password')
        expect(input).toHaveAttribute('type', 'password')
        expect(screen.getByLabelText('Показать пароль')).toBeInTheDocument()
    })

    it('calls onChange when typing', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()

        render(<PasswordInput aria-label="Password" value="" onChange={onChange} />)

        const input = screen.getByLabelText('Password')
        await user.type(input, 'abc')

        expect(onChange).toHaveBeenCalledTimes(3)
    })

    it('displays error message when error prop is provided', () => {
        render(<PasswordInput aria-label="Password" error="Password is required" />)

        expect(screen.getByText('Password is required')).toBeInTheDocument()
    })

    describe('password requirements', () => {
        it('shows requirement list when showRequirements is true', () => {
            render(<PasswordInput aria-label="Password" showRequirements value="" onChange={jest.fn()} />)

            expect(screen.getByText('Пароль должен содержать:')).toBeInTheDocument()
            expect(screen.getByText('Минимум 8 символов')).toBeInTheDocument()
            expect(screen.getByText('Одну заглавную букву')).toBeInTheDocument()
            expect(screen.getByText('Одну строчную букву')).toBeInTheDocument()
            expect(screen.getByText('Одну цифру')).toBeInTheDocument()
            expect(screen.getByText('Один специальный символ')).toBeInTheDocument()
        })

        it('does not show requirements by default', () => {
            render(<PasswordInput aria-label="Password" />)

            expect(screen.queryByText('Пароль должен содержать:')).not.toBeInTheDocument()
        })

        it('updates requirement indicators when typing a strong password', async () => {
            const user = userEvent.setup()
            let currentValue = ''
            const onChange = jest.fn().mockImplementation((e: React.ChangeEvent<HTMLInputElement>) => {
                currentValue = e.target.value
            })

            const { rerender } = render(
                <PasswordInput
                    aria-label="Password"
                    showRequirements
                    value={currentValue}
                    onChange={onChange}
                />
            )

            const input = screen.getByLabelText('Password')
            await user.type(input, 'Abcdef1!')

            // Rerender with the full password to check requirement indicators
            rerender(
                <PasswordInput
                    aria-label="Password"
                    showRequirements
                    value="Abcdef1!"
                    onChange={onChange}
                />
            )

            // Type into the re-rendered input to trigger requirement validation
            await user.clear(input)
            await user.type(input, 'Abcdef1!')

            // All requirement icons should show as met
            const metIcons = screen.getAllByLabelText('Требование выполнено')
            expect(metIcons.length).toBe(5)
        })
    })

    describe('strength indicator', () => {
        it('does not show strength indicator by default', () => {
            render(<PasswordInput aria-label="Password" />)

            expect(screen.queryByText(/Надежность пароля/)).not.toBeInTheDocument()
        })

        it('shows weak strength for a short password', () => {
            render(
                <PasswordInput
                    aria-label="Password"
                    showStrengthIndicator
                    value="ab"
                    onChange={jest.fn()}
                />
            )

            expect(screen.getByText('Слабый')).toBeInTheDocument()
        })

        it('shows medium strength for a moderate password', () => {
            render(
                <PasswordInput
                    aria-label="Password"
                    showStrengthIndicator
                    value="Abcdefgh"
                    onChange={jest.fn()}
                />
            )

            expect(screen.getByText('Средний')).toBeInTheDocument()
        })

        it('shows strong strength for a complete password', () => {
            render(
                <PasswordInput
                    aria-label="Password"
                    showStrengthIndicator
                    value="Abcdef1!"
                    onChange={jest.fn()}
                />
            )

            expect(screen.getByText('Сильный')).toBeInTheDocument()
        })

        it('does not show strength label for empty password', () => {
            render(
                <PasswordInput
                    aria-label="Password"
                    showStrengthIndicator
                    value=""
                    onChange={jest.fn()}
                />
            )

            expect(screen.queryByText(/Надежность пароля/)).not.toBeInTheDocument()
        })
    })
})
