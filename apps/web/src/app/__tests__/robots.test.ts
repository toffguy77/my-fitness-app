import robots from '../robots'

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[]; crawlDelay?: number }

function rulesOf(): Rule[] {
    const { rules } = robots()
    return Array.isArray(rules) ? rules : [rules]
}

function list(value: string | string[] | undefined): string[] {
    return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

/** Whether any Disallow prefix covers the path — the way a crawler reads it. */
function closed(path: string): boolean {
    return rulesOf().some((rule) => list(rule.disallow).some((prefix) => path.startsWith(prefix)))
}

describe('robots.txt', () => {
    // Яндекс перестал учитывать Host и Crawl-delay в 2018 году, Google не
    // учитывал никогда. Мёртвые директивы вводят в заблуждение того, кто
    // читает файл.
    it('carries no directives search engines ignore', () => {
        const result = robots()

        expect(result.host).toBeUndefined()
        for (const rule of rulesOf()) {
            expect(rule.crawlDelay).toBeUndefined()
        }
    })

    // Робот с собственным блоком игнорирует общий: два блока — два списка
    // закрытых разделов, которые однажды разойдутся молча.
    it('has one block of rules, for every crawler', () => {
        const rules = rulesOf()

        expect(rules).toHaveLength(1)
        expect(rules[0].userAgent).toBe('*')
    })

    it('closes the parts of the app that need an account or a one-time link', () => {
        for (const path of [
            '/dashboard', '/food-tracker', '/notifications', '/profile', '/settings', '/chat',
            '/curator', '/admin', '/onboarding', '/forgot-password', '/reset-password', '/api/',
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
        expect(robots().sitemap).toBe('https://burcev.team/sitemap.xml')
    })
})
