/**
 * Живой справочник дизайн-системы (/design-system).
 *
 * Страница — витрина для разработки: если она падает или теряет раздел,
 * разница между токенами и компонентами перестаёт быть видна до прода.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { color } from '@burcev/design-tokens'
import DesignSystemPage, { metadata } from '../page'

describe('/design-system', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-theme')
    })

    it('служебная страница закрыта от поисковиков', () => {
        expect(metadata.robots).toEqual({ index: false, follow: false })
    })

    it('показывает все разделы', () => {
        render(<DesignSystemPage />)
        expect(screen.getByRole('heading', { level: 1, name: /Дизайн-система/ })).toBeInTheDocument()
        for (const section of ['Цвет · роли', 'Типографика']) {
            expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument()
        }
        expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(5)
    })

    it('каждая роль из витрины существует в токенах и подписана', () => {
        const { container } = render(<DesignSystemPage />)
        const names = Array.from(container.querySelectorAll('code')).map((node) => node.textContent ?? '')
        expect(names.length).toBeGreaterThan(20)
        for (const name of names.filter((n) => /^[a-z-]+$/.test(n))) {
            expect(color).toHaveProperty(name)
        }
    })

    it('собирает те же компоненты, что приложение', () => {
        render(<DesignSystemPage />)
        // Карточка дашборда и панель дневника — оба вида быстрой записи.
        expect(screen.getAllByRole('group', { name: 'Быстрая запись еды' })).toHaveLength(2)
        expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
        expect(screen.getByLabelText('Сб: выше нормы на 18%')).toBeInTheDocument()
    })

    it('переключатель темы красит страницу сразу, но не запоминает выбор', async () => {
        render(<DesignSystemPage />)
        const themes = screen.getByRole('radiogroup', { name: 'Тема' })
        expect(within(themes).getByRole('radio', { name: 'Авто' })).toHaveAttribute('aria-checked', 'true')

        await userEvent.click(within(themes).getByRole('radio', { name: 'Тёмная' }))
        expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
        expect(within(themes).getByRole('radio', { name: 'Тёмная' })).toHaveAttribute('aria-checked', 'true')
        expect(document.cookie).not.toMatch(/theme=dark/)

        await userEvent.click(within(themes).getByRole('radio', { name: 'Авто' }))
        expect(document.documentElement).not.toHaveAttribute('data-theme')
    })

    it('в разметке нет палитры Tailwind — только роли', () => {
        const { container } = render(<DesignSystemPage />)
        const palette = /\b(?:bg|text|border|ring|fill|stroke)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
        const offenders = Array.from(container.querySelectorAll('[class]'))
            .map((node) => node.getAttribute('class') ?? '')
            .filter((cls) => palette.test(cls))
        expect(offenders).toEqual([])
    })
})
