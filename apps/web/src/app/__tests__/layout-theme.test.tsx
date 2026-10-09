/**
 * Тема на уровне корневого layout.
 *
 * Выбор с устройства (cookie `theme`) должен прийти в первой же разметке:
 * атрибутом на <html> и цветом системной строки. Иначе страница сначала
 * мигает системной темой и лишь потом перекрашивается скриптом.
 */
import { isValidElement, type ReactElement } from 'react'
import { values } from '@burcev/design-tokens'

let mockCookies: Record<string, string> = {}
jest.mock('next/headers', () => ({
    cookies: async () => ({ get: (name: string) => (name in mockCookies ? { value: mockCookies[name] } : undefined) }),
    headers: async () => ({ get: (name: string) => (name === 'x-nonce' ? 'test-nonce' : null) }),
}))

// layout тянет клиентские компоненты аналитики и прочего; здесь проверяется
// только то, что он отдаёт, поэтому они не рендерятся.
jest.mock('react-hot-toast', () => ({ Toaster: () => null }))

import RootLayout, { generateViewport } from '../layout'

beforeEach(() => {
    mockCookies = {}
})

describe('generateViewport', () => {
    it('без выбора — цвет строки по системной настройке, для обеих тем', async () => {
        const viewport = await generateViewport()
        expect(viewport.themeColor).toEqual([
            { media: '(prefers-color-scheme: light)', color: values.light['color.bg.canvas'] },
            { media: '(prefers-color-scheme: dark)', color: values.dark['color.bg.canvas'] },
        ])
        expect(viewport.width).toBe('device-width')
    })

    it.each(['light', 'dark'] as const)('выбрана %s — один цвет её фона', async (theme) => {
        mockCookies = { theme }
        expect((await generateViewport()).themeColor).toBe(values[theme]['color.bg.canvas'])
    })

    it('мусор в cookie не ломает страницу — считается «Авто»', async () => {
        mockCookies = { theme: '"><script>' }
        expect(Array.isArray((await generateViewport()).themeColor)).toBe(true)
    })
})

describe('RootLayout', () => {
    async function html(): Promise<ReactElement<Record<string, unknown>>> {
        const element = await RootLayout({ children: null })
        expect(isValidElement(element)).toBe(true)
        return element as ReactElement<Record<string, unknown>>
    }

    it('без выбора атрибута темы нет — работает prefers-color-scheme', async () => {
        const element = await html()
        expect(element.type).toBe('html')
        expect(element.props.lang).toBe('ru')
        expect(element.props['data-theme']).toBeUndefined()
    })

    it.each(['light', 'dark'] as const)('выбранная тема %s приходит в серверной разметке', async (theme) => {
        mockCookies = { theme }
        expect((await html()).props['data-theme']).toBe(theme)
    })

    it('посторонние значения cookie не попадают в разметку', async () => {
        mockCookies = { theme: 'neon' }
        expect((await html()).props['data-theme']).toBeUndefined()
    })
})
