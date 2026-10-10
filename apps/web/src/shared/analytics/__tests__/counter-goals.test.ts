/**
 * Цели Метрики, пришедшие раньше счётчика.
 *
 * На проде TrackView отправлял landing_viewed за 3 мс до того, как сниппет
 * объявлял window.ym, а при первом визите — ещё до ответа на баннер согласия.
 * Вызов молча пропадал: цель доходила раз-два в неделю при событии в
 * собственных пакетах на каждом визите.
 */
import { COOKIE_CHOICE_KEY, CONSENT_EVENT } from '@/shared/components/CookieConsent'
import { METRIKA_READY_EVENT, reachGoal, resetPendingGoalsForTests } from '../counter'

type Win = { ym?: jest.Mock }
const win = window as unknown as Win

function counterComesUp() {
    win.ym = jest.fn()
    window.dispatchEvent(new Event(METRIKA_READY_EVENT))
    return win.ym
}

function decide(choice: 'granted' | 'denied') {
    localStorage.setItem(COOKIE_CHOICE_KEY, choice)
    window.dispatchEvent(new Event(CONSENT_EVENT))
}

describe('цели Метрики', () => {
    beforeEach(() => {
        localStorage.clear()
        delete win.ym
        resetPendingGoalsForTests()
        process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = '107159088'
    })

    afterEach(() => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
    })

    it('уходят сразу, когда счётчик уже работает', () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'granted')
        win.ym = jest.fn()

        reachGoal('landing_viewed')

        expect(win.ym).toHaveBeenCalledWith('107159088', 'reachGoal', 'landing_viewed')
    })

    // Повторный визит: согласие есть, сниппет ещё не выполнился.
    it('ждут сниппет и уходят один раз, когда он поднял счётчик', () => {
        localStorage.setItem(COOKIE_CHOICE_KEY, 'granted')

        reachGoal('landing_viewed')
        const ym = counterComesUp()
        window.dispatchEvent(new Event(METRIKA_READY_EVENT))

        expect(ym).toHaveBeenCalledTimes(1)
        expect(ym).toHaveBeenCalledWith('107159088', 'reachGoal', 'landing_viewed')
    })

    // Первый визит: цель раньше ответа на баннер.
    it('до согласия не уходят, после согласия — уходят', () => {
        reachGoal('landing_viewed')
        expect(win.ym).toBeUndefined()

        decide('granted')
        const ym = counterComesUp()

        expect(ym).toHaveBeenCalledWith('107159088', 'reachGoal', 'landing_viewed')
    })

    it('при отказе выбрасываются и не уходят никогда', () => {
        reachGoal('landing_viewed')
        decide('denied')

        reachGoal('onboarding_started')
        // Даже если счётчик откуда-то возьмётся.
        localStorage.setItem(COOKIE_CHOICE_KEY, 'granted')
        const ym = counterComesUp()

        expect(ym).not.toHaveBeenCalled()
    })

    it('без счётчика на стенде не копятся', () => {
        delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID
        localStorage.setItem(COOKIE_CHOICE_KEY, 'granted')

        reachGoal('landing_viewed')
        process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = '107159088'
        const ym = counterComesUp()

        expect(ym).not.toHaveBeenCalled()
    })
})
