import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsAppearance } from '../SettingsAppearance'
import { parseThemePreference, readThemePreference } from '@/shared/theme/theme'

function clearThemeCookie() {
    document.cookie = 'theme=; path=/; max-age=0'
}

describe('SettingsAppearance', () => {
    beforeEach(() => {
        clearThemeCookie()
        document.documentElement.removeAttribute('data-theme')
    })

    it('по умолчанию выбрано «Авто»', () => {
        render(<SettingsAppearance />)
        expect(screen.getByRole('radio', { name: 'Авто' })).toHaveAttribute('aria-checked', 'true')
        expect(document.documentElement).not.toHaveAttribute('data-theme')
    })

    it('тёмная тема применяется сразу и запоминается на устройстве', async () => {
        render(<SettingsAppearance />)
        await userEvent.click(screen.getByRole('radio', { name: 'Тёмная' }))

        expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
        expect(readThemePreference()).toBe('dark')
        expect(screen.getByRole('radio', { name: 'Тёмная' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('radio', { name: 'Авто' })).toHaveAttribute('aria-checked', 'false')
    })

    it('«Авто» снимает явный выбор', async () => {
        render(<SettingsAppearance />)
        await userEvent.click(screen.getByRole('radio', { name: 'Светлая' }))
        expect(document.documentElement).toHaveAttribute('data-theme', 'light')

        await userEvent.click(screen.getByRole('radio', { name: 'Авто' }))
        expect(document.documentElement).not.toHaveAttribute('data-theme')
        expect(readThemePreference()).toBe('system')
    })
})

describe('parseThemePreference', () => {
    it.each([
        ['light', 'light'], ['dark', 'dark'], ['system', 'system'], ['', 'system'], [undefined, 'system'], ['<script>', 'system'],
    ])('%s → %s', (value, expected) => {
        expect(parseThemePreference(value as string | undefined)).toBe(expected)
    })
})

describe('readThemePreference', () => {
    it('находит cookie среди других', () => {
        expect(readThemePreference('a=1; theme=dark; b=2')).toBe('dark')
        expect(readThemePreference('themes=dark')).toBe('system')
    })
})
