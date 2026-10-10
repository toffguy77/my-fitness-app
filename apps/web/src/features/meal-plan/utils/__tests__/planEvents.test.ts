import { track } from '@/shared/analytics'
import { plan } from '../../testing/fixtures'
import { resetPlanEventsForTests, trackPlanAction, trackPlanItemEaten, trackPlanRefit, trackPlanViewed } from '../planEvents'

jest.mock('@/shared/analytics', () => ({
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
    track: jest.fn(),
}))

const OFF = plan({ deviations: [{ nutrient: 'protein', delta: -25 }] })

beforeEach(() => {
    jest.clearAllMocks()
    resetPlanEventsForTests()
})

describe('события плана', () => {
    it('plan_generated — один раз на дату за сессию', () => {
        trackPlanViewed(plan())
        trackPlanViewed(plan())
        trackPlanViewed(plan({ date: '2026-10-11' }))
        expect(track).toHaveBeenCalledTimes(2)
        expect(track).toHaveBeenNthCalledWith(1, 'plan_generated')
    })

    it('показанные даты переживают перезагрузку вкладки', () => {
        trackPlanViewed(plan())
        expect(JSON.parse(sessionStorage.getItem('meal-plan:viewed-dates') ?? '[]')).toEqual(['2026-10-10'])
    })

    it('plan_off_target — при первом показе дня вне допуска', () => {
        trackPlanViewed(OFF)
        expect(track).toHaveBeenCalledWith('plan_generated')
        expect(track).toHaveBeenCalledWith('plan_off_target')
        trackPlanViewed(OFF)
        expect(track).toHaveBeenCalledTimes(2)
    })

    it('пересборка вне допуска шлёт plan_off_target, правка клиента — нет', () => {
        trackPlanAction('regenerated', OFF)
        expect(track).toHaveBeenCalledWith('plan_regenerated')
        expect(track).toHaveBeenCalledWith('plan_off_target')
        jest.clearAllMocks()

        trackPlanAction('grams_set', OFF)
        trackPlanAction('replaced', OFF)
        trackPlanAction('locked', OFF)
        expect((track as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
            'plan_grams_set',
            'plan_item_replaced',
            'plan_item_locked',
        ])
    })

    it('без хранилища дедупликация живёт в памяти', () => {
        const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied')
        })
        const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('denied')
        })
        trackPlanViewed(plan({ date: '2026-10-12' }))
        trackPlanViewed(plan({ date: '2026-10-12' }))
        expect(track).toHaveBeenCalledTimes(1)
        spy.mockRestore()
        set.mockRestore()
    })
})

describe('события связи с дневником', () => {
    it('plan_item_eaten — с источником', () => {
        trackPlanItemEaten('plan')
        trackPlanItemEaten('diary')
        expect(track).toHaveBeenNthCalledWith(1, 'plan_item_eaten', { source: 'plan' })
        expect(track).toHaveBeenNthCalledWith(2, 'plan_item_eaten', { source: 'diary' })
    })

    it('plan_refit — без свойств', () => {
        trackPlanRefit()
        expect(track).toHaveBeenCalledWith('plan_refit')
    })
})
