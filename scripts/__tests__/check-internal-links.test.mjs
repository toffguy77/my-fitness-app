/**
 * `check-internal-links.mjs` exists because `LeadList.tsx` linked
 * `/curator/support/${lead.conversation_id}` for a full review cycle while
 * `/curator/support/[id]` was never built — `check-api-contract.mjs` only
 * looks at `/api/...` calls, so a plain UI `href` pointing at a 404 page was
 * invisible to every guard in CI.
 *
 * These tests run the script itself, as a subprocess, against small fixture
 * repos — the same discipline `check-api-contract.test.mjs` uses — so a
 * passing test proves the script's actual matching, not a paraphrase of it.
 * Each case builds a throwaway "repo" (an apps/web/src/app tree plus one
 * source file linking into it), runs the real script against it, and reads
 * the real exit code and output.
 *
 * Run: node --test scripts/__tests__/check-internal-links.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-internal-links.mjs')

/**
 * Builds a throwaway repo under a temp dir: enough `page.tsx` files under
 * `apps/web/src/app` to satisfy the script's own "did the scan actually find
 * anything" floor, plus one extra source file with the href under test, then
 * runs the real script with that dir as cwd.
 */
function runAgainst({ pages, sourceFile, sourceText }) {
    const root = mkdtempSync(join(tmpdir(), 'internal-links-'))
    try {
        for (const routeDir of pages) {
            const dir = join(root, 'apps/web/src/app', routeDir)
            mkdirSync(dir, { recursive: true })
            writeFileSync(join(dir, 'page.tsx'), 'export default function Page() { return null }\n')
        }

        const target = join(root, 'apps/web/src', sourceFile)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, sourceText)

        return spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' })
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

// Thirty routes and fifty href occurrences to clear the script's own
// vacuous-scan floors (`routes.length < 30`, `scanned < 50`) without the
// fixture itself becoming the thing under test.
const PAGES = Array.from({ length: 30 }, (_, i) => `filler-${i}`)
function paddingHrefs(count) {
    return Array.from({ length: count }, (_, i) => `<a href="/filler-${i % 30}">x</a>`).join('\n')
}

test('a path-segment href to a route with no page.tsx is caught (the LeadList defect)', () => {
    const result = runAgainst({
        pages: PAGES,
        sourceFile: 'features/curator/components/LeadList.tsx',
        sourceText: [
            "import Link from 'next/link'",
            'export function LeadList({ conversationId }) {',
            '    return (',
            `        <Link href={\`/curator/support/\${conversationId}\`}>Открыть переписку</Link>`,
            '    )',
            '}',
            paddingHrefs(50),
        ].join('\n'),
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /curator\/support\/\$\{conversationId\}/)
    assert.match(result.stderr, /LeadList\.tsx/)
})

test('the same link fixed as a query param resolves, once /curator/support exists', () => {
    const result = runAgainst({
        pages: [...PAGES, 'curator/support'],
        sourceFile: 'features/curator/components/LeadList.tsx',
        sourceText: [
            "import Link from 'next/link'",
            'export function LeadList({ conversationId }) {',
            '    return (',
            `        <Link href={\`/curator/support?conversation=\${conversationId}\`}>Открыть переписку</Link>`,
            '    )',
            '}',
            paddingHrefs(50),
        ].join('\n'),
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /Internal links OK/)
})

test('a dynamic segment route, [id], matches a literal-looking id', () => {
    const result = runAgainst({
        pages: [...PAGES, 'content/[id]'],
        sourceFile: 'features/content/components/FeedCard.tsx',
        sourceText: [
            "import Link from 'next/link'",
            'export function FeedCard({ id }) {',
            '    return <Link href={`/content/${id}`}>x</Link>',
            '}',
            paddingHrefs(50),
        ].join('\n'),
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /Internal links OK/)
})

test('a config href guarded by isDisabled: true is not flagged, even unbuilt', () => {
    const result = runAgainst({
        pages: PAGES,
        sourceFile: 'features/dashboard/utils/navigationConfig.ts',
        sourceText: [
            'export const NAVIGATION_ITEMS = [',
            "    { id: 'workout', href: '/workout', isDisabled: true },",
            ']',
            paddingHrefs(50),
        ].join('\n'),
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /Internal links OK/)
})

test('the same config href is flagged once it is no longer disabled', () => {
    const result = runAgainst({
        pages: PAGES,
        sourceFile: 'features/dashboard/utils/navigationConfig.ts',
        sourceText: [
            'export const NAVIGATION_ITEMS = [',
            "    { id: 'workout', href: '/workout' },",
            ']',
            paddingHrefs(50),
        ].join('\n'),
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /\/workout/)
})

test('/api/... hrefs are left to check-api-contract.mjs, not flagged here', () => {
    const result = runAgainst({
        pages: PAGES,
        sourceFile: 'features/food-tracker/components/ExportLink.tsx',
        sourceText: [
            'export function ExportLink() {',
            '    return <a href="/api/v1/food-tracker/export.csv">Export</a>',
            '}',
            paddingHrefs(50),
        ].join('\n'),
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /Internal links OK/)
})

test('a scan that finds nothing fails loudly instead of passing vacuously', () => {
    // No fixture source file at all beyond the pages themselves: the href
    // scan should find zero occurrences and refuse to call that a pass.
    const root = mkdtempSync(join(tmpdir(), 'internal-links-empty-'))
    try {
        for (const routeDir of PAGES) {
            const dir = join(root, 'apps/web/src/app', routeDir)
            mkdirSync(dir, { recursive: true })
            writeFileSync(join(dir, 'page.tsx'), 'export default function Page() { return null }\n')
        }
        const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' })
        assert.equal(result.status, 1, `expected the script to refuse a vacuous pass:\n${result.stdout}${result.stderr}`)
        assert.match(result.stderr, /looks broken/)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})
