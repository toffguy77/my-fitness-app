import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthScreen } from '../components/AuthScreen'
import { apiClient } from '@/shared/utils/api-client'
import { ApiError } from '@/shared/errors/apiErrors'
import toast from 'react-hot-toast'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { post: jest.fn(), setToken: jest.fn() },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
}))

// The client attaches this shape to every failed response; the error mapping
// reads it, so a test that omits it would pass while the app showed the wrong
// message.
function rejectionFor(status: number, data: unknown = {}) {
    const error = new ApiError(status, data)
    ;(error as unknown as { response: unknown }).response = { status, data }
    return error
}

async function signIn(email: string, password: string) {
    render(<AuthScreen />)
    await userEvent.type(screen.getByLabelText('Email address'), email)
    await userEvent.type(screen.getByLabelText('Password'), password)
    await userEvent.click(screen.getByLabelText('Log in to your account'))
}

describe('Signing in', () => {
    beforeEach(() => jest.clearAllMocks())

    // A wrong password must say so. Telling the user the service is unavailable
    // sends them to support for a problem they can fix themselves.
    it('names the real problem when the credentials are wrong', async () => {
        ;(apiClient.post as jest.Mock).mockRejectedValue(rejectionFor(401))

        await signIn('wrong@example.com', 'wrongpassword')

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Неверный логин или пароль'))
    })

    // An account created before the complexity policy still has a valid
    // password. Judging it by today's rules would refuse to send the request at
    // all, telling its owner their correct password is wrong.
    it('sends a password that would fail today’s complexity rules', async () => {
        ;(apiClient.post as jest.Mock).mockRejectedValue(rejectionFor(401))

        await signIn('legacy@example.com', 'oldpass')

        await waitFor(() => expect(apiClient.post).toHaveBeenCalled())
        const [, body] = (apiClient.post as jest.Mock).mock.calls[0]
        expect(body).toMatchObject({ email: 'legacy@example.com', password: 'oldpass' })
    })

    it('refuses to send an empty password', async () => {
        render(<AuthScreen />)
        await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com')
        await userEvent.click(screen.getByLabelText('Log in to your account'))

        expect(apiClient.post).not.toHaveBeenCalled()
    })

    it('reports an unavailable service as such', async () => {
        ;(apiClient.post as jest.Mock).mockRejectedValue(rejectionFor(503))

        await signIn('user@example.com', 'Password123!')

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Сервис временно недоступен'))
    })

    // The message used to appear on blur — that is, on the mousedown of the
    // click meant to submit — inserting a line above the button and moving it
    // out from under the pointer.
    it('does not judge the password against the complexity rules', async () => {
        render(<AuthScreen />)

        await userEvent.type(screen.getByLabelText('Password'), 'oldpass')
        await userEvent.tab()

        expect(screen.queryByText(/заглавную букву/)).not.toBeInTheDocument()
    })

    // Registration is where the rules apply, and where saying them early helps.
    it('still explains the rules while registering', async () => {
        render(<AuthScreen />)
        await userEvent.click(screen.getByLabelText('Register a new account'))

        await userEvent.type(screen.getByLabelText('Password'), 'oldpass')
        await userEvent.tab()

        expect(await screen.findByText(/заглавную букву/)).toBeInTheDocument()
    })
})
