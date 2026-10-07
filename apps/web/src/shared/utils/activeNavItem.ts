/**
 * Which bottom-navigation tab the current address belongs to.
 *
 * The tab follows the address, not the screen that drew the bar: a page that
 * forgot to say which tab it was left the first one lit — every curator screen
 * showed «Клиенты», every admin screen «Обзор», and the client's profile and
 * settings claimed to be the dashboard.
 *
 * The longest matching href wins, on a segment boundary: `/curator/chat/7`
 * belongs to `/curator/chat`, not to `/curator`; `/contentful` belongs to
 * nobody. An address no tab owns (profile, settings) lights none.
 */
export function activeNavItem<Id extends string>(
    pathname: string | null | undefined,
    items: ReadonlyArray<{ id: Id; href?: string }>,
): Id | undefined {
    if (!pathname) return undefined
    let best: { id: Id; length: number } | undefined
    for (const item of items) {
        const href = item.href
        if (!href) continue
        const owns = pathname === href || pathname.startsWith(href.endsWith('/') ? href : `${href}/`)
        if (owns && (!best || href.length > best.length)) best = { id: item.id, length: href.length }
    }
    return best?.id
}
