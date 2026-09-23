/**
 * Согласие обязано что-то решать.
 *
 * Яндекс.Метрика грузилась сразу при открытии страницы — cookie ставились,
 * поведение записывалось, согласия не спрашивали. Полоса без проверки в самом
 * счётчике была бы украшением: «отказался» и «согласился» вели бы себя
 * одинаково, и это хуже, чем отсутствие полосы, — она обещает выбор.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { CookieConsent, COOKIE_CHOICE_KEY, analyticsChoice } from '../CookieConsent'

import { YandexMetrika } from '../YandexMetrika'

/**
 * Идентификатор счётчика задаётся здесь: в тестовом окружении его нет, и без
 * этого проверки «счётчик не подключается» проходили бы даже со снятой
 * защитой — компонент возвращал бы null по отсутствию идентификатора.
 */
function renderMetrika() {
    process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = '99999'
    render(<YandexMetrika />)
}

jest.mock('next/script', () => ({
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid="metrika-script">{children}</div>
    ),
}))

describe('Полоса согласия на аналитические cookie', () => {
    beforeEach(() => localStorage.clear())

    it('показывается, пока выбор не сделан', () => {
        render(<CookieConsent />)

        expect(screen.getByTestId('cookie-consent')).toBeInTheDocument()
    })

    it('не показывается повторно после ответа', () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'denied')

        render(<CookieConsent />)

        expect(screen.queryByTestId('cookie-consent')).not.toBeInTheDocument()
    })

    it('запоминает отказ, а не только скрывает полосу', () => {
        render(<CookieConsent />)

        fireEvent.click(screen.getByRole('button', { name: 'Отказаться' }))

        expect(analyticsChoice()).toBe('denied')
    })

    it('счётчик не подключается без согласия', () => {
        renderMetrika()

        expect(screen.queryByTestId('metrika-script')).not.toBeInTheDocument()
    })

    it('счётчик не подключается и при прямом отказе', () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'denied')

        renderMetrika()

        expect(screen.queryByTestId('metrika-script')).not.toBeInTheDocument()
    })

    it('а с согласием — подключается: иначе проверки выше ничего не значат', () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'granted')

        renderMetrika()

        expect(screen.getByTestId('metrika-script')).toBeInTheDocument()
    })
})
