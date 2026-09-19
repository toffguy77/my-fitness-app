/**
 * Переход по ссылке из письма: три исхода, которые эта страница обязана
 * различать — сюда попадает и уже существующий аккаунт, и только что
 * созданный этой же ссылкой, и токен, который сервер не принял. Плюс
 * побочные гарантии успешного пути — перенос токена заявки гостя, запись
 * профиля тем же следом, что и обычный вход, и токен, убранный из адреса до
 * того, как его увидит веб-визор Метрики.
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

const mockSetUser = jest.fn()

jest.mock('@/shared/utils/token-storage', () => ({
    setUser: (...args: unknown[]) => mockSetUser(...args),
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
    let replaceStateSpy: jest.SpyInstance

    beforeEach(() => {
        jest.clearAllMocks()
        mockLeadToken.mockReturnValue(null)
        localStorage.clear()
        replaceStateSpy = jest.spyOn(window.history, 'replaceState')
    })

    afterEach(() => {
        replaceStateSpy.mockRestore()
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
    //
    // Токен заявки гостя (`lead-abc`, а не null) здесь не для количества:
    // без него в прошлой версии теста `expect(...).toHaveBeenCalledWith(...,
    // null)` был тавтологией — mockLeadToken всегда возвращал null, и подмена
    // «передавать в consume() всегда null» проходила все три теста подряд.
    // Мутация ниже, в отдельном разделе отчёта, это подтверждает.
    it('уводит нового пользователя в онбординг и передаёт токен заявки гостя', async () => {
        mockLeadToken.mockReturnValue('lead-abc')
        mockConsume.mockResolvedValueOnce({
            user: user({ onboarding_completed: false }),
            created: true,
        })

        render(<MagicLinkConsume token="fresh" />)

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'))
        expect(mockReplace).not.toHaveBeenCalledWith('/dashboard')
        expect(mockConsume).toHaveBeenCalledWith('fresh', 'lead-abc')
    })

    // Сервер переносит заявку на аккаунт только когда переход его создал (см.
    // `if created` в handler.go) — забыть локальный токен заявки раньше
    // времени, при входе в уже существующий аккаунт, значило бы потерять
    // расчёт безвозвратно: сервер его не занимал, а браузер уже не помнит.
    it('не трогает заявку гостя при входе в уже существующий аккаунт', async () => {
        mockLeadToken.mockReturnValue('lead-abc')
        mockConsume.mockResolvedValueOnce({
            user: user({ onboarding_completed: true }),
            created: false,
        })

        render(<MagicLinkConsume token="good" />)

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'))
        expect(mockForgetLeadToken).not.toHaveBeenCalled()
    })

    // Обратный случай к предыдущему: аккаунт создан этим переходом — заявка
    // уже перенесена сервером, и локальный токен пора забыть, иначе более
    // поздняя регистрация в этом браузере попробует занять её снова.
    it('забывает заявку гостя, когда аккаунт создан этим переходом', async () => {
        mockLeadToken.mockReturnValue('lead-abc')
        mockConsume.mockResolvedValueOnce({
            user: user({ onboarding_completed: false }),
            created: true,
        })

        render(<MagicLinkConsume token="fresh" />)

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'))
        expect(mockForgetLeadToken).toHaveBeenCalledTimes(1)
    })

    // Часть экранов приложения (контент, дневник, уведомления, переписка,
    // настройки, профиль) читает профиль из localStorage напрямую, не
    // дожидаясь собственного запроса. Канонический setUser — а не третья
    // самостоятельная копия того же localStorage.setItem('user', ...).
    it('сохраняет профиль через canonical setUser', async () => {
        const signedInUser = user({ onboarding_completed: true })
        mockConsume.mockResolvedValueOnce({ user: signedInUser, created: false })

        render(<MagicLinkConsume token="good" />)

        await waitFor(() => expect(mockSetUser).toHaveBeenCalledWith(signedInUser))
    })

    // Веб-визор Метрики (layout.tsx) фиксирует текущий URL. Обычно к этому
    // моменту токен уже погашен, но при сетевом отказе обмена он остаётся
    // действительным ещё пятнадцать минут — адрес с ним не должен провисеть
    // в истории/URL дольше первого рендера.
    it('убирает токен из адреса при монтировании', async () => {
        mockConsume.mockResolvedValueOnce({
            user: user({ onboarding_completed: true }),
            created: false,
        })

        render(<MagicLinkConsume token="good" />)

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'))
        expect(replaceStateSpy).toHaveBeenCalledWith({}, '', window.location.pathname)
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

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Вход по ссылке')
    })

    it('заголовок есть и на экране загрузки', () => {
        mockConsume.mockReturnValue(new Promise(() => {})) // висит — экран не должен продвинуться дальше загрузки

        render(<MagicLinkConsume token="good" />)

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Вход по ссылке')
        expect(screen.getByRole('status')).toHaveTextContent('Входим')
    })
})
