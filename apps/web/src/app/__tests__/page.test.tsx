/**
 * Серверный компонент: вызывается напрямую как асинхронная функция и
 * ожидается, а результат отдаётся в `render` — тот же приём, что в
 * `apps/web/src/app/auth/link/consume/__tests__/page.test.tsx` (задача 8).
 *
 * Большинство тестов передают `features` явно и тем самым обходят сеть —
 * это делает условный рендер детерминированным, но ничего не говорит про
 * `enabledFeatures()` сам по себе: подстановка `features` в пропсы и разбор
 * ответа `/ready` — разный код. Блок «enabledFeatures()» ниже зовёт `Home()`
 * без `features` и подменяет `global.fetch`, как это делает
 * `apps/web/src/app/__tests__/sitemap.test.ts` — так недоступный API и
 * поломанный ответ проверяются по-настоящему, а не эквивалентом.
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from '../page'

jest.mock('@/shared/components/JsonLd', () => ({
    JsonLd: () => null,
}))

jest.mock('../_components/AuthRedirect', () => ({
    AuthRedirect: () => null,
}))

jest.mock('@/shared/components/SupportLink', () => ({
    SupportLink: () => null,
}))

describe('Посадочная страница', () => {
    it('предлагает вход и регистрацию как отдельные действия в шапке', async () => {
        render(await Home({ features: {} }))
        const header = screen.getByRole('banner')

        expect(within(header).getByRole('link', { name: 'Войти' })).toHaveAttribute(
            'href',
            '/auth',
        )
        expect(
            within(header).getByRole('link', { name: 'Регистрация' }),
        ).toHaveAttribute('href', '/auth?mode=register')
    })

    it('ведёт основным действием героя в гостевой расчёт, а не в форму регистрации', async () => {
        render(await Home({ features: {} }))

        const cta = screen.getAllByText(/Рассчитать мою норму/i)[0]
        expect(cta.closest('a')).toHaveAttribute('href', '/onboarding')

        const quiet = screen.getByRole('link', { name: /уже есть аккаунт/i })
        expect(quiet).toHaveAttribute('href', '/auth')
    })

    it('в блоке перед подвалом даёт вход и регистрацию как два разных перехода, и не даёт расчёт', async () => {
        render(await Home({ features: {} }))
        const cta = screen.getByTestId('landing-cta')

        const signIn = within(cta).getByRole('link', { name: /войти/i })
        const register = within(cta).getByRole('link', { name: /регистрац/i })

        expect(signIn).toHaveAttribute('href', '/auth')
        expect(register).toHaveAttribute('href', '/auth?mode=register')
        // Не только разные тексты — разные места назначения. Ссылка на текст
        // без проверки href не отличает две кнопки от одной, продублированной
        // дважды с разными подписями.
        expect(signIn).not.toBe(register)
        expect(signIn.getAttribute('href')).not.toBe(register.getAttribute('href'))
        expect(within(cta).queryByRole('link', { name: /рассчитать/i })).not.toBeInTheDocument()
    })

    it('не показывает блок отзывов, пока подтверждённых данных нет', async () => {
        render(await Home({ features: {} }))
        expect(screen.queryByTestId('landing-social-proof')).not.toBeInTheDocument()
        // Без этой строки тест проходит и на пустой странице — не только на
        // странице без блока отзывов. Он обязан отличать «блока нет» от
        // «страница не отрендерилась вовсе».
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })

    // Отдельно от «нет утверждения» — тест обязан отличать «текста нет» от
    // «текст не тот». Пустая страница не должна проходить эту проверку.
    it('содержит утверждение про куратора, который видит дневник', async () => {
        render(await Home({ features: {} }))
        expect(screen.getByText(/куратор видит дневник/i)).toBeInTheDocument()
    })

    it('не обещает добавление еды по фото, когда способность выключена', async () => {
        render(await Home({ features: { food_recognition: false } }))
        expect(screen.queryByText(/по фото/i)).not.toBeInTheDocument()
        // Тот же довод: страница, которая не отрендерилась вовсе, тоже не
        // содержит «по фото» — но это не то, что здесь проверяется. Утверждение
        // про куратора всегда присутствует, значит его отсутствие означает
        // сломанный рендер, а не выключенную способность.
        expect(screen.getByText(/куратор видит дневник/i)).toBeInTheDocument()
    })

    it('обещает добавление еды по фото, когда способность включена', async () => {
        render(await Home({ features: { food_recognition: true } }))
        expect(screen.getByText(/по фото/i)).toBeInTheDocument()
    })
})

// Настоящий путь enabledFeatures(): без props.features страница сама зовёт
// `/ready`. Проверяет разбор ответа, а не только его результат — тест выше
// на `features: {}` пропустил бы сломанный enabledFeatures() незамеченным,
// раз features туда никогда не попадает через сеть.
describe('enabledFeatures() — что печатает страница по ответу /ready', () => {
    beforeEach(() => {
        global.fetch = jest.fn()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('не печатает утверждение о способности, когда /ready недоступен по сети', async () => {
        ;(global.fetch as jest.Mock).mockRejectedValue(new Error('network down'))

        render(await Home())

        expect(screen.queryByText(/по фото/i)).not.toBeInTheDocument()
        // Лендинг открывается и без способностей — недоступный API не должен
        // обрушивать всю страницу. Без этой строки тест не отличил бы честный
        // пропуск утверждения от того, что страница вовсе не отрендерилась.
        expect(screen.getByText(/куратор видит дневник/i)).toBeInTheDocument()
    })

    it('не печатает утверждение о способности, когда /ready отвечает не 200', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })

        render(await Home())

        expect(screen.queryByText(/по фото/i)).not.toBeInTheDocument()
        expect(screen.getByText(/куратор видит дневник/i)).toBeInTheDocument()
    })

    it('печатает утверждение о способности, когда /ready подтверждает food_recognition', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ features: { food_recognition: true } }),
        })

        render(await Home())

        expect(screen.getByText(/по фото/i)).toBeInTheDocument()
    })
})
