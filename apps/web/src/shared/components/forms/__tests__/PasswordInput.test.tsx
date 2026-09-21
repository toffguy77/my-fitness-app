import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from '../PasswordInput'
import { passwordSchema } from '@/features/auth/utils/validation'

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
        // Пункты проверяются по устойчивому id правила, а не по тексту:
        // формулировка правила — она же текст ошибки схемы, и привязка к ней
        // ломала бы этот тест при любой правке словаря, ничего не говоря о
        // поведении.
        const ruleIds = ['min', 'max', 'upper', 'lower', 'digit', 'special']

        const rules = () =>
            ruleIds.map((id) => screen.queryByTestId(`password-rule-${id}`))

        const metIds = () =>
            ruleIds.filter(
                (id) => screen.getByTestId(`password-rule-${id}`).dataset.met === 'true',
            )

        it('hides requirement list when value is empty', () => {
            render(<PasswordInput aria-label="Password" showRequirements value="" onChange={jest.fn()} />)

            expect(screen.queryByTestId('password-checklist')).not.toBeInTheDocument()
        })

        it('shows all six requirement items once user starts typing', () => {
            render(<PasswordInput aria-label="Password" showRequirements value="a" onChange={jest.fn()} />)

            expect(screen.getByTestId('password-checklist')).toBeInTheDocument()
            expect(rules().filter(Boolean)).toHaveLength(6)
        })

        it('does not show requirements by default', () => {
            render(<PasswordInput aria-label="Password" />)

            expect(screen.queryByTestId('password-checklist')).not.toBeInTheDocument()
        })

        it('marks all six rules as met for a fully valid password', () => {
            render(
                <PasswordInput aria-label="Password" showRequirements value="Abcdef1!" onChange={jest.fn()} />
            )

            expect(metIds()).toHaveLength(6)
        })

        it('marks max-length rule as unmet for a 129-char password', () => {
            const longPw = 'Test123!' + 'a'.repeat(121)

            render(
                <PasswordInput aria-label="Password" showRequirements value={longPw} onChange={jest.fn()} />
            )

            expect(metIds()).not.toContain('max')
        })

        it('follows a value it was given rather than one typed into it', () => {
            // Состояние списка раньше жило отдельным useState и обновлялось
            // только в onChange: значение, пришедшее извне — подстановка
            // менеджера паролей, сброс формы, начальное значение — список не
            // трогало, и он показывал требования предыдущего значения.
            const { rerender } = render(
                <PasswordInput aria-label="Password" showRequirements value="a" onChange={jest.fn()} />
            )

            expect(metIds()).toEqual(['max', 'lower'])

            rerender(
                <PasswordInput aria-label="Password" showRequirements value="Abcdef1!" onChange={jest.fn()} />
            )

            expect(metIds()).toHaveLength(6)
        })

        // Список и схема обязаны говорить одно и то же: разойдясь, они дадут
        // форму, где пункт зелёный, а отправка отклонена — или наоборот.
        //
        // Сверяется вывод компонента с тем, что говорит САМА СХЕМА, а не с
        // массивом правил: сверка с массивом была бы тавтологией — компонент
        // из него и рисует, такой тест не упал бы ни при какой правке.
        it.each([
            ['min', 'Ab1!'],
            ['upper', 'abcdef1!'],
            ['lower', 'ABCDEF1!'],
            ['digit', 'Abcdefg!'],
            ['special', 'Abcdefg1'],
        ])('пункт %s повторяет формулировку схемы', (id, violating) => {
            const parsed = passwordSchema.safeParse(violating)
            expect(parsed.success).toBe(false)
            const issues = parsed.success ? [] : parsed.error.issues
            // Пароль подобран так, чтобы нарушал ровно одно правило.
            expect(issues).toHaveLength(1)

            render(
                <PasswordInput aria-label="Password" showRequirements value={violating} onChange={jest.fn()} />
            )

            const item = screen.getByTestId(`password-rule-${id}`)
            expect(item.dataset.met).toBe('false')
            expect(item).toHaveTextContent(issues[0].message)
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
