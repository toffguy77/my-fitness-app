import { track, flush, visitorId, resetAnalyticsForTests } from '../client'
import { EVENTS } from '../events'

describe('The analytics client', () => {
    let beacon: jest.Mock

    beforeEach(() => {
        resetAnalyticsForTests()
        localStorage.clear()
        jest.useFakeTimers()

        beacon = jest.fn().mockReturnValue(true)
        Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    // Not personal data and not a secret: it exists so the funnel does not
    // break where an anonymous visitor becomes a registered user.
    it('keeps one identifier for the browser across visits', () => {
        const first = visitorId()

        expect(first).toMatch(/^[0-9a-f-]{36}$/)
        expect(visitorId()).toBe(first)
        expect(localStorage.getItem('analytics_visitor_id')).toBe(first)
    })

    // One request for a dozen events, not a dozen requests.
    it('sends what has accumulated in one batch', () => {
        track(EVENTS.landingViewed)
        track(EVENTS.onboardingStep, { step: 'goal' })

        expect(beacon).not.toHaveBeenCalled()

        jest.advanceTimersByTime(10_000)

        expect(beacon).toHaveBeenCalledTimes(1)
    })

    it('sends nothing when nothing happened', () => {
        flush()

        expect(beacon).not.toHaveBeenCalled()
    })

    it('carries the browser identifier and the events it batched', () => {
        // jsdom's Blob does not implement text(); the payload is read from the
        // fetch fallback instead, which sends exactly the same body.
        Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
        const fetchMock = jest.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock as unknown as typeof fetch

        track(EVENTS.onboardingStep, { step: 'body' })
        flush()

        const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)

        expect(payload.visitor_id).toBe(visitorId())
        expect(payload.platform).toBe('web')
        expect(payload.events).toHaveLength(1)
        expect(payload.events[0]).toMatchObject({
            name: 'onboarding_step_completed',
            properties: { step: 'body' },
        })
    })

    // A full batch goes at once: the server refuses anything larger, and the
    // events would otherwise pile up until the timer.
    it('does not wait once a batch is full', () => {
        for (let i = 0; i < 50; i++) track(EVENTS.landingViewed)

        expect(beacon).toHaveBeenCalledTimes(1)
    })

    // The events worth having most are the ones just before somebody leaves,
    // and a closing page does not stay alive for a fetch.
    it('falls back to a keepalive request when beacons are unavailable', () => {
        Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
        const fetchMock = jest.fn().mockResolvedValue({ ok: true })
        global.fetch = fetchMock as unknown as typeof fetch

        track(EVENTS.landingViewed)
        flush()

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/public/analytics/events',
            expect.objectContaining({ keepalive: true })
        )
    })

    // Analytics must never break a screen.
    it('survives a browser that refuses to send anything', () => {
        Object.defineProperty(navigator, 'sendBeacon', {
            value: () => {
                throw new Error('blocked')
            },
            configurable: true,
        })

        track(EVENTS.landingViewed)

        expect(() => flush()).not.toThrow()
    })
})
