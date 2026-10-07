import {
    applyThemePreference,
    readThemePreference,
    saveThemePreference,
    subscribeThemePreference,
} from '../theme'

afterEach(() => {
    document.cookie = 'theme=; path=/; max-age=0'
    document.documentElement.removeAttribute('data-theme')
})

describe('applyThemePreference', () => {
    it('по умолчанию работает с <html>', () => {
        applyThemePreference('dark')
        expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
        applyThemePreference('system')
        expect(document.documentElement).not.toHaveAttribute('data-theme')
    })

    it('умеет и с другим корнем — для витрины и тестов', () => {
        const root = document.createElement('div')
        applyThemePreference('light', root)
        expect(root).toHaveAttribute('data-theme', 'light')
        expect(document.documentElement).not.toHaveAttribute('data-theme')
    })
})

describe('saveThemePreference', () => {
    it('запоминает выбор в cookie на год и сообщает подписчикам', () => {
        const listener = jest.fn()
        const unsubscribe = subscribeThemePreference(listener)

        saveThemePreference('dark')
        expect(readThemePreference()).toBe('dark')
        expect(listener).toHaveBeenCalledTimes(1)

        unsubscribe()
        saveThemePreference('light')
        expect(listener).toHaveBeenCalledTimes(1)
        expect(readThemePreference()).toBe('light')
    })

    it('«Авто» стирает cookie, а не пишет в неё «system»', () => {
        saveThemePreference('dark')
        saveThemePreference('system')
        expect(document.cookie).not.toMatch(/theme=/)
        expect(readThemePreference()).toBe('system')
    })
})
