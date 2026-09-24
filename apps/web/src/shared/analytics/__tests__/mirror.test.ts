import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { track, resetAnalyticsForTests } from '../client'
import { EVENTS, MIRRORED_EVENTS, isMirrored } from '../events'
import { COOKIE_CHOICE_KEY } from '@/shared/components/CookieConsent'

const ym = jest.fn()

describe('Mirroring product events into the counter', () => {
    beforeEach(() => {
        resetAnalyticsForTests()
        localStorage.removeItem(COOKIE_CHOICE_KEY)
        jest.clearAllMocks()
        localStorage.clear()
        process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = '107159088'
        ;(window as unknown as { ym: jest.Mock }).ym = ym
        localStorage.setItem(COOKIE_CHOICE_KEY, 'granted')
    })

    afterEach(() => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
    })

    // Scenario: Событие в белом списке
    it('reports a mirrored event as a goal', () => {
        track(EVENTS.onboardingStarted)

        expect(ym).toHaveBeenCalledTimes(1)
        expect(ym).toHaveBeenCalledWith('107159088', 'reachGoal', 'onboarding_started')
    })

    // Scenario: Событие вне белого списка
    it('reports nothing for an event outside the list', () => {
        track(EVENTS.landingScrollDepth, { depth: 50 })
        track(EVENTS.foodEntryCreated)

        expect(ym).not.toHaveBeenCalled()
    })

    // Scenario: Свойства события не передаются
    //
    // The name and nothing else. Properties stay in our own table, where every
    // report that groups by one is an SQL query anyway.
    it('passes the goal name and nothing else', () => {
        track(EVENTS.leadSaved, { contact_consent: true })

        expect(ym).toHaveBeenCalledWith('107159088', 'reachGoal', 'lead_saved')
        expect(ym.mock.calls[0]).toHaveLength(3)
    })

    // Scenario: Счётчик недоступен
    it('stays silent without consent, and still batches the event', () => {
        localStorage.removeItem(COOKIE_CHOICE_KEY)

        expect(() => track(EVENTS.landingViewed)).not.toThrow()
        expect(ym).not.toHaveBeenCalled()
    })

    it('stays silent after a refusal', () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'denied')

        track(EVENTS.landingViewed)

        expect(ym).not.toHaveBeenCalled()
    })

    it('stays silent where there is no counter', () => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID

        track(EVENTS.landingViewed)

        expect(ym).not.toHaveBeenCalled()
    })

    it('survives a counter that never arrived', () => {
        delete (window as unknown as { ym?: jest.Mock }).ym

        expect(() => track(EVENTS.landingViewed)).not.toThrow()
    })

    it('survives a counter that throws', () => {
        ym.mockImplementation(() => {
            throw new Error('заблокировано расширением')
        })

        expect(() => track(EVENTS.landingViewed)).not.toThrow()
    })
})

describe('The mirrored list', () => {
    const goDictionary = readFileSync(
        join(__dirname, '../../../../../api/internal/modules/analytics/dictionary.go'),
        'utf8',
    )

    // Scenario: Белый список соответствует словарю
    it('names only events the dictionary declares', () => {
        const declared = Object.values(EVENTS) as string[]

        for (const name of MIRRORED_EVENTS) {
            expect(declared).toContain(name)
        }
    })

    // Scenario: Серверные события не зеркалируются из браузера
    //
    // A fact does not happen in a browser, so it cannot be reached as a goal.
    // Those arrive at the counter as offline conversions instead.
    it('names no server-only event', () => {
        const serverOnly = [...goDictionary.matchAll(/Event(\w+):\s*\{[^}]*ServerOnly:\s*true/g)].map(
            (m) => m[1],
        )

        expect(serverOnly.length).toBeGreaterThan(0)

        const constantToName = new Map(
            [...goDictionary.matchAll(/Event(\w+)\s*=\s*"([a-z_]+)"/g)].map((m) => [m[1], m[2]]),
        )

        const forbidden = serverOnly
            .map((constant) => constantToName.get(constant))
            .filter((name): name is string => Boolean(name))

        for (const name of MIRRORED_EVENTS) {
            expect(forbidden).not.toContain(name)
        }
    })

    it('agrees with isMirrored', () => {
        expect(isMirrored(EVENTS.leadSaved)).toBe(true)
        expect(isMirrored(EVENTS.foodEntryCreated)).toBe(false)
    })
})

// The two ways an event can reach the counter must not overlap.
//
// A goal reached in the browser and a conversion uploaded from the server for
// the same event would count it twice, and the doubling is indistinguishable
// afterwards from growth.
describe('Goals and uploaded conversions', () => {
    const conversionsGo = readFileSync(
        join(__dirname, '../../../../../api/internal/modules/metrika/service.go'),
        'utf8',
    )

    const uploaded = (() => {
        const block = conversionsGo.match(/var Conversions = \[\]string\{([^}]*)\}/)
        expect(block).not.toBeNull()
        return [...block![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
    })()

    it('reads the uploaded conversions from the server', () => {
        expect(uploaded.length).toBeGreaterThan(0)
    })

    it('never sends the same event both ways', () => {
        for (const name of uploaded) {
            expect(MIRRORED_EVENTS).not.toContain(name)
        }
    })

    // Against the server dictionary, not the client one: three of the four are
    // facts a browser never reports, so they are declared only in Go.
    it('uploads only events the server dictionary declares', () => {
        const goDictionary = readFileSync(
            join(__dirname, '../../../../../api/internal/modules/analytics/dictionary.go'),
            'utf8',
        )
        const declared = [...goDictionary.matchAll(/Event\w+\s*=\s*"([a-z_]+)"/g)].map((m) => m[1])

        for (const name of uploaded) {
            expect(declared).toContain(name)
        }
    })
})
