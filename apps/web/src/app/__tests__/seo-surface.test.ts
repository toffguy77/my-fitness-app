/**
 * Где каждый маршрут приложения стоит для поиска.
 *
 * Каждая страница `app/**\/page.tsx` записана в SURFACE с осознанно выбранным
 * видом. Новая страница без записи валит сборку — так же, как маршрут API без
 * записи в authorization_matrix_test.go. Правила для каждого вида и то, что
 * делать после выкатки (sitemap, переобход), — в docs/seo/README.md.
 *
 * Появилось после /menu: раздел закрыли от анонимов в proxy.ts, но не в
 * robots.txt, и робот ходил в него за редиректом на вход. Тогда же нашлись
 * четыре страницы входа, открытые для индексации.
 */
import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import { inPrivateSection } from '@/shared/constants/sections'
import { DISALLOW } from '../robots.txt/robotsTxt'
import sitemap from '../sitemap'
import { metadata as home } from '../page'
import { metadata as pricing } from '../pricing/page'
import { metadata as calculator } from '../kalkulyator-kbzhu/page'
import { metadata as content } from '../content/page'
import { metadata as author } from '../avtor/sergey-burcev/page'
import { metadata as terms } from '../legal/terms/page'
import { metadata as privacy } from '../legal/privacy/page'

jest.mock('@/features/onboarding/components/KbzhuCalculator', () => ({
    KbzhuCalculator: () => null,
}))

/**
 * - `public` — для поиска: открыта, в sitemap, свой canonical, полный Open
 *   Graph, бренд в заголовке не повторяется. Метаданные — в PUBLIC_METADATA.
 * - `public-dynamic` — для поиска, адреса из базы (статьи): в sitemap их кладёт
 *   sitemap.ts, метаданные проверяет тест самой страницы.
 * - `private` — за входом: в PRIVATE_SECTIONS, а значит и в Disallow.
 * - `closed` — без входа, но искать там нечего: в Disallow.
 * - `utility` — открыта роботу (на неё ведут ссылки), но с noindex.
 */
type Kind = 'public' | 'public-dynamic' | 'private' | 'closed' | 'utility'

const SURFACE: Record<string, Kind> = {
    '/': 'public',
    '/pricing': 'public',
    '/kalkulyator-kbzhu': 'public',
    '/content': 'public',
    '/content/[id]': 'public-dynamic',
    '/avtor/sergey-burcev': 'public',
    '/legal/terms': 'public',
    '/legal/privacy': 'public',

    '/auth': 'utility',
    '/auth/complete': 'utility',
    '/auth/email': 'utility',
    '/auth/link': 'utility',
    '/auth/link/consume': 'utility',
    '/auth/verify-email': 'utility',
    '/unsubscribe': 'utility',

    '/onboarding': 'closed',
    '/forgot-password': 'closed',
    '/reset-password': 'closed',
    '/design-system': 'closed',

    '/dashboard': 'private',
    '/food-tracker': 'private',
    '/menu': 'private',
    '/menu/recipes/[id]': 'private',
    '/menu/shopping': 'private',
    '/chat': 'private',
    '/profile': 'private',
    '/notifications': 'private',
    '/settings/apple-health': 'private',
    '/settings/body': 'private',
    '/settings/food-restrictions': 'private',
    '/settings/notifications': 'private',
    '/settings/password': 'private',
    '/settings/privacy': 'private',
    '/settings/profile': 'private',
    '/settings/security': 'private',
    '/settings/social': 'private',
    '/curator': 'private',
    '/curator/chat': 'private',
    '/curator/chat/[clientId]': 'private',
    '/curator/clients/[id]': 'private',
    '/curator/content': 'private',
    '/curator/content/[id]/edit': 'private',
    '/curator/content/new': 'private',
    '/curator/leads': 'private',
    '/curator/recipes': 'private',
    '/curator/recipes/[id]': 'private',
    '/curator/support': 'private',
    '/admin': 'private',
    '/admin/chats': 'private',
    '/admin/chats/[id]': 'private',
    '/admin/content': 'private',
    '/admin/content/[id]/edit': 'private',
    '/admin/content/new': 'private',
    '/admin/jobs': 'private',
    '/admin/recipes': 'private',
    '/admin/recipes/[id]': 'private',
    '/admin/recipes/new': 'private',
    '/admin/users': 'private',
    '/admin/users/[id]': 'private',
}

/** Metadata of every `public` page: the canonical and Open Graph are checked. */
const PUBLIC_METADATA: Record<string, Metadata> = {
    '/': home,
    '/pricing': pricing,
    '/kalkulyator-kbzhu': calculator,
    '/content': content,
    '/avtor/sergey-burcev': author,
    '/legal/terms': terms,
    '/legal/privacy': privacy,
}

const SITE_URL = 'https://burcev.team'
const APP_DIR = path.join(__dirname, '..')

