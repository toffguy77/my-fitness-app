import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthScreen } from '../components/AuthScreen'
import { apiClient } from '@/shared/utils/api-client'

/**
 * MagicLinkForm used to unmount every time the password form was shown, which
 * threw away whatever the visitor had typed and, worse, threw away a
 * completed "sent" confirmation — showing a blank form again invited sending
 * the link a second time. Fixed by keeping MagicLinkForm mounted and toggling
 * it with the `hidden` attribute instead of a conditional unmount; this is
 * the regression test for that, against the real components (nothing here is
 * mocked except the HTTP layer).
 */

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { post: jest.fn(), setToken: jest.fn() },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

beforeEach(() => {
    jest.clearAllMocks()
})

async function checkAllRequiredConsents(user: ReturnType<typeof userEvent.setup>) {
    const checkboxes = screen.getAllByRole('checkbox')
    // Порядок ConsentSection: условия, конфиденциальность, обработка данных, маркетинг.
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])
    await user.click(checkboxes[2])
}

describe('Switching between the magic-link and password forms', () => {
    it('keeps a typed email after a round trip through the password form', async () => {
        const user = userEvent.setup()
        // Круговой переход начинается с формы ссылки — её открывает регистрация.
        render(<AuthScreen initialMode="register" />)

        await user.type(screen.getByLabelText(/почт/i), 'saved@example.com')

        await user.click(screen.getByRole('button', { name: 'Войти по паролю' }))
        expect(screen.getByLabelText('Электронная почта')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Войти по ссылке' }))

        expect(screen.getByLabelText(/почт/i)).toHaveValue('saved@example.com')
    })

    it('keeps showing the confirmation after a round trip, instead of a blank form', async () => {
        ;(apiClient.post as jest.Mock).mockResolvedValueOnce(undefined)
        const user = userEvent.setup()
        // Круговой переход начинается с формы ссылки — её открывает регистрация.
        render(<AuthScreen initialMode="register" />)

        await user.type(screen.getByLabelText(/почт/i), 'sent@example.com')
        await checkAllRequiredConsents(user)
        await user.click(screen.getByRole('button', { name: /ссылк/i }))

        await screen.findByText(/мы отправили на него ссылку/i)

        // Away and back.
        await user.click(screen.getByRole('button', { name: 'Войти по паролю' }))
        await user.click(screen.getByRole('button', { name: 'Войти по ссылке' }))

        // Still the confirmation — not a fresh, empty form that invites
        // sending the same link a second time.
        expect(screen.getByText(/мы отправили на него ссылку/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/почт/i)).not.toBeInTheDocument()
        expect(apiClient.post).toHaveBeenCalledTimes(1)
    })
})
