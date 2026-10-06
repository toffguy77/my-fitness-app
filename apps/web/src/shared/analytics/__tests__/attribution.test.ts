import {
    captureAttribution,
    storedAttribution,
    counterClientId,
    resetAttributionForTests,
} from '../attribution'
import { COOKIE_CHOICE_KEY } from '@/shared/components/CookieConsent'

const ym = jest.fn()

const DAY = 24 * 60 * 60

function clearCookies() {
    for (const part of document.cookie.split(';')) {
        const name = part.split('=')[0].trim()
        if (name) document.cookie = `${name}=; path=/; max-age=0`
    }
}

function firstTouchCookie(): string | undefined {
    return document.cookie
        .split('; ')
        .find((c) => c.startsWith('first_touch='))
        ?.slice('first_touch='.length)
}

const arrival = (over: Partial<{ search: string; referrer: string; path: string; host: string }> = {}) => ({
    search: '',
    referrer: '',
    path: '/',
    host: 'burcev.team',
    ...over,
})

describe('Where the visitor came from', () => {
    beforeEach(() => {
        resetAttributionForTests()
        clearCookies()
        localStorage.removeItem(COOKIE_CHOICE_KEY)
        jest.clearAllMocks()
        process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = '107159088'
        ;(window as unknown as { ym: jest.Mock }).ym = ym
    })

    afterEach(() => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
    })

    // Scenario: Переход по рекламе
    it('reads every campaign tag and the click identifier', () => {
        const found = captureAttribution(
            arrival({
                search:
                    '?utm_source=yandex&utm_medium=cpc&utm_campaign=autumn' +
                    '&utm_content=banner2&utm_term=%D0%BA%D0%B1%D0%B6%D1%83&yclid=12345',
            }),
        )

        expect(found).toEqual({
            utm_source: 'yandex',
            utm_medium: 'cpc',
            utm_campaign: 'autumn',
            utm_content: 'banner2',
            utm_term: 'кбжу',
            yandex_click_id: '12345',
            landing_page: '/',
        })
    })

    it('ignores query parameters that are not attribution', () => {
        const found = captureAttribution(arrival({ search: '?next=%2Fdashboard&token=secret' }))

        expect(found).toEqual({ landing_page: '/' })
    })

    // Scenario: Переход из Дзена без меток. Дзен и поиск меток не ставят —
    // без реферера этот трафик невидим.
    it('remembers where a visitor without tags came from, and on which page', () => {
        const found = captureAttribution(
            arrival({ referrer: 'https://dzen.ru/a/xyz?utm_referrer=foo&q=secret', path: '/content/chto-takoe-kbzhu' }),
        )

        expect(found).toEqual({ referrer: 'https://dzen.ru/a/xyz', landing_page: '/content/chto-takoe-kbzhu' })
        expect(storedAttribution()).toEqual(found)
    })

    // Scenario: Свой домен не считается реферером
    it('does not count our own pages as where somebody came from', () => {
        const found = captureAttribution(arrival({ referrer: 'https://burcev.team/pricing' }))

        expect(found.referrer).toBeUndefined()
    })

    // Scenario: Прямой заход
    it('records the landing page of a direct visit', () => {
        expect(captureAttribution(arrival({ path: '/kalkulyator-kbzhu' }))).toEqual({ landing_page: '/kalkulyator-kbzhu' })
    })

    // Scenario: Метки прочитаны на входе и использованы позже — by the contact
    // step the query string is long gone from the address bar.
    it('keeps the first touch across the navigations of the wizard', () => {
        captureAttribution(arrival({ search: '?utm_campaign=autumn' }))

        expect(captureAttribution(arrival({ path: '/onboarding' }))).toEqual({ utm_campaign: 'autumn', landing_page: '/' })
        expect(storedAttribution()).toEqual({ utm_campaign: 'autumn', landing_page: '/' })
    })

    // Scenario: Повторный заход — the first touch is the one that counts for
    // thirty days, whatever comes after it.
    it('does not let a later arrival overwrite the first touch', () => {
        captureAttribution(arrival({ referrer: 'https://dzen.ru/a/xyz' }))
        captureAttribution(arrival({ search: '?utm_campaign=winter' }))

        expect(storedAttribution()).toEqual({ referrer: 'https://dzen.ru/a/xyz', landing_page: '/' })
    })

    it('keeps the first touch for thirty days, in a cookie the server can read', () => {
        const write = jest.spyOn(Document.prototype, 'cookie', 'set')

        captureAttribution(arrival({ referrer: 'https://dzen.ru/a/xyz' }))

        const written = write.mock.calls.map(([value]) => value).find((v) => v.startsWith('first_touch='))
        expect(written).toContain(`max-age=${30 * DAY}`)
        expect(written).toContain('path=/')
        expect(written).toMatch(/samesite=lax/i)
        write.mockRestore()
    })

    // Scenario: Запись истекла — the browser drops the cookie after thirty days.
    it('records a new first touch once the old one has expired', () => {
        captureAttribution(arrival({ search: '?utm_campaign=autumn' }))
        clearCookies()

        captureAttribution(arrival({ search: '?utm_campaign=winter' }))

        expect(storedAttribution()).toEqual({ utm_campaign: 'winter', landing_page: '/' })
    })

    // Scenario: Хранилище недоступно
    it('still reports the tags of this arrival when the cookie cannot be kept', () => {
        const get = jest.spyOn(Document.prototype, 'cookie', 'get').mockReturnValue('')
        const set = jest.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(() => {})

        expect(captureAttribution(arrival({ search: '?utm_campaign=autumn' }))).toEqual({
            utm_campaign: 'autumn',
            landing_page: '/',
        })
        expect(storedAttribution()).toEqual({})

        // In reverse: the second spy captured the accessor with the first
        // already in place.
        set.mockRestore()
        get.mockRestore()
    })

    it('ignores a cookie that is not ours to read', () => {
        document.cookie = 'first_touch=%7Bbroken; path=/'

        expect(storedAttribution()).toEqual({})
    })

    // Scenario: Ограничение размера — the cookie travels with every request.
    it('trims values long enough to be an attack rather than a campaign', () => {
        const found = captureAttribution(arrival({ search: '?utm_campaign=' + 'x'.repeat(5000) }))

        expect(found.utm_campaign).toHaveLength(200)
    })

    it('keeps the cookie within a kilobyte, Cyrillic included', () => {
        captureAttribution(
            arrival({
                search:
                    '?utm_term=' + encodeURIComponent('кбжу'.repeat(60)) +
                    '&utm_content=' + encodeURIComponent('баннер'.repeat(40)) +
                    '&utm_campaign=' + 'c'.repeat(200),
                referrer: 'https://dzen.ru/' + 'a'.repeat(300),
                path: '/content/' + 'b'.repeat(300),
            }),
        )

        const value = firstTouchCookie()
        expect(value).toBeDefined()
        expect(value!.length).toBeLessThanOrEqual(1024)
        expect(storedAttribution().utm_campaign).toBeDefined()
    })
})

