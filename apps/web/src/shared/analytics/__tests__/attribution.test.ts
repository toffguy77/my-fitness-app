import {
    captureAttribution,
    storedAttribution,
    counterClientId,
    resetAttributionForTests,
} from '../attribution'
import { COOKIE_CHOICE_KEY } from '@/shared/components/CookieConsent'

const ym = jest.fn()

describe('Where the visitor came from', () => {
    beforeEach(() => {
        resetAttributionForTests()
        localStorage.removeItem(COOKIE_CHOICE_KEY)
        jest.clearAllMocks()
        sessionStorage.clear()
        process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = '107159088'
        ;(window as unknown as { ym: jest.Mock }).ym = ym
    })

    afterEach(() => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
    })

    // Scenario: Заявка из рекламного перехода
    it('reads every campaign tag and the click identifier', () => {
        const found = captureAttribution(
            '?utm_source=yandex&utm_medium=cpc&utm_campaign=autumn' +
                '&utm_content=banner2&utm_term=%D0%BA%D0%B1%D0%B6%D1%83&yclid=12345',
        )

        expect(found).toEqual({
            utm_source: 'yandex',
            utm_medium: 'cpc',
            utm_campaign: 'autumn',
            utm_content: 'banner2',
            utm_term: 'кбжу',
            yandex_click_id: '12345',
        })
    })

    it('ignores query parameters that are not attribution', () => {
        const found = captureAttribution('?next=%2Fdashboard&token=secret')

        expect(found).toEqual({})
    })

    // Scenario: Метки прочитаны на входе и использованы позже
    //
    // By the contact step the query string is long gone from the address bar.
    it('keeps the tags across the navigations of the wizard', () => {
        captureAttribution('?utm_campaign=autumn')

        // Later pages call it with no tags of their own.
        expect(captureAttribution('')).toEqual({ utm_campaign: 'autumn' })
        expect(storedAttribution()).toEqual({ utm_campaign: 'autumn' })
    })

    it('does not let a later arrival overwrite the tags of this one', () => {
        captureAttribution('?utm_campaign=autumn')
        captureAttribution('?utm_campaign=winter')

        expect(storedAttribution()).toEqual({ utm_campaign: 'autumn' })
    })

    // Scenario: Новый приход без меток
    //
    // Session storage, not local: in local storage last month's campaign would
    // be attached to a lead saved today.
    it('forgets the tags when the arrival ends', () => {
        captureAttribution('?utm_campaign=autumn')

        sessionStorage.clear()

        expect(storedAttribution()).toEqual({})
        expect(captureAttribution('')).toEqual({})
    })

    // Scenario: Хранилище недоступно
    it('still reports the tags when storage refuses', () => {
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('приватный режим')
        })
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('приватный режим')
        })

        expect(captureAttribution('?utm_campaign=autumn')).toEqual({ utm_campaign: 'autumn' })
        expect(storedAttribution()).toEqual({})

        setItem.mockRestore()
        getItem.mockRestore()
    })

    it('trims a value long enough to be an attack rather than a campaign', () => {
        const found = captureAttribution('?utm_campaign=' + 'x'.repeat(5000))

        expect(found.utm_campaign).toHaveLength(200)
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
