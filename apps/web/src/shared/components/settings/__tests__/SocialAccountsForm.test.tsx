import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SocialAccountsForm } from '../SocialAccountsForm'

describe('SocialAccountsForm', () => {
    const defaultProps = {
        telegram: '',
        instagram: '',
        onTelegramChange: jest.fn(),
        onInstagramChange: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders both labels', () => {
        render(<SocialAccountsForm {...defaultProps} />)

        expect(screen.getByText('Ник в Telegram')).toBeInTheDocument()
        expect(screen.getByText('Профиль в Instagram')).toBeInTheDocument()
    })

    it('renders helper text for both fields', () => {
        render(<SocialAccountsForm {...defaultProps} />)

        expect(screen.getByText('Привяжи свой @username')).toBeInTheDocument()
        expect(screen.getByText(/В формате @твойпрофиль/)).toBeInTheDocument()
    })

    it('renders input fields with correct placeholders', () => {
        render(<SocialAccountsForm {...defaultProps} />)

        expect(screen.getByPlaceholderText('@username')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('@profile')).toBeInTheDocument()
    })

    it('displays the current telegram value', () => {
        render(<SocialAccountsForm {...defaultProps} telegram="@myuser" />)

        const telegramInput = screen.getByLabelText('Ник в Telegram')
        expect(telegramInput).toHaveValue('@myuser')
    })

    it('displays the current instagram value', () => {
        render(<SocialAccountsForm {...defaultProps} instagram="@myprofile" />)

        const instagramInput = screen.getByLabelText('Профиль в Instagram')
        expect(instagramInput).toHaveValue('@myprofile')
    })

    it('calls onTelegramChange when typing in the telegram field', async () => {
        const user = userEvent.setup()
        const onTelegramChange = jest.fn()

        render(
            <SocialAccountsForm
                {...defaultProps}
                onTelegramChange={onTelegramChange}
            />
        )

        const telegramInput = screen.getByLabelText('Ник в Telegram')
        await user.type(telegramInput, '@t')

        expect(onTelegramChange).toHaveBeenCalledWith('@')
        expect(onTelegramChange).toHaveBeenCalledWith('t')
        expect(onTelegramChange).toHaveBeenCalledTimes(2)
    })

    it('calls onInstagramChange when typing in the instagram field', async () => {
        const user = userEvent.setup()
        const onInstagramChange = jest.fn()

        render(
            <SocialAccountsForm
                {...defaultProps}
                onInstagramChange={onInstagramChange}
            />
        )

        const instagramInput = screen.getByLabelText('Профиль в Instagram')
        await user.type(instagramInput, '@i')

        expect(onInstagramChange).toHaveBeenCalledWith('@')
        expect(onInstagramChange).toHaveBeenCalledWith('i')
        expect(onInstagramChange).toHaveBeenCalledTimes(2)
    })

    it('associates labels with inputs via htmlFor/id', () => {
        render(<SocialAccountsForm {...defaultProps} />)

        const telegramLabel = screen.getByText('Ник в Telegram')
        const instagramLabel = screen.getByText('Профиль в Instagram')

        expect(telegramLabel).toHaveAttribute('for', 'settings-telegram')
        expect(instagramLabel).toHaveAttribute('for', 'settings-instagram')
    })
})
