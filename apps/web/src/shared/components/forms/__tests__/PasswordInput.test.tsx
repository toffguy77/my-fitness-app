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
        it('hides requirement list when value is empty', () => {
            render(<PasswordInput aria-label="Password" showRequirements value="" onChange={jest.fn()} />)

            expect(screen.queryByText('Пароль должен содержать:')).not.toBeInTheDocument()
        })

        it('shows all six requirement items once user starts typing', () => {
            render(<PasswordInput aria-label="Password" showRequirements value="a" onChange={jest.fn()} />)

            expect(screen.getByText('Пароль должен содержать:')).toBeInTheDocument()
            expect(screen.getByText('Минимум 8 символов')).toBeInTheDocument()
            expect(screen.getByText('Не более 128 символов')).toBeInTheDocument()
            expect(screen.getByText('Одну заглавную букву')).toBeInTheDocument()
            expect(screen.getByText('Одну строчную букву')).toBeInTheDocument()
            expect(screen.getByText('Одну цифру')).toBeInTheDocument()
            expect(screen.getByText('Один специальный символ')).toBeInTheDocument()
        })

        it('does not show requirements by default', () => {
            render(<PasswordInput aria-label="Password" />)

            expect(screen.queryByText('Пароль должен содержать:')).not.toBeInTheDocument()
        })

        it('marks all six rules as met for a fully valid password', async () => {
            const user = userEvent.setup()
            const onChange = jest.fn()

            const { rerender } = render(
                <PasswordInput aria-label="Password" showRequirements value="" onChange={onChange} />
            )

            rerender(
                <PasswordInput aria-label="Password" showRequirements value="Abcdef1!" onChange={onChange} />
            )

            const input = screen.getByLabelText('Password')
            await user.type(input, 'x')

            const metIcons = screen.getAllByLabelText('Требование выполнено')
            expect(metIcons.length).toBe(6)
        })

        it('marks max-length rule as unmet for a 129-char password', async () => {
            const user = userEvent.setup()
            const onChange = jest.fn()
            const longPw = 'Test123!' + 'a'.repeat(121)

            const { rerender } = render(
                <PasswordInput aria-label="Password" showRequirements value="" onChange={onChange} />
            )

            rerender(
                <PasswordInput aria-label="Password" showRequirements value={longPw} onChange={onChange} />
            )

            const input = screen.getByLabelText('Password')
            await user.type(input, 'x')

            const unmetIcons = screen.getAllByLabelText('Требование не выполнено')
            expect(unmetIcons.length).toBeGreaterThanOrEqual(1)
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
