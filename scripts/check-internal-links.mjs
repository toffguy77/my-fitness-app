#!/usr/bin/env node
/**
 * Fails when the frontend links to an internal path the App Router does not
 * serve a page for.
 *
 * This exists because `check-api-contract.mjs` guards `/api/...` calls but
 * has never looked at a plain `href` — so `LeadList.tsx` linked
 * `/curator/support/${lead.conversation_id}` for months (curator-lead-workspace
 * task 7 review) while `/curator/support/[id]` was never built: `SupportQueue`
 * opens a thread by component state, not by URL segment. Every click landed a
 * curator on Next's not-found page, and nothing in CI said so.
 *
 * The App Router itself is the golden file: a route exists if and only if
 * some `page.tsx` under `apps/web/src/app` serves it, dynamic segments and
 * route groups included.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, relative, sep } from 'node:path'

const WEB_SRC = 'apps/web/src'
const APP_DIR = join(WEB_SRC, 'app')

function walk(dir, filter, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (entry === '__tests__' || entry === 'node_modules') continue
            walk(full, filter, out)
        } else if (filter(full)) {
            out.push(full)
        }
    }
    return out
}

// --- Every route the App Router actually serves ----------------------------

/**
 * Turns one `page.tsx` path into a regex matching the URLs it answers.
 *
 * `[id]` and `[clientId]` match one path segment; `[...slug]` matches one or
 * more; `[[...slug]]` matches zero or more; a route group `(name)` folds away
 * — it groups files on disk without adding a URL segment. This repo uses none
 * of the catch-all or group forms today, but a link checker that only works
 * until the first one appears is worse than not having it.
 */
