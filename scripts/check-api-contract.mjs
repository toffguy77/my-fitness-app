#!/usr/bin/env node
/**
 * Fails when the frontend calls an API path the backend does not register.
 *
 * This exists because the password-change feature shipped broken: the handler
 * was implemented, never registered in the router, and the frontend called
 * `/api/auth/change-password` while every route lives under `/api/v1`. Unit
 * tests could not catch it — they mock the API client — and e2e tests were not
 * running in CI.
 *
 * The backend's route table is the golden file the router test maintains.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const GOLDEN = 'apps/api/internal/router/testdata/routes.golden'
const WEB_SRC = 'apps/web/src'

/** Route patterns the backend serves, as a set of regexes matching concrete paths. */
function backendMatchers() {
    return readFileSync(GOLDEN, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const path = line.slice(line.indexOf(' ') + 1)
            // `:param` matches any single non-empty segment.
            const source = path.replace(/:[A-Za-z]+/g, '[^/]+').replace(/\//g, '\\/')
            return { path, re: new RegExp(`^${source}$`) }
        })
}

function sourceFiles(dir) {
    const out = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (entry === '__tests__' || entry === 'node_modules') continue
            out.push(...sourceFiles(full))
        } else if (['.ts', '.tsx'].includes(extname(entry)) && !entry.includes('.test.')) {
            out.push(full)
        }
    }
    return out
}

/**
 * Finds `const NAME = '/api/...'` (and `const NAME = process.env.X || '...'`,
 * whose real value in a normal setup is the fallback literal) declared in a
 * single file, so template literals built as `${NAME}/rest` can be resolved
 * to a real path before matching. This is deliberately file-local and
 * single-level — no project-wide TypeScript parsing.
 */
function localConstants(text) {
    const consts = new Map()
    const re = /^[ \t]*const\s+(\w+)\s*=\s*(?:process\.env\.\w+\s*\|\|\s*)?['"`]([^'"`]*)['"`]/gm
    for (const m of text.matchAll(re)) consts.set(m[1], m[2])
    return consts
}

/**
 * Replaces a template literal's leading `${NAME}` with NAME's resolved value
 * when NAME is a local constant, so calls like `` `${BASE}/leads` `` (a
 * widespread pattern in this codebase) are visible to the scan below instead
 * of silently skipped because the literal does not start with `/api/`.
 */
function resolveLocalBases(text) {
    const consts = localConstants(text)
    if (consts.size === 0) return text
    return text.replace(/`\$\{(\w+)\}/g, (whole, name) => (consts.has(name) ? '`' + consts.get(name) : whole))
}

/**
 * Collapses every `${…}` interpolation to a bare `${}`, matching braces so a
 * nested template literal inside one disappears with it.
 *
 * Without this, a backtick inside an interpolation ends the literal as far as
 * the scan below is concerned, and the path is lost. That is not academic:
 * `${BASE}/support/conversations${query}${status ? `${sep}status=${status}` : ''}`
 * went unchecked while its three siblings in the same file were checked —
 * the one call able to drift unnoticed was the one nobody could see.
 *
 * The shape `/${…}/` survives as `/${}/`, so the path-parameter rule below
 * still recognises it.
 */
function collapseInterpolations(text) {
    let out = ''
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '$' || text[i + 1] !== '{') {
            out += text[i]
            continue
        }
        // Walk to the matching brace, counting nesting. A nested template
        // literal contributes its own braces, and they balance the same way.
        let depth = 0
        let j = i + 1
        for (; j < text.length; j++) {
            if (text[j] === '{') depth++
            else if (text[j] === '}') {
                depth--
                if (depth === 0) break
            }
        }
        // An unbalanced `${` is not ours to interpret — leave it be.
        if (j >= text.length) {
            out += text.slice(i)
            break
        }
        out += '${}'
        i = j
    }
    return out
}

/**
 * Collects `/api/...` literals, turning `${expr}` interpolations into a
 * placeholder segment so they line up with the backend's `:param` patterns.
 */
function frontendCalls(files) {
    const found = new Map()
    for (const file of files) {
        const text = collapseInterpolations(resolveLocalBases(readFileSync(file, 'utf8')))
        for (const m of text.matchAll(/['"`](\/api\/[^'"`\s]*)['"`]/g)) {
            const raw = m[1]
            const normalized = raw
                // A `${...}` delimited by slashes is a path parameter.
                .replace(/\/\$\{[^}]*\}(?=\/|$)/g, '/X')
                // Anything else interpolated is a query string or suffix built
                // at the call site; it is not part of the route pattern.
                .replace(/\$\{[^}]*\}/g, '')
                .replace(/\?.*$/, '')
                .replace(/\/$/, '')
            if (!normalized.startsWith('/api/')) continue
            if (!found.has(normalized)) found.set(normalized, file)
        }
    }
    return found
}

const matchers = backendMatchers()
const calls = frontendCalls(sourceFiles(WEB_SRC))

// Base-URL constants are concatenated with a suffix at the call site, so they
// are prefixes of real routes rather than routes themselves.
const isBaseURL = (path) => matchers.some((m) => m.path.startsWith(path + '/'))

const missing = []
for (const [path, file] of calls) {
    if (isBaseURL(path)) continue
    if (!matchers.some((m) => m.re.test(path))) missing.push({ path, file })
}

if (missing.length > 0) {
    console.error('Frontend calls API paths that the backend does not register:\n')
    for (const { path, file } of missing) console.error(`  ${path}\n    ${file}`)
    console.error('\nEither register the route in apps/api/internal/router/, or fix the path.')
    process.exit(1)
}

console.log(`API contract OK — ${calls.size} frontend paths all resolve to registered routes.`)
