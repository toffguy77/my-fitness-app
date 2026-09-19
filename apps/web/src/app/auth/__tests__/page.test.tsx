/**
 * Доходит до экрана: `AuthScreen` здесь НЕ подменяется (в отличие от
 * `apps/web/src/app/__tests__/auth-pages.test.tsx`, где он — заглушка).
 * Цель — проверить именно то, что сорвалось в задаче 9: посадочная страница
 * ведёт «Регистрация» на `/auth?mode=register`, но до этого теста ничто не
 * проверяло, что параметр вообще где-то читается. `AuthPage` — асинхронный
 * серверный компонент: звать как функцию и ожидать, как в
 * `apps/web/src/app/auth/link/consume/__tests__/page.test.tsx`.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import AuthPage from '../page'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

jest.mock('@/features/auth/hooks/useAuth', () => ({
    useAuth: () => ({
        login: jest.fn(),
        register: jest.fn(),
        isLoading: false,
        pendingDeletion: null,
        clearPendingDeletion: jest.fn(),
    }),
}))

jest.mock('@/features/auth/hooks/useFormValidation', () => ({
    useFormValidation: () => ({
        errors: {},
        validateEmail: jest.fn().mockReturnValue(true),
        validatePassword: jest.fn().mockReturnValue(true),
        validateLogin: jest.fn().mockReturnValue(true),
        validateRegister: jest.fn().mockReturnValue(true),
    }),
}))

// Реальный запрос списка OAuth-провайдеров ProviderButtons не нужен здесь —
// список пуст, кнопка ничего не рендерит, страница остаётся про пароль/ссылку.
jest.mock('@/features/auth/api/providers', () => ({
    providersApi: { list: jest.fn().mockResolvedValue([]), startUrl: jest.fn() },
    providerLabel: (p: string) => p,
}))

describe('AuthPage — какой экран открывает mode из адреса', () => {
    it('открывает форму регистрации, а не входа, при ?mode=register', async () => {
        render(await AuthPage({ searchParams: Promise.resolve({ mode: 'register' }) }))

        // Форма входа по ссылке остаётся в DOM (своё состояние не теряется
        // при переключении — см. AuthScreen.tsx), но скрыта `hidden`, а не
        // показана первой, как при обычном входе.
        expect(screen.getByText(/получить ссылку для входа/i)).not.toBeVisible()
        // Настоящая форма регистрации, видна сразу: согласия и кнопка
        // «Зарегистрироваться». MagicLinkForm тоже собирает согласия (та же
        // ConsentSection — см. MagicLinkForm.tsx), поэтому меток две; нужна
        // именно видимая, не спрятанная в скрытой форме входа по ссылке.
        const consentLabels = screen.getAllByLabelText(/о состоянии здоровья/i)
        const visibleConsent = consentLabels.find((el) => !el.closest('[hidden]'))
        expect(visibleConsent).toBeVisible()
        expect(screen.getByLabelText('Register a new account')).toHaveTextContent(
            'Зарегистрироваться',
        )
    })

    it('открывает вход по ссылке при отсутствии mode — прежнее поведение', async () => {
        render(await AuthPage({ searchParams: Promise.resolve({}) }))

        expect(screen.getByText(/получить ссылку для входа/i)).toBeInTheDocument()
    })

    it('открывает вход по ссылке при mode=login явно', async () => {
        render(await AuthPage({ searchParams: Promise.resolve({ mode: 'login' }) }))

        expect(screen.getByText(/получить ссылку для входа/i)).toBeInTheDocument()
    })
})