/** Every page in the app, as a route: `menu/shopping/page.tsx` → `/menu/shopping`. */
function discoveredRoutes(dir = APP_DIR): string[] {
    const routes: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'api') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) routes.push(...discoveredRoutes(full))
        else if (entry.name === 'page.tsx') {
            const rel = path.relative(APP_DIR, dir).split(path.sep)
                // Route groups such as (marketing) are not part of the address.
                .filter((seg) => seg && !/^\(.*\)$/.test(seg))
            routes.push('/' + rel.join('/'))
        }
    }
    return routes.sort()
}

/** Whether robots.txt closes the path, read by prefix the way a crawler does. */
function closedToCrawlers(route: string): boolean {
    return DISALLOW.some((prefix) => route.startsWith(prefix))
}

/** Whether the page, or any layout above it, declares noindex. */
function declaresNoindex(route: string): boolean {
    const segments = route.split('/').filter(Boolean)
    for (let depth = segments.length; depth >= 0; depth--) {
        const dir = path.join(APP_DIR, ...segments.slice(0, depth))
        for (const file of depth === segments.length ? ['page.tsx', 'layout.tsx'] : ['layout.tsx']) {
            const full = path.join(dir, file)
            if (fs.existsSync(full) && /robots:\s*\{\s*index:\s*false/.test(fs.readFileSync(full, 'utf8'))) {
                return true
            }
        }
    }
    return false
}

const byKind = (kind: Kind) => Object.keys(SURFACE).filter((route) => SURFACE[route] === kind)

describe('поисковая карта приложения', () => {
    it('каждая страница записана в SURFACE — новая без записи не проходит', () => {
        const unlisted = discoveredRoutes().filter((route) => !(route in SURFACE))

        expect(unlisted).toEqual([])
    })

    it('в SURFACE нет страниц, которых больше нет', () => {
        const routes = new Set(discoveredRoutes())

        expect(Object.keys(SURFACE).filter((route) => !routes.has(route))).toEqual([])
    })

    it.each(byKind('private'))('%s — за входом и закрыт для робота', (route) => {
        expect(inPrivateSection(route)).toBe(true)
        expect(closedToCrawlers(route)).toBe(true)
    })

    it.each(byKind('closed'))('%s — закрыт для робота', (route) => {
        expect(closedToCrawlers(route)).toBe(true)
    })

    // Disallow здесь был бы ошибкой: закрытую страницу робот не скачивает и
    // её noindex не читает, а ссылки на неё с публичных страниц есть.
    it.each(byKind('utility'))('%s — открыт роботу, но с noindex', (route) => {
        expect(closedToCrawlers(route)).toBe(false)
        expect(declaresNoindex(route)).toBe(true)
    })

    describe.each([...byKind('public'), ...byKind('public-dynamic')])('%s — для поиска', (route) => {
        it('открыт и без входа', () => {
            expect(closedToCrawlers(route)).toBe(false)
            expect(inPrivateSection(route)).toBe(false)
            // У статей noindex стоит условно — на статью, которой нет; это
            // проверяет content-article-page.test.tsx.
            if (SURFACE[route] === 'public') expect(declaresNoindex(route)).toBe(false)
        })
    })

    describe.each(byKind('public'))('%s — публичная страница', (route) => {
        const metadata = () => {
            const found = PUBLIC_METADATA[route]
            if (!found) throw new Error(`${route}: добавьте импорт метаданных в PUBLIC_METADATA`)
            return found
        }
        const url = route === '/' ? SITE_URL : `${SITE_URL}${route}`

        it('называет canonical собственный адрес', () => {
            expect(metadata().alternates?.canonical).toBe(url)
        })

        it('несёт полный Open Graph — собран через openGraph()', () => {
            // Свой openGraph без layout'а целиком заменяет общий: у юридических
            // страниц его нет, и они наследуют блок layout — это тоже полный.
            const og = (metadata().openGraph ?? {}) as { type?: string; siteName?: string; locale?: string; images?: unknown }
            if (metadata().openGraph) {
                expect(og.type).toBeTruthy()
                expect(og.siteName).toBe('BURCEV')
                expect(og.locale).toBe('ru_RU')
                expect(og.images).toBeTruthy()
            }
        })

        it('не повторяет бренд — шаблон «%s | BURCEV» допишет его сам', () => {
            if (route === '/') return // корень шаблон не получает, бренд там в самом заголовке
            expect(String(metadata().title)).not.toContain('BURCEV')
        })

        it('есть в sitemap', async () => {
            global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch
            jest.spyOn(console, 'error').mockImplementation(() => {})

            const urls = (await sitemap()).map((entry) => entry.url)

            expect(urls).toContain(url)
        })
    })

    it('в sitemap только публичные адреса', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch
        jest.spyOn(console, 'error').mockImplementation(() => {})

        const routes = (await sitemap()).map((entry) => entry.url.replace(SITE_URL, '') || '/')

        expect(routes.filter((route) => SURFACE[route] !== 'public')).toEqual([])
    })
})
