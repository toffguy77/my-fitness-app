/**
 * Доходит до экрана: `AuthScreen` здесь НЕ подменяется (в отличие от
 * `apps/web/src/app/__tests__/auth-pages.test.tsx`, где он — заглушка).
 * Цель — проверить, что параметр `mode` со страницы (`/auth?mode=register`,
 * ведёт сюда посадочная страница задачи 9) действительно на что-то влияет.
 * `AuthPage` — асинхронный серверный компонент: звать как функцию и
 * ожидать, как в `apps/web/src/app/auth/link/consume/__tests__/page.test.tsx`.
 *
 * Второй обзор задачи 9 отменил первую версию этого файла: `?mode=register`
 * не открывает форму пароля — открывает ту же форму по ссылке, что и вход,
 * с другим намерением (`intent`), которое меняет только текст (заголовок,
 * пояснение, подпись кнопки), не поведение. Пароль остаётся дальше, вторым
 * способом, доступным без перезагрузки — задача 7 задумала именно так.
 *
 * Тот же обзор поймал слепой тест на этом самом файле: прежние проверки
 * использовали `toBeInTheDocument()` там, где элемент из DOM никогда не
 * убирается (только скрывается `hidden`), из-за чего мутация
 * `initialMode` в 'register' безусловно проходила все восемь тестов.
 * Здесь — `toBeVisible()`, и различение по фактическому тексту, который
 * зависит от intent, а не только по присутствию элемента где-то в дереве.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
// список пуст, кнопка ничего не рендерит.
jest.mock('@/features/auth/api/providers', () => ({
    providersApi: { list: jest.fn().mockResolvedValue([]), startUrl: jest.fn() },
    providerLabel: (p: string) => p,
}))

describe('AuthPage — какой экран открывает mode из адреса', () => {
    it('при ?mode=register открывает форму по ссылке с намерением "регистрация"', async () => {
        render(await AuthPage({ searchParams: Promise.resolve({ mode: 'register' }) }))

        // Не форма пароля: слово «пароль» упоминается только как пояснение,
        // что его заводить не обязательно, а не как то, что нужно ввести —
        // самой формы пароля на экране нет вовсе (она не рендерится, пока
        // никто не переключился явно; AuthForm не размонтированным
        // `hidden`-элементом, а вообще отсутствует в дереве до переключения).
        expect(screen.queryByLabelText('Электронная почта')).not.toBeInTheDocument()

        expect(
            screen.getByRole('heading', { name: 'Регистрация', level: 2 })
        ).toBeVisible()
        expect(
            screen.getByRole('button', { name: 'Получить ссылку для регистрации' })
        ).toBeVisible()
        // Ключевое обещание предложения: пароль не обязателен.
        expect(screen.getByText(/пароль заводить не обязательно/i)).toBeVisible()

        // Текст входа не просто скрыт где-то ещё — его нет вовсе: intent
        // определяет, какая подпись кнопки рендерится, а не какая видна.
        expect(screen.queryByText('Получить ссылку для входа')).not.toBeInTheDocument()
    })

    it('без mode открывает форму по ссылке с намерением "вход" — прежнее поведение', async () => {
        render(await AuthPage({ searchParams: Promise.resolve({}) }))

        expect(
            screen.getByRole('heading', { name: 'Вход', level: 2 })
        ).toBeVisible()
        expect(
            screen.getByRole('button', { name: 'Получить ссылку для входа' })
        ).toBeVisible()
        expect(
            screen.queryByRole('button', { name: 'Получить ссылку для регистрации' })
        ).not.toBeInTheDocument()
    })

    it('при mode=login явно — то же самое, что и без mode', async () => {
        render(await AuthPage({ searchParams: Promise.resolve({ mode: 'login' }) }))

        expect(
            screen.getByRole('heading', { name: 'Вход', level: 2 })
        ).toBeVisible()
        expect(
            screen.getByRole('button', { name: 'Получить ссылку для входа' })
        ).toBeVisible()
    })

    // Пароль остаётся вторым способом входа/регистрации, доступным без
    // перезагрузки, даже когда пришли с намерением "регистрация" — задача 7.
    // В register-варианте пароль-формы главной обязана быть
    // «Зарегистрироваться»: кнопки «Войти» там больше нет вовсе (раньше она
    // оживала первой и вела к ошибке входа для человека без пароля).
    it('«Войти по паролю» при mode=register открывает пароль-форму без кнопки «Войти»', async () => {
        const user = userEvent.setup()
        render(await AuthPage({ searchParams: Promise.resolve({ mode: 'register' }) }))

        await user.click(screen.getByRole('button', { name: /войти по паролю/i }))

        expect(screen.getByLabelText('Электронная почта')).toBeVisible()
        expect(screen.queryByLabelText('Войти')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Зарегистрироваться')).toBeVisible()
    })
})