function routePatternFor(pageFile) {
    const rel = relative(APP_DIR, pageFile)
    const segments = rel.split(sep).slice(0, -1) // drop page.tsx itself
    const parts = []
    for (const seg of segments) {
        if (/^\(.*\)$/.test(seg)) continue // route group: no URL segment
        const catchAllOptional = seg.match(/^\[\[\.\.\.(\w+)\]\]$/)
        const catchAll = seg.match(/^\[\.\.\.(\w+)\]$/)
        const dynamic = seg.match(/^\[(\w+)\]$/)
        if (catchAllOptional) parts.push('(?:[^/]+(?:/[^/]+)*)?')
        else if (catchAll) parts.push('[^/]+(?:/[^/]+)*')
        else if (dynamic) parts.push('[^/]+')
        else parts.push(seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    }
    const path = '/' + parts.join('/')
    return { path, re: new RegExp('^' + path.replace(/\//g, '\\/') + '$') }
}

const routes = walk(APP_DIR, (f) => f.endsWith(`${sep}page.tsx`) || f.endsWith(`${sep}page.ts`)).map(
    routePatternFor
)

// --- Every internal href the frontend hands to a browser -------------------

function sourceFiles(dir) {
    return walk(dir, (f) => ['.ts', '.tsx'].includes(extname(f)) && !f.includes('.test.'))
}

/**
 * Finds the `{ ... }` object literal that immediately encloses a given
 * position, by brace-balancing outward from it. Used to tell a live
 * navigation target apart from `href: '/workout', isDisabled: true` — a
 * placeholder for a feature that was never built, guarded so clicking it does
 * nothing (`NavigationItem.tsx`: `disabled={isDisabled}`, no real anchor).
 * Checking `href` alone would fail this script on a link nobody can reach.
 */
function enclosingBlock(text, index) {
    let depth = 0
    let start = -1
    for (let i = index - 1; i >= 0; i--) {
        if (text[i] === '}') depth++
        else if (text[i] === '{') {
            if (depth === 0) { start = i; break }
            depth--
        }
    }
    if (start === -1) return ''
    depth = 0
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') {
            depth--
            if (depth === 0) return text.slice(start, i + 1)
        }
    }
    return text.slice(start)
}

// `href="/x"`, `href={'/x'}`, `` href={`/x/${id}`} `` (JSX attribute) and
// `href: '/x'` (a navigation-config object's property, read by router.push or
// by a Link spread from the same object — CuratorFooterNavigation and its
// admin/dashboard siblings both work this way).
const HREF_RE = /href\s*[:=]\s*\{?[`'"]([^`'"]*)[`'"]/g

function isDisabledHere(text, matchIndex) {
    return /isDisabled\s*:\s*true/.test(enclosingBlock(text, matchIndex))
}

/**
 * Resolves a leading `${NAME}` against NAME's value when it is a same-file
 * `const NAME = '...'` or a destructured prop default (`{ basePath =
 * '/curator/content' }`) — the pattern `ArticleList.tsx` uses for
 * `` `${basePath}/new` ``. Without this, any href built from a prop base is
 * invisible to the scan rather than checked: same trade check-api-contract.mjs
 * makes for its own `${BASE}/...` calls.
 */
function localBases(text) {
    const bases = new Map()
    for (const m of text.matchAll(/^[ \t]*const\s+(\w+)\s*=\s*['"`]([^'"`]*)['"`]/gm)) bases.set(m[1], m[2])
    for (const m of text.matchAll(/[{,]\s*(\w+)\s*=\s*['"`]([^'"`]*)['"`]/g)) {
        if (!bases.has(m[1])) bases.set(m[1], m[2])
    }
    return bases
}

function resolveLocalBases(text) {
    const bases = localBases(text)
    if (bases.size === 0) return text
    return text.replace(/`\$\{(\w+)\}/g, (whole, name) => (bases.has(name) ? '`' + bases.get(name) : whole))
}

function normalize(raw) {
    return raw
        .split('#')[0]
        .split('?')[0]
        // `${...}` inside a path is one interpolated segment; a route regex's
        // `[^/]+` matches this literal placeholder exactly as it would match
        // the real value at runtime.
        .replace(/\$\{[^}]*\}/g, 'X')
        .replace(/\/$/, '') || '/'
}

function isExternal(raw) {
    return (
        raw === '' ||
        raw.startsWith('#') ||
        raw.startsWith('http://') ||
        raw.startsWith('https://') ||
        raw.startsWith('//') ||
        raw.startsWith('mailto:') ||
        raw.startsWith('tel:') ||
        raw.startsWith('javascript:') ||
        // `/api/...` is check-api-contract.mjs's job: those are endpoints a
        // page fetches or downloads from, not App Router pages to land on.
        raw.startsWith('/api/')
    )
}

function internalHrefs(files) {
    const found = new Map()
    let scanned = 0
    for (const file of files) {
        const text = resolveLocalBases(readFileSync(file, 'utf8'))
        for (const m of text.matchAll(HREF_RE)) {
            const raw = m[1]
            if (isExternal(raw)) continue
            if (!raw.startsWith('/')) continue // relative/anchor-only, not a route
            if (isDisabledHere(text, m.index)) continue
            scanned++
            const normalized = normalize(raw)
            if (!found.has(normalized)) found.set(normalized, { file, raw })
        }
    }
    return { found, scanned }
}

const { found: hrefs, scanned } = internalHrefs(sourceFiles(WEB_SRC))

// A regex that stopped matching is a silent pass, not a clean one: assert
// this scan actually found the internal links known to exist right now,
// rather than reporting success because it looked at nothing. `scanned`
// counts every match before dedup (many files link `/auth`), which is why the
// floor is well above `hrefs.size`.
if (routes.length < 30) {
    console.error(`Only found ${routes.length} App Router pages under ${APP_DIR} — the page.tsx scan looks broken.`)
    process.exit(1)
}
if (scanned < 50) {
    console.error(`Only found ${scanned} internal href occurrences under ${WEB_SRC} — the href scan looks broken.`)
    process.exit(1)
}

const broken = []
for (const [path, { file, raw }] of hrefs) {
    if (!routes.some((r) => r.re.test(path))) broken.push({ path, raw, file })
}

if (broken.length > 0) {
    console.error('Internal links point at paths the App Router does not serve:\n')
    for (const { raw, file } of broken) console.error(`  ${raw}\n    ${file}`)
    console.error('\nEither add the page under apps/web/src/app/, or fix the link.')
    process.exit(1)
}

console.log(
    `Internal links OK — ${hrefs.size} internal hrefs across ${sourceFiles(WEB_SRC).length} files all resolve to one of ${routes.length} App Router pages.`
)
