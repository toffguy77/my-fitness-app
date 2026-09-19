/**
 * Тесты формы запроса ссылки для входа.
 *
 * Реальный ConsentSection используется намеренно (не подменяется мок̀ом):
 * ровно те же формулировки, что охраняет consentWording.test.ts, и ровно то
 * же состояние согласий, что AuthScreen использует для регистрации по
 * паролю — этой формой нельзя заводить второй, слегка другой набор текстов.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MagicLinkForm } from '../MagicLinkForm'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>{children}</a>
    ),
}))

const mockRequest = jest.fn()

jest.mock('@/features/auth/api/magicLink', () => ({
    magicLinkApi: {
        request: (...args: unknown[]) => mockRequest(...args),
    },
}))

async function fillRequiredConsents(user: ReturnType<typeof userEvent.setup>) {
    const checkboxes = screen.getAllByRole('checkbox')
    // Порядок ConsentSection: условия, конфиденциальность, обработка данных, маркетинг.
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])
    await user.click(checkboxes[2])
}

describe('MagicLinkForm', () => {
    const onSwitchToPassword = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('показывает один и тот же текст независимо от того, есть ли аккаунт', async () => {
        mockRequest.mockResolvedValueOnce(undefined)
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'known@example.com')
        await fillRequiredConsents(user)
        await user.click(screen.getByRole('button', { name: /ссылк/i }))

        expect(
            await screen.findByText(/мы отправили на него ссылку/i)
        ).toBeInTheDocument()
        expect(mockRequest).toHaveBeenCalledWith(
            'known@example.com',
            expect.objectContaining({
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
            })
        )
    })

    it('не отправляет запрос без обязательных согласий', async () => {
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'someone@example.com')

        expect(screen.getByRole('button', { name: /ссылк/i })).toBeDisabled()
        expect(mockRequest).not.toHaveBeenCalled()
    })

    it('требует все три обязательных согласия, а не только часть', async () => {
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'someone@example.com')
        const checkboxes = screen.getAllByRole('checkbox')
        await user.click(checkboxes[0]) // только условия
        await user.click(checkboxes[2]) // и обработка данных — без конфиденциальности

        expect(screen.getByRole('button', { name: /ссылк/i })).toBeDisabled()
    })

    it('показывает предложение войти по паролю при отключённой почте (503)', async () => {
        mockRequest.mockRejectedValueOnce(new ApiError(503, { code: 'email_unavailable' }))
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'someone@example.com')
        await fillRequiredConsents(user)
        await user.click(screen.getByRole('button', { name: /ссылк/i }))

        expect(
            await screen.findByText(/войдите по паролю/i)
        ).toBeInTheDocument()
    })

    it('раскрывает вход по паролю без перезагрузки страницы', async () => {
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.click(screen.getByRole('button', { name: /войти по паролю/i }))

        expect(onSwitchToPassword).toHaveBeenCalledTimes(1)
    })

    it('сообщает об ограничении частоты запросов (429)', async () => {
        mockRequest.mockRejectedValueOnce(new ApiError(429, { code: 'rate_limited' }))
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'someone@example.com')
        await fillRequiredConsents(user)
        await user.click(screen.getByRole('button', { name: /ссылк/i }))

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/слишком много/i)
        })
    })
})
