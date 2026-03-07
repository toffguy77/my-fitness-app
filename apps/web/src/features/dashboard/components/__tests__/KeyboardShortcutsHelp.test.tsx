import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp'

describe('KeyboardShortcutsHelp', () => {
    it('renders the keyboard button when closed', () => {
        render(<KeyboardShortcutsHelp />)
        expect(screen.getByLabelText('Показать горячие клавиши')).toBeInTheDocument()
    })

    it('does not show dialog initially', () => {
        render(<KeyboardShortcutsHelp />)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens dialog when button is clicked', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('Горячие клавиши')).toBeInTheDocument()
    })

    it('opens dialog when "?" key is pressed', () => {
        render(<KeyboardShortcutsHelp />)

        fireEvent.keyDown(document, { key: '?' })

        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not open when "?" is pressed with modifier keys', () => {
        render(<KeyboardShortcutsHelp />)

        fireEvent.keyDown(document, { key: '?', ctrlKey: true })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        fireEvent.keyDown(document, { key: '?', metaKey: true })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        fireEvent.keyDown(document, { key: '?', altKey: true })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not toggle when "?" is pressed in an input element', () => {
        const { container } = render(
            <>
                <input data-testid="test-input" />
                <KeyboardShortcutsHelp />
            </>
        )

        const input = screen.getByTestId('test-input')
        fireEvent.keyDown(input, { key: '?' })

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not toggle when "?" is pressed in a textarea', () => {
        render(
            <>
                <textarea data-testid="test-textarea" />
                <KeyboardShortcutsHelp />
            </>
        )

        const textarea = screen.getByTestId('test-textarea')
        fireEvent.keyDown(textarea, { key: '?' })

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes dialog when close button is clicked', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))
        expect(screen.getByRole('dialog')).toBeInTheDocument()

        await user.click(screen.getByLabelText('Закрыть'))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes dialog when Escape is pressed', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))
        expect(screen.getByRole('dialog')).toBeInTheDocument()

        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes dialog when backdrop is clicked', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))
        expect(screen.getByRole('dialog')).toBeInTheDocument()

        // Click backdrop (aria-hidden div)
        const backdrop = document.querySelector('[aria-hidden="true"]')
        fireEvent.click(backdrop!)

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('toggles dialog with "?" key', () => {
        render(<KeyboardShortcutsHelp />)

        fireEvent.keyDown(document, { key: '?' })
        expect(screen.getByRole('dialog')).toBeInTheDocument()

        fireEvent.keyDown(document, { key: '?' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('displays all shortcut categories', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))

        expect(screen.getByText('Календарь')).toBeInTheDocument()
        expect(screen.getByText('Навигация')).toBeInTheDocument()
        expect(screen.getByText('Ввод данных')).toBeInTheDocument()
        expect(screen.getByText('Справка')).toBeInTheDocument()
    })

    it('displays shortcut descriptions', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))

        expect(screen.getByText('Навигация между днями недели')).toBeInTheDocument()
        expect(screen.getByText('Перейти к понедельнику')).toBeInTheDocument()
        expect(screen.getByText('Перейти к воскресенью')).toBeInTheDocument()
        expect(screen.getByText('Показать/скрыть эту справку')).toBeInTheDocument()
    })

    it('displays keyboard shortcut keys as kbd elements', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))

        const kbdElements = document.querySelectorAll('kbd')
        expect(kbdElements.length).toBeGreaterThan(0)
    })

    it('shows "+" separator for multi-key shortcuts', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))

        // Shift + Tab shortcut should have a "+" separator
        const plusSeparators = screen.getAllByText('+')
        expect(plusSeparators.length).toBeGreaterThan(0)
    })

    it('has proper aria attributes on dialog', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog).toHaveAttribute('aria-labelledby', 'keyboard-shortcuts-title')
    })

    it('shows footer hint text', async () => {
        const user = userEvent.setup()
        render(<KeyboardShortcutsHelp />)

        await user.click(screen.getByLabelText('Показать горячие клавиши'))

        expect(screen.getByText(/чтобы показать или скрыть эту справку/)).toBeInTheDocument()
    })
})
