/**
 * /auth/consents — согласия до создания аккаунта через провайдера.
 *
 * Колбэк Яндекса или VK создавал аккаунт сразу, без согласий, без которых
 * форма регистрации аккаунт не создаёт. Теперь новый вход ждёт здесь, и
 * аккаунт появляется после `POST /auth/oauth/consents`. Спека
 * external-identity, «Аккаунт через провайдера создаётся после согласий»
 * (веб-сторона: страница, тело запроса, обработка ответа).
 *
 * Подменён только транспорт: проверяется то, что уходит на сервер.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import AuthConsentsPage from '@/app/auth/consents/page'
import { ApiError } from '@/shared/errors/apiErrors'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { setToken: jest.fn(), post: jest.fn(), get: jest.fn() },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

const replace = jest.fn()
let searchParams = new URLSearchParams('provider=yandex')
jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: jest.fn() }),
    useSearchParams: () => searchParams,
}))

const mockPost = apiClient.post as jest.Mock

const newClient = {
    user: {
        id: '7',
        email: 'new@example.com',
        role: 'client' as const,
        created_at: '',
        email_verified: true,
        onboarding_completed: false,
    },
    token: 'access',
}

const user = userEvent.setup()

function checkbox(name: RegExp) {
    return screen.getByRole('checkbox', { name })
}

async function tickMandatory() {
    await user.click(checkbox(/Договор публичной оферты/))
    await user.click(checkbox(/Политику конфиденциальности/))
    await user.click(checkbox(/обработку персональных данных/))
}

function continueButton() {
    return screen.getByRole('button', { name: 'Продолжить' })
}

beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    searchParams = new URLSearchParams('provider=yandex')
})

describe('/auth/consents', () => {
    it('показывает согласия с формы регистрации, ничего не отмечено заранее', () => {
        render(<AuthConsentsPage />)

        expect(screen.getByText(/Яндекс ID/)).toBeInTheDocument()
        const boxes = screen.getAllByRole('checkbox')
        expect(boxes).toHaveLength(4)
        boxes.forEach((box) => expect(box).not.toBeChecked())
    })

    // Как на форме регистрации: без обязательных согласий отправить нельзя.
    it('держит «Продолжить» выключенной, пока не отмечены три обязательных', async () => {
        render(<AuthConsentsPage />)

        expect(continueButton()).toBeDisabled()
        await user.click(checkbox(/Договор публичной оферты/))
        await user.click(checkbox(/Политику конфиденциальности/))
        // Оферта и политика без согласия на обработку ПДн — недостаточно.
        expect(continueButton()).toBeDisabled()
        await user.click(checkbox(/маркетинговые материалы/))
        expect(continueButton()).toBeDisabled()

        await user.click(checkbox(/обработку персональных данных/))
        expect(continueButton()).toBeEnabled()
        expect(mockPost).not.toHaveBeenCalled()
    })

    // «Новый пользователь через Яндекс», веб-сторона.
    it('отправляет согласия, устанавливает сессию и ведёт дальше', async () => {
        mockPost.mockResolvedValue(newClient)
        render(<AuthConsentsPage />)

        await tickMandatory()
        await user.click(continueButton())

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'))
        expect(mockPost).toHaveBeenCalledTimes(1)
        expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/oauth/consents', {
            consents: {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            },
        })
        expect(apiClient.setToken).toHaveBeenCalledWith('access')
        expect(JSON.parse(localStorage.getItem('user') ?? 'null')).toEqual(newClient.user)
    })

    it('передаёт необязательное согласие на рассылку, когда его дали', async () => {
        mockPost.mockResolvedValue(newClient)
        render(<AuthConsentsPage />)

        await tickMandatory()
        await user.click(checkbox(/маркетинговые материалы/))
        await user.click(continueButton())

        await waitFor(() => expect(mockPost).toHaveBeenCalled())
        expect(mockPost.mock.calls[0][1].consents.marketing).toBe(true)
    })

    // «Без согласия на обработку данных»: сервер ответил 400 validation.
    it('на 400 validation просит отметить обязательные согласия и остаётся на экране без сессии', async () => {
        mockPost.mockRejectedValue(
            new ApiError(400, {
                code: 'validation',
                message: 'Нужно согласие на условия, политику конфиденциальности и обработку данных',
            })
        )
        render(<AuthConsentsPage />)

        await tickMandatory()
        await user.click(continueButton())

        expect(await screen.findByRole('alert')).toHaveTextContent('Отметьте обязательные согласия, чтобы продолжить.')
        expect(replace).not.toHaveBeenCalled()
        expect(apiClient.setToken).not.toHaveBeenCalled()
        expect(localStorage.getItem('user')).toBeNull()
    })

    // Ожидающий вход одноразовый: истёк — начинать заново со входа.
    it('на истёкший ожидающий вход уводит на /auth', async () => {
        mockPost.mockRejectedValue(new ApiError(400, { code: 'token_invalid', message: 'Попытка входа истекла' }))
        render(<AuthConsentsPage />)

        await tickMandatory()
        await user.click(continueButton())

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth'))
        expect(toast.error).toHaveBeenCalledWith('Попытка входа истекла. Начните заново.')
        expect(apiClient.setToken).not.toHaveBeenCalled()
    })

    // Адрес успел стать чужим аккаунтом — его забирают паролем, как с /auth/email.
    it('на needs_link_confirmation ведёт на подтверждение паролем без сессии', async () => {
        mockPost.mockResolvedValue({ result: 'needs_link_confirmation', email: 'taken@example.com' })
        render(<AuthConsentsPage />)

        await tickMandatory()
        await user.click(continueButton())

        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith('/auth/link?provider=yandex&email=taken%40example.com')
        )
        expect(apiClient.setToken).not.toHaveBeenCalled()
    })

    it('на 409 conflict говорит, что адрес занят, и уводит на вход', async () => {
        mockPost.mockRejectedValue(
            new ApiError(409, { code: 'conflict', message: 'Этот адрес уже зарегистрирован. Войдите заново.' })
        )
        render(<AuthConsentsPage />)

        await tickMandatory()
        await user.click(continueButton())

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth'))
        expect(toast.error).toHaveBeenCalledWith('Этот адрес уже зарегистрирован. Войдите заново.')
    })

    it('на сбой сервера остаётся на экране и говорит об этом', async () => {
        mockPost.mockRejectedValue(new ApiError(500, { code: 'internal' }))
        render(<AuthConsentsPage />)

        await tickMandatory()
        await user.click(continueButton())

        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(replace).not.toHaveBeenCalled()
        expect(continueButton()).toBeEnabled()
    })
})
