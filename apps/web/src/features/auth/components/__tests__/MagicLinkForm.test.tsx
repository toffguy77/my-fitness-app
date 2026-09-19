/**
 * Тесты формы запроса ссылки для входа.
 *
 * Реальный ConsentSection используется намеренно (не подменяется моком):
 * ровно те же формулировки, что охраняет consentWording.test.ts, и ровно то
 * же состояние согласий, что AuthScreen использует для регистрации по
 * паролю — этой формой нельзя заводить второй, слегка другой набор текстов.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MagicLinkForm } from '../MagicLinkForm'
import { ApiError, messageFor } from '@/shared/errors/apiErrors'

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

// Порядок ConsentSection: условия(0), конфиденциальность(1), обработка данных(2), маркетинг(3).
const TERMS = 0
const PRIVACY = 1
const DATA_PROCESSING = 2

async function fillRequiredConsents(user: ReturnType<typeof userEvent.setup>) {
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[TERMS])
    await user.click(checkboxes[PRIVACY])
    await user.click(checkboxes[DATA_PROCESSING])
}

async function checkOnly(user: ReturnType<typeof userEvent.setup>, indices: number[]) {
    const checkboxes = screen.getAllByRole('checkbox')
    for (const i of indices) {
        await user.click(checkboxes[i])
    }
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

    // Отдельно от предыдущего: доказывает, что на экране правда не остаётся
    // ничего, что различало бы два исхода — не полагаясь на то, что запрос
    // клиента сам по себе не знает результата (сервер отвечает 200 в обоих
    // случаях). Два независимых рендера с разными адресами обязаны дать
    // побайтово одинаковый DOM после отправки.
    it('экран после отправки одинаков для двух разных попыток', async () => {
        mockRequest.mockResolvedValue(undefined)

        const user1 = userEvent.setup()
        const first = render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)
        await user1.type(screen.getByLabelText(/почт/i), 'known@example.com')
        await fillRequiredConsents(user1)
        await user1.click(screen.getByRole('button', { name: /ссылк/i }))
        await screen.findByText(/мы отправили на него ссылку/i)
        const textAfterKnown = first.container.textContent
        first.unmount()

        const user2 = userEvent.setup()
        const second = render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)
        await user2.type(screen.getByLabelText(/почт/i), 'nobody-has-this-address@example.com')
        await fillRequiredConsents(user2)
        await user2.click(screen.getByRole('button', { name: /ссылк/i }))
        await screen.findByText(/мы отправили на него ссылку/i)
        const textAfterUnknown = second.container.textContent

        expect(textAfterKnown).toBe(textAfterUnknown)
    })

    // Ровно два отказа получают собственный текст в этом компоненте (503 —
    // подсказка войти по паролю, 400 — про согласия); любой третий код обязан
    // пройти через общий словарь ошибок как есть, а не завести здесь третью
    // ветку — иначе форму можно превратить в проверку существования адреса,
    // просто добавив условие на новый статус. Сравнение с `messageFor` из
    // того же модуля, что использует остальное приложение, а не с
    // захардкоженной строкой — так тест не подсказывает, какой текст обойти.
    it('неизвестные коды отказа проходят через общий словарь ошибок, а не заводят текст об аккаунте', async () => {
        const user = userEvent.setup()
        const error = new ApiError(404, { code: 'not_found' })
        mockRequest.mockRejectedValueOnce(error)
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'a@example.com')
        await fillRequiredConsents(user)
        await user.click(screen.getByRole('button', { name: /ссылк/i }))

        const alert = await screen.findByRole('alert')
        expect(alert.textContent).toBe(messageFor(error))
        expect(alert.textContent?.toLowerCase()).not.toMatch(
            /аккаунт|такой адрес|такого адреса|зарегистрирован/
        )
    })

    it('не отправляет запрос без обязательных согласий', async () => {
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'someone@example.com')

        expect(screen.getByRole('button', { name: /ссылк/i })).toBeDisabled()
        expect(mockRequest).not.toHaveBeenCalled()
    })

    // Три отдельных случая, не один: пропуская ровно одно из трёх обязательных
    // согласий за раз. Один общий тест, отмечающий только два конкретных
    // чекбокса, охраняет только эту пару — реальный дефект (кнопка теряет
    // проверку одного согласия, а не всех сразу) через него не виден.
    it.each([
        ['условия', [PRIVACY, DATA_PROCESSING]],
        ['конфиденциальность', [TERMS, DATA_PROCESSING]],
        ['обработку данных', [TERMS, PRIVACY]],
    ])('кнопка выключена, если не отмечено согласие: %s', async (_label, indicesToCheck) => {
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'someone@example.com')
        await checkOnly(user, indicesToCheck as number[])

        expect(screen.getByRole('button', { name: /ссылк/i })).toBeDisabled()
        expect(mockRequest).not.toHaveBeenCalled()
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

    // Код, который реально шлёт лимитер (see auth_rate_limiter.go) —
    // too_many_attempts, не rate_limited. Оба переводятся текстом, начинающимся
    // с «Слишком много», но фикстура обязана описывать настоящий ответ сервера.
    it('сообщает об ограничении частоты запросов (429)', async () => {
        mockRequest.mockRejectedValueOnce(new ApiError(429, { code: 'too_many_attempts' }))
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'someone@example.com')
        await fillRequiredConsents(user)
        await user.click(screen.getByRole('button', { name: /ссылк/i }))

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/слишком много попыток/i)
        })
    })

    // Подтверждение — живая область (role="status"), и фокус переходит на неё:
    // кнопка «Получить ссылку», на которой был фокус, исчезает вместе с формой,
    // а без явного переноса он падает на <body>, и скринридер молчит.
    it('объявляет успех вспомогательным технологиям и переносит на него фокус', async () => {
        mockRequest.mockResolvedValueOnce(undefined)
        const user = userEvent.setup()
        render(<MagicLinkForm onSwitchToPassword={onSwitchToPassword} />)

        await user.type(screen.getByLabelText(/почт/i), 'known@example.com')
        await fillRequiredConsents(user)
        await user.click(screen.getByRole('button', { name: /ссылк/i }))

        const status = await screen.findByRole('status')
        expect(status).toHaveTextContent(/мы отправили на него ссылку/i)
        await waitFor(() => expect(status).toHaveFocus())
    })
})