describe('Asking the counter for the browser identifier', () => {
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

    it('resolves with what the counter hands over', async () => {
        ym.mockImplementation((_id, _action, callback: (v: string) => void) => callback('cid-42'))

        await expect(counterClientId()).resolves.toBe('cid-42')
        expect(ym).toHaveBeenCalledWith('107159088', 'getClientID', expect.any(Function))
    })

    // Scenario: Идентификатор не пришёл никогда
    //
    // Behind an ad blocker the callback never fires. Nothing may wait on it.
    it('gives up rather than waiting when the callback never fires', async () => {
        jest.useFakeTimers()
        ym.mockImplementation(() => {})

        const pending = counterClientId(3000)
        jest.advanceTimersByTime(3000)

        await expect(pending).resolves.toBeUndefined()
        jest.useRealTimers()
    })

    it('resolves with nothing where there is no counter', async () => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID

        await expect(counterClientId()).resolves.toBeUndefined()
        expect(ym).not.toHaveBeenCalled()
    })

    it('resolves with nothing when the counter answers with an empty value', async () => {
        ym.mockImplementation((_id, _action, callback: (v: string) => void) => callback(''))

        await expect(counterClientId()).resolves.toBeUndefined()
    })

    // Согласие проверяется явно, а не через «скрипта всё равно нет».
    it('ничего не спрашивает без согласия', async () => {
        localStorage.removeItem(COOKIE_CHOICE_KEY)
        ym.mockImplementation((_id, _action, callback: (v: string) => void) => callback('cid-42'))

        await expect(counterClientId()).resolves.toBeUndefined()
        expect(ym).not.toHaveBeenCalled()
    })

    it('ничего не спрашивает после отказа', async () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'denied')

        await expect(counterClientId()).resolves.toBeUndefined()
        expect(ym).not.toHaveBeenCalled()
    })
})
