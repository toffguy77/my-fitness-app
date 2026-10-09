import { robotsTxt } from '../robots.txt/robotsTxt'
import { GET } from '../robots.txt/route'

/** The file as lines of `Directive: value`, the way a crawler reads it. */
function directives(): { name: string; value: string }[] {
    return robotsTxt()
        .split('\n')
        .filter((line) => line.includes(':'))
        .map((line) => {
            const at = line.indexOf(':')
            return { name: line.slice(0, at).trim().toLowerCase(), value: line.slice(at + 1).trim() }
        })
}

function valuesOf(name: string): string[] {
    return directives().filter((d) => d.name === name).map((d) => d.value)
}

/** Whether any Disallow prefix covers the path — the way a crawler reads it. */
function closed(path: string): boolean {
    return valuesOf('disallow').some((prefix) => path.startsWith(prefix))
}

describe('robots.txt', () => {
    // Яндекс перестал учитывать Host и Crawl-delay в 2018 году, Google не
    // учитывал никогда. Мёртвые директивы вводят в заблуждение того, кто
    // читает файл.
    it('carries no directives search engines ignore', () => {
        expect(valuesOf('host')).toEqual([])
        expect(valuesOf('crawl-delay')).toEqual([])
    })

    // Робот с собственным блоком игнорирует общий: два блока — два списка
    // закрытых разделов, которые однажды разойдутся молча.
    it('has one block of rules, for every crawler', () => {
        expect(valuesOf('user-agent')).toEqual(['*'])
    })

    it('closes the parts of the app that need an account or a one-time link', () => {
        for (const path of [
            '/dashboard', '/food-tracker', '/notifications', '/profile', '/settings', '/chat',
            '/curator', '/admin', '/design-system', '/onboarding', '/forgot-password',
            '/reset-password', '/api/',
        ]) {
            expect(closed(path)).toBe(true)
        }
    })

    it('leaves every public page open', () => {
        for (const path of [
            '/', '/pricing', '/content', '/content/chto-takoe-kbzhu-i-zachem-ego-schitat',
            '/kalkulyator-kbzhu', '/avtor/sergey-burcev', '/legal/terms', '/legal/privacy',
        ]) {
            expect(closed(path)).toBe(false)
        }
    })

    it('names the sitemap by its absolute address', () => {
        expect(valuesOf('sitemap')).toEqual(['https://burcev.team/sitemap.xml'])
    })

    // Адрес из рекламы или рассылки с метками — та же страница. Без
    // Clean-param Яндекс обходит каждую такую копию отдельно.
    it('tells Yandex which parameters change nothing on the page', () => {
        const params = valuesOf('clean-param').flatMap((value) => value.split(' ')[0].split('&'))

        for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid']) {
            expect(params).toContain(name)
        }
    })

    // Строка без пути относится ко всему сайту — так и задумано; путь
    // после пробела сузил бы её незаметно.
    it('applies Clean-param to the whole site', () => {
        for (const value of valuesOf('clean-param')) {
            expect(value).not.toMatch(/\s/)
        }
    })

    it('is served as plain text', async () => {
        const res = GET()

        expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
        expect(await res.text()).toBe(robotsTxt())
    })
})
