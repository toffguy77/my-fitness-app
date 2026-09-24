import { render, act } from '@testing-library/react'

import { TrackScrollDepth } from '../ScrollDepth'
import { track } from '../client'

// The module rather than a spy: an ES module namespace is frozen, so its
// exports cannot be redefined in place.
jest.mock('../client', () => ({
    track: jest.fn(),
    startAnalytics: jest.fn(),
}))

const tracked = track as jest.Mock

/**
 * jsdom lays nothing out: every element is zero-sized and scrollHeight is 0.
 * The page geometry is stated here instead, which is also the only way to test
 * a page taller than its viewport without a real browser.
 */
function pageOf(scrollHeight: number, viewport = 800) {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        value: scrollHeight,
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport })
    window.scrollY = 0
}

function scrollTo(y: number) {
    window.scrollY = y
    act(() => {
        window.dispatchEvent(new Event('scroll'))
    })
}

const depths = () =>
    tracked.mock.calls
        .filter(([name]) => name === 'landing_scroll_depth')
        .map(([, properties]) => properties?.depth)

describe('Tracking how far down the landing page people get', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    // Scenario: Порог достигнут
    it('reports each threshold as it is passed', () => {
        pageOf(4000)
        render(<TrackScrollDepth />)

        expect(depths()).toEqual([])

        scrollTo(200) // 1000 / 4000 = 25%
        expect(depths()).toEqual([25])

        scrollTo(1200) // 50%
        expect(depths()).toEqual([25, 50])

        scrollTo(2200) // 75%
        expect(depths()).toEqual([25, 50, 75])

        scrollTo(3200) // 100%
        expect(depths()).toEqual([25, 50, 75, 100])
    })

    // A fast scroll passes several thresholds between two events; none of them
    // is lost, because each is checked rather than only the nearest.
    it('reports every threshold a single jump passed', () => {
        pageOf(4000)
        render(<TrackScrollDepth />)

        scrollTo(3200)

        expect(depths()).toEqual([25, 50, 75, 100])
    })

    // Scenario: Повторное достижение порога
    it('reports a threshold once, however often it is reached', () => {
        pageOf(4000)
        render(<TrackScrollDepth />)

        scrollTo(1200)
        scrollTo(0)
        scrollTo(1200)

        expect(depths()).toEqual([25, 50])
    })

    // Scenario: Страница короче экрана
    //
    // Reporting nothing would read as "nobody got past the top", which is the
    // opposite of what happened.
    it('counts a page that fits on the screen as read to the end', () => {
        pageOf(600, 800)
        render(<TrackScrollDepth />)

        expect(depths()).toEqual([25, 50, 75, 100])
    })

    it('stops listening once the page is left', () => {
        pageOf(4000)
        const { unmount } = render(<TrackScrollDepth />)

        unmount()
        scrollTo(3200)

        expect(depths()).toEqual([])
    })

    // The values the server accepts, and nothing between them.
    it('reports only the four declared thresholds', () => {
        pageOf(4000)
        render(<TrackScrollDepth />)

        for (let y = 0; y <= 3200; y += 50) scrollTo(y)

        expect(depths()).toEqual([25, 50, 75, 100])
    })
})
