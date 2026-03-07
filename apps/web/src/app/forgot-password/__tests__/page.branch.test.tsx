import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ForgotPasswordPage from '../page'
import toast from 'react-hot-toast'

/**
 * Additional branch coverage for ForgotPasswordPage.
 * Covers: non-Error thrown (line 65), email trimming behavior.
 */

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}))

describe('ForgotPasswordPage - branch coverage', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch = jest.fn()
    })

    // Branch: non-Error object thrown (line 65 - err instanceof Error is false)
    it('shows generic error when a non-Error is thrown', async () => {
        ;(global.fetch as jest.Mock).mockRejectedValue('string error')

        render(<ForgotPasswordPage />)
        const emailInput = screen.getByLabelText('Email адрес')
        const form = screen.getByRole('button', { name: /Отправить инструкции/i }).closest('form')!

        await user.type(emailInput, 'test@example.com')
        await user.click(screen.getByRole('button', { name: /Отправить инструкции/i }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Произошла ошибка')
        })
    })

    // Branch: email trimming removes whitespace (line 27-28)
    it('trims whitespace from email before validation', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ message: 'OK' }),
        })

        render(<ForgotPasswordPage />)
        const emailInput = screen.getByLabelText('Email адрес')

        await user.type(emailInput, '  test@example.com  ')
        await user.click(screen.getByRole('button', { name: /Отправить инструкции/i }))

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: JSON.stringify({ email: 'test@example.com' }),
                })
            )
        })
    })
})
