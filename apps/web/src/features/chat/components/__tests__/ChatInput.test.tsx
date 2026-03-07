import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from '../ChatInput'

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    Paperclip: (props: Record<string, unknown>) => <svg data-testid="paperclip-icon" {...props} />,
    ArrowUp: (props: Record<string, unknown>) => <svg data-testid="arrow-up-icon" {...props} />,
    X: (props: Record<string, unknown>) => <svg data-testid="x-icon" {...props} />,
}))

describe('ChatInput', () => {
    const defaultProps = {
        onSendMessage: jest.fn().mockResolvedValue(undefined),
        onSendFile: jest.fn().mockResolvedValue(undefined),
        onTyping: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders text input and buttons', () => {
        render(<ChatInput {...defaultProps} />)

        expect(screen.getByPlaceholderText('Сообщение...')).toBeInTheDocument()
        expect(screen.getByLabelText('Отправить')).toBeInTheDocument()
        expect(screen.getByLabelText('Прикрепить файл')).toBeInTheDocument()
    })

    it('sends text message on button click', async () => {
        render(<ChatInput {...defaultProps} />)

        const input = screen.getByPlaceholderText('Сообщение...')
        fireEvent.change(input, { target: { value: 'Hello' } })
        fireEvent.click(screen.getByLabelText('Отправить'))

        await waitFor(() => {
            expect(defaultProps.onSendMessage).toHaveBeenCalledWith('Hello')
        })
    })

    it('sends text message on Enter key', async () => {
        render(<ChatInput {...defaultProps} />)

        const input = screen.getByPlaceholderText('Сообщение...')
        fireEvent.change(input, { target: { value: 'Hi there' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        await waitFor(() => {
            expect(defaultProps.onSendMessage).toHaveBeenCalledWith('Hi there')
        })
    })

    it('does not send empty text', () => {
        render(<ChatInput {...defaultProps} />)

        fireEvent.click(screen.getByLabelText('Отправить'))

        expect(defaultProps.onSendMessage).not.toHaveBeenCalled()
    })

    it('shows file preview when file is selected', async () => {
        render(<ChatInput {...defaultProps} />)

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['content'], 'test-doc.pdf', { type: 'application/pdf' })

        fireEvent.change(fileInput, { target: { files: [file] } })

        expect(screen.getByText('test-doc.pdf')).toBeInTheDocument()
    })

    it('cancels file selection', async () => {
        render(<ChatInput {...defaultProps} />)

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })

        fireEvent.change(fileInput, { target: { files: [file] } })
        expect(screen.getByText('test.pdf')).toBeInTheDocument()

        fireEvent.click(screen.getByLabelText('Отменить выбор файла'))
        expect(screen.queryByText('test.pdf')).not.toBeInTheDocument()
    })

    it('sends file when send button clicked with selected file', async () => {
        render(<ChatInput {...defaultProps} />)

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['content'], 'photo.png', { type: 'image/png' })

        fireEvent.change(fileInput, { target: { files: [file] } })
        fireEvent.click(screen.getByLabelText('Отправить'))

        await waitFor(() => {
            expect(defaultProps.onSendFile).toHaveBeenCalledWith(file)
        })
    })

    it('calls onTyping when typing in the input', () => {
        render(<ChatInput {...defaultProps} />)

        const input = screen.getByPlaceholderText('Сообщение...')
        fireEvent.change(input, { target: { value: 'h' } })

        expect(defaultProps.onTyping).toHaveBeenCalled()
    })
})
