import { render } from '@testing-library/react'

import { MetrikaRouteHits } from '../MetrikaRouteHits'
import { COOKIE_CHOICE_KEY } from '@/shared/components/CookieConsent'

const mockPathname = jest.fn()

jest.mock('next/navigation', () => ({
    usePathname: () => mockPathname(),
}))

const ym = jest.fn()

/** Puts the browser on a path the way a client-side navigation would. */
function at(path: string, search = '') {
    mockPathname.mockReturnValue(path)
    window.history.replaceState({}, '', path + search)
}

describe('Reporting client-side navigations', () => {
    beforeEach(() => {
        localStorage.removeItem(COOKIE_CHOICE_KEY)
        jest.clearAllMocks()
        process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = '107159088'
        ;(window as unknown as { ym: jest.Mock }).ym = ym
        localStorage.setItem(COOKIE_CHOICE_KEY, 'granted')
    })

    afterEach(() => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
    })

    // Scenario: Первый просмотр не задваивается
    //
    // The counter reports the loading page itself, in `init`.
    it('sends nothing for the page the counter already reported', () => {
        at('/')

        render(<MetrikaRouteHits />)

        expect(ym).not.toHaveBeenCalled()
    })

    // Scenario: Переход между экранами
    it('sends exactly one view per navigation', () => {
        at('/')
        const { rerender } = render(<MetrikaRouteHits />)

        at('/onboarding')
        rerender(<MetrikaRouteHits />)

        expect(ym).toHaveBeenCalledTimes(1)
        expect(ym).toHaveBeenCalledWith('107159088', 'hit', '/onboarding')

        at('/auth')
        rerender(<MetrikaRouteHits />)

        expect(ym).toHaveBeenCalledTimes(2)
        expect(ym).toHaveBeenLastCalledWith('107159088', 'hit', '/auth')
    })

    // Scenario: Строка запроса сохраняется
    //
    // Campaign tags live in the query; a hit without it attributes the visit
    // to nobody.
    it('carries the query string with the path', () => {
        at('/')
        const { rerender } = render(<MetrikaRouteHits />)

        at('/onboarding', '?utm_source=direct&utm_campaign=autumn')
        rerender(<MetrikaRouteHits />)

        expect(ym).toHaveBeenCalledWith(
            '107159088',
            'hit',
            '/onboarding?utm_source=direct&utm_campaign=autumn',
        )
    })

    // Scenario: Повторный переход на тот же путь
    it('sends nothing when the path has not changed', () => {
        at('/')
        const { rerender } = render(<MetrikaRouteHits />)

        at('/onboarding')
        rerender(<MetrikaRouteHits />)
        rerender(<MetrikaRouteHits />)

        expect(ym).toHaveBeenCalledTimes(1)
    })

    // Scenario: Согласия нет
    it('sends nothing after a refusal, and navigation still works', () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'denied')
        at('/')
        const { rerender } = render(<MetrikaRouteHits />)

        at('/onboarding')

        expect(() => rerender(<MetrikaRouteHits />)).not.toThrow()
        expect(ym).not.toHaveBeenCalled()
    })

    it('sends nothing while nobody has been asked', () => {
        localStorage.removeItem(COOKIE_CHOICE_KEY)
        at('/')
        const { rerender } = render(<MetrikaRouteHits />)

        at('/onboarding')
        rerender(<MetrikaRouteHits />)

        expect(ym).not.toHaveBeenCalled()
    })

    // An ad blocker, a slow script and a refusal look the same from here.
    it('survives a counter that never arrived', () => {
        delete (window as unknown as { ym?: jest.Mock }).ym
        at('/')
        const { rerender } = render(<MetrikaRouteHits />)

        at('/onboarding')

        expect(() => rerender(<MetrikaRouteHits />)).not.toThrow()
    })

    it('sends nothing where there is no counter', () => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
        at('/')
        const { rerender } = render(<MetrikaRouteHits />)

        at('/onboarding')
        rerender(<MetrikaRouteHits />)

        expect(ym).not.toHaveBeenCalled()
    })
})
