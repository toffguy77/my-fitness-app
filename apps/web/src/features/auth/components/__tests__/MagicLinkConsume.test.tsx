/**
 * Переход по ссылке из письма: три исхода, которые эта страница обязана
 * различать — сюда попадает и уже существующий аккаунт, и только что
 * созданный этой же ссылкой, и токен, который сервер не принял.
 *
 * `magicLinkApi.consume` подменяется напрямую (как в magicLink.test.ts и
 * MagicLinkForm.test.tsx), а не через MSW: в этом проекте так устроены все
 * тесты api-клиентов, и заводить здесь второй способ мокать сеть незачем.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MagicLinkConsume } from '../MagicLinkConsume'
import { ApiError, messageFor } from '@/shared/errors/apiErrors'
import type { AuthResponse } from '@/features/auth/types'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>{children}</a>
    ),
}))

const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mockReplace }),
}))

const mockConsume = jest.fn()

jest.mock('@/features/auth/api/magicLink', () => ({
    magicLinkApi: {
        consume: (...args: unknown[]) => mockConsume(...args),
    },
}))

const mockLeadToken = jest.fn()
const mockForgetLeadToken = jest.fn()

jest.mock('@/features/onboarding/api/guest', () => ({
    leadToken: () => mockLeadToken(),
    forgetLeadToken: () => mockForgetLeadToken(),
}))

function user(overrides: Partial<AuthResponse['user']> = {}): AuthResponse['user'] {
    return {
        id: '42',
        email: 'someone@example.com',
        role: 'client',
        created_at: '2026-09-19T00:00:00Z',
        email_verified: true,
        onboarding_completed: true,
        ...overrides,
    }
}

describe('MagicLinkConsume', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockLeadToken.mockReturnValue(null)
        localStorage.clear()
    })

    it('входит и уводит в приложение', async () => {
        mockConsume.mockResolvedValueOnce({
            user: user({ onboarding_completed: true }),
            created: false,
        })

        render(<MagicLinkConsume token="good" />)

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'))
        expect(mockConsume).toHaveBeenCalledWith('good', null)
    })

    // Особый случай: аккаунт создан именно этим переходом, поэтому у него ещё
    // нет ни профиля, ни данных — вести его в дашборд как обычного клиента
    // было бы неверно.
    it('уводит нового пользователя в онбординг, а не в дашборд', async () => {
        mockConsume.mockResolvedValueOnce({
            user: user({ onboarding_completed: false }),
            created: true,
        })

        render(<MagicLinkConsume token="fresh" />)

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'))
        expect(mockReplace).not.toHaveBeenCalledWith('/dashboard')
    })

    // Тело в точности то, что теперь отдаёт ConsumeMagicLink для просроченной,
    // погашенной и поддельной ссылки (см. handler.go): статус 400 и код
    // "token_invalid" — response.Fail(err) вместо прежнего response.Error,
    // который отдавал общий codeForStatus(400) = "validation" и топил
    // причину в переводе «Проверьте введённые данные» (человеку, перешедшему
    // по письму, вводить нечего). Код уже был в словаре на обеих сторонах
    // (errors.token_invalid = 'Ссылка недействительна'), заводить новый не
    // потребовалось.
    //
    // Сравнение — и с messageFor(error) (не рассыплется, если перевод кода
    // когда-нибудь изменится сам по себе), и отдельно с буквальным текстом
    // (чтобы явно зафиксировать «Ссылка недействительна», а не любой другой
    // перевод — ровно то, что просили показывать).
    it('объясняет отказ и предлагает запросить новую ссылку', async () => {
        const error = new ApiError(400, {
            code: 'token_invalid',
            message: 'Ссылка не подходит — запросите новую',
        })
        mockConsume.mockRejectedValueOnce(error)

        render(<MagicLinkConsume token="stale" />)

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent(messageFor(error))
        expect(alert).toHaveTextContent('Ссылка недействительна')

        const link = screen.getByRole('link', { name: /вход/i })
        expect(link).toHaveAttribute('href', '/auth')
        expect(mockReplace).not.toHaveBeenCalled()
    })
})
