import { render, screen } from '@testing-library/react'
import { SupportLink } from '../SupportLink'
import { rememberLeadToken, forgetLeadToken } from '@/features/onboarding/api/guest'

describe('SupportLink', () => {
    const originalBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT

    afterEach(() => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = originalBot
        forgetLeadToken()
    })

    // Better no link than one that opens a chat with nobody.
    it('shows nothing when no bot is configured', () => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = ''

        const { container } = render(<SupportLink />)

        expect(container).toBeEmptyDOMElement()
    })

    it('links to the configured bot', () => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = 'burcev_support_bot'

        render(<SupportLink />)

        expect(screen.getByTestId('support-link')).toHaveAttribute(
            'href',
            'https://t.me/burcev_support_bot'
        )
    })

    // Whoever answers should see where the person got stuck rather than asking
    // them to explain it again.
    it('carries the saved attempt into the chat', () => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = 'burcev_support_bot'
        rememberLeadToken('signed.token.value')

        render(<SupportLink />)

        expect(screen.getByTestId('support-link')).toHaveAttribute(
            'href',
            'https://t.me/burcev_support_bot?start=signed.token.value'
        )
    })

    it('opens in a new tab without handing the bot our page', () => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = 'burcev_support_bot'

        render(<SupportLink />)

        const link = screen.getByTestId('support-link')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
})
