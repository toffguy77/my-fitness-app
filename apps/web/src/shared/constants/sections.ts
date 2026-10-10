/**
 * The screens that need an account. Anything else is open to a visitor.
 *
 * One list for two readers: proxy.ts sends a signed-out visitor from these to
 * sign in, and robots.txt closes them to crawlers. They used to be two lists
 * kept in step by hand, and /menu went live in the first and not the second —
 * Yandex crawled it into a redirect to /auth on every visit.
 *
 * Adding a section here is all it takes for both. Where every route belongs
 * for search is in docs/seo/README.md and app/__tests__/seo-surface.test.ts.
 */
export const PRIVATE_SECTIONS = [
    '/dashboard',
    '/food-tracker',
    '/menu',
    '/chat',
    '/profile',
    '/settings',
    '/notifications',
    '/curator',
    '/admin',
    // '/onboarding' is deliberately absent: the same path serves the guest
    // calculator, which is the product's front door and needs no account. The
    // page itself decides which of the two audiences it is looking at.
] as const

/** Whether the path is one of the sections above or inside one. */
export function inPrivateSection(pathname: string): boolean {
    return PRIVATE_SECTIONS.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
    )
}
